import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { CityDashboardResponse } from "@/util/types";
import type { DocumentWorkspace } from "@/util/document-workspace";
import { skipCookieConsent } from "./helpers";

test.beforeEach(({ context }) => skipCookieConsent(context));

// Real workspace UI and chat hook with scripted chat responses, so every
// failure mode is deterministic. Climate Advisor tests cover retry storage.
const cityId = "f8063baa-e795-4ffb-a507-7a2ea6090eae";
const runId = "e7cca88d-de54-4050-88ed-d6b39790853c";
const threadId = "30000000-0000-4000-8000-000000000001";
const questionId = "40000000-0000-4000-8000-000000000001";

type ChatReply = (route: Route) => Promise<void> | void;

function sse(...events: Array<[string, unknown]>): string {
  return events
    .map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
}

const stream =
  (body: string): ChatReply =>
  (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body,
    });
const answer = (text: string) =>
  stream(sse(["message", { content: text, index: 0 }], ["done", { ok: true }]));
// What Climate Advisor sends when the model provider fails mid-turn.
const providerFailure = stream(
  sse(
    ["error", { message: "An internal error has occurred." }],
    ["done", { ok: false, history_saved: false, error: "Streaming error" }],
  ),
);
const unreachable: ChatReply = (route) =>
  route.fulfill({ status: 502, json: { message: "Chat service unavailable" } });
const interrupted = stream(": keep-alive\n\nevent: progress\ndata: {}\n\n");
// Leave the request open with no bytes, like a frozen connection.
const stalled: ChatReply = () => new Promise(() => {});

type HistoryMessage = {
  message_id: string;
  role: "assistant" | "user";
  text: string;
  choices?: string[];
};

async function openWorkspace(
  page: Page,
  replies: ChatReply[],
  history: HistoryMessage[] = [],
) {
  const chatRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/auth/session/**", (route) =>
    route.fulfill({
      json: {
        user: { id: "owner", name: "Reviewer", email: "review@example.test" },
        expires: "2099-01-01T00:00:00Z",
      },
    }),
  );
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, "");
    if (path === "/api/v1/chat/messages" && request.method() === "POST") {
      chatRequests.push(request.postDataJSON());
      const reply = replies.shift();
      if (!reply) throw new Error("Unexpected chat message");
      return reply(route);
    }
    if (path === `/api/v1/chat/threads/${threadId}/messages`)
      return route.fulfill({ json: { messages: history } });
    if (path === "/api/v1/user")
      return route.fulfill({
        json: {
          data: {
            userId: "owner",
            name: "Reviewer",
            preferredLanguage: "en",
            role: "user",
          },
        },
      });
    if (path === "/api/v1/user/access-status")
      return route.fulfill({
        json: { data: { isCollaborator: true, organizationId: "test" } },
      });
    if (path === `/api/v1/city/${cityId}`)
      return route.fulfill({
        json: { data: { cityId, name: "Krakow", country: "Poland" } },
      });
    if (path === `/api/v1/city/${cityId}/dashboard`)
      return route.fulfill({
        json: {
          data: {
            city: { cityId, name: "Krakow", country: "Poland" },
            inventories: [],
            population: null,
            organization: null,
            widgets: { ghgi: null, hiap: null, ccra: null },
          } satisfies CityDashboardResponse,
        },
      });
    if (path === `/api/v1/city/${cityId}/years`)
      return route.fulfill({ json: { data: { city: { cityId }, years: [] } } });
    if (path === "/api/v1/user/projects") return route.fulfill({ json: [] });
    if (path.includes("/modules/") && path.endsWith("/access"))
      return route.fulfill({ json: { data: { hasAccess: true } } });
    if (!path.includes(`/concept-notes/${runId}`))
      return route.fulfill({ json: { data: [] } });
    if (path.endsWith("/workspace"))
      return route.fulfill({
        json: {
          revision: 1,
          setup: null,
          points: [],
          needs: [],
          overview: {
            required_total: 0,
            required_covered: 0,
            optional_total: 0,
            optional_covered: 0,
            waiting_count: 0,
            next_steps: [],
          },
          export_eligibility: {
            working: false,
            final: false,
            blockers: [],
            workspace_revision: 1,
          },
        } satisfies DocumentWorkspace,
      });
    if (path.endsWith("/context-bundle/refresh"))
      return route.fulfill({ json: { run_id: runId, status: "current" } });
    if (path.endsWith("/draft"))
      return route.fulfill({
        json: {
          run_id: runId,
          status: "not_started",
          total_chapters: 0,
          completed_chapters: 0,
          chapters: [],
        },
      });
    if (path.endsWith("/application-context"))
      return route.fulfill({
        json: {
          run_id: runId,
          city_id: cityId,
          funder: null,
          opportunity: null,
          template: null,
          included_sources: { city: true, project: true },
        },
      });
    if (path.endsWith("/edit-proposals")) return route.fulfill({ json: [] });
    if (path.endsWith(`/${runId}`))
      return route.fulfill({
        json: {
          run_id: runId,
          city_id: cityId,
          user_id: "owner",
          name: "Chat connection test",
          status: "active",
          workflow_step: "assembling_context",
          thread_id: threadId,
          uploads: [],
          progress_summary: {
            context_bundle: { status: "ready", ready_sources: 1 },
          },
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto(`/en/cities/${cityId}/concept-notes/${runId}/`);
  return { chatRequests };
}

const badge = (page: Page) =>
  page.getByTestId("concept-note-connection-status");
const chatError = (page: Page) => page.getByTestId("concept-note-chat-error");

const questionText = "Which opening should we use?";
const choices = [
  "Lead with accessibility",
  "Lead with reliable public transport",
];
const question = (options = choices) =>
  stream(
    sse(
      ["message", { content: questionText, index: 0 }],
      ["tool_result", { name: "concept_note_ask_question", options }],
      [
        "done",
        { ok: true, history_saved: true, assistant_message_id: questionId },
      ],
    ),
  );

async function ask(page: Page, text: string) {
  const input = page.getByTestId("concept-note-chat-input");
  await expect(input).toBeEnabled();
  await input.fill(text);
  await input.press("Enter");
}

test("long suggested answers keep the question visible on mobile and preserve paragraphs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const paragraph =
    "The proposed tram extension would connect residential areas with jobs and essential services through reliable public transport. Its benefits need to be supported by evidence, with clear delivery responsibilities and milestones.";
  const options = [
    `${paragraph}\n\nThe budget and funding sources remain to be confirmed.`,
    `For a community audience: ${paragraph}\n\nLocations and dates are provisional.`,
    `For a technical audience: ${paragraph}\n\nNo quantified benefits are assumed.`,
  ];
  await openWorkspace(page, [question(options)]);
  await page.getByRole("button", { name: "Clima", exact: true }).click();
  await ask(page, "Give me three complete alternative introductions.");

  const card = page.getByTestId("concept-note-chat-question");
  await expect(card).toContainText(questionText);
  await expect
    .poll(async () => {
      const box = await card.boundingBox();
      const scroll = await page
        .getByTestId("concept-note-chat-scroll")
        .boundingBox();
      return Boolean(
        box && scroll && box.y >= scroll.y && box.y < scroll.y + 30,
      );
    })
    .toBe(true);
  const first = card.getByRole("button", { name: options[0] });
  await expect(first.locator("span").nth(1)).toHaveCSS(
    "white-space",
    "pre-wrap",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
});

test("a rejected choice reopens the card without a false selection and preserves custom paragraphs", async ({
  page,
}) => {
  const rejected: ChatReply = (route) =>
    route.fulfill({
      status: 403,
      json: { message: "Forbidden" },
    });
  const { chatRequests } = await openWorkspace(page, [
    question(),
    rejected,
    answer("Custom answer received."),
  ]);
  await ask(page, "Which opening is better?");
  const card = page.getByTestId("concept-note-chat-choices");
  const first = card.getByRole("button", { name: choices[0] });
  await first.click();
  await expect(chatError(page)).toContainText("permission");
  await expect(first).toBeEnabled();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(
    page
      .getByTestId("concept-note-chat-scroll")
      .getByText(choices[0], { exact: true }),
  ).toHaveCount(1);

  const custom = card.getByRole("textbox", { name: "Write your own answer…" });
  await custom.fill("Combine both approaches.");
  await custom.press("Shift+Enter");
  await expect(custom).toHaveValue("Combine both approaches.\n");
  expect(chatRequests).toHaveLength(2);
  // Filling the full multiline answer also verifies the exact transport payload.
  const text = "Combine both approaches.\nKeep funding provisional.";
  await custom.fill(text);
  await custom.press("Enter");
  await expect(
    page.getByText("Custom answer received.", { exact: true }),
  ).toBeVisible();
  expect(chatRequests.at(-1)?.content).toBe(text);
  await expect(page.getByTestId("concept-note-chat-input")).toBeFocused();
});

test("saved question history restores the selected answer and keeps old options locked", async ({
  page,
}) => {
  const history: HistoryMessage[] = [
    { message_id: "question", role: "assistant", text: questionText, choices },
  ];
  const { chatRequests } = await openWorkspace(
    page,
    [answer("I will use that opening.")],
    history,
  );
  const first = page
    .getByTestId("concept-note-chat-choices")
    .getByRole("button", { name: choices[0] });
  await expect(first).toBeEnabled();
  await first.focus();
  await first.press("Enter");
  await expect(
    page.getByText("I will use that opening.", { exact: true }),
  ).toBeVisible();
  expect(chatRequests).toHaveLength(1);
  await expect(page.getByTestId("concept-note-chat-input")).toBeFocused();

  history.push(
    { message_id: "reply", role: "user", text: choices[0] },
    {
      message_id: "followup",
      role: "assistant",
      text: "I will use that opening.",
    },
  );
  await page.reload();
  await expect(first).toBeDisabled();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("textbox", { name: "Write your own answer…" }),
  ).toHaveCount(0);
});

test("connects after the history loads and stays connected through a reply", async ({
  page,
}) => {
  await openWorkspace(page, [answer("The budget is 2M EUR.")]);
  await expect(badge(page)).toHaveAttribute("data-state", "connected");

  await ask(page, "What is the budget?");

  await expect(page.getByText("The budget is 2M EUR.")).toBeVisible();
  await expect(badge(page)).toHaveAttribute("data-state", "connected");
});

test("shows a connection problem for an error inside a 200 stream and recovers on retry", async ({
  page,
}) => {
  const { chatRequests } = await openWorkspace(page, [
    providerFailure,
    answer("Recovered answer."),
  ]);

  await ask(page, "What is the budget?");

  await expect(badge(page)).toHaveAttribute("data-state", "error");
  await expect(badge(page)).toHaveText("Connection problem");
  await expect(chatError(page)).toContainText("Clima could not answer");

  await page.getByTestId("concept-note-chat-retry").click();

  await expect(page.getByText("Recovered answer.")).toBeVisible();
  await expect(badge(page)).toHaveAttribute("data-state", "connected");
  await expect(chatError(page)).toBeHidden();
  expect(chatRequests.at(-1)).toMatchObject({
    content: "What is the budget?",
    options: { concept_note_turn: "retry" },
  });
  await expect(page.getByText("What is the budget?")).toHaveCount(1);
});

test("names an unreachable service and reconnects with the next message", async ({
  page,
}) => {
  await openWorkspace(page, [unreachable, answer("Back online.")]);

  await ask(page, "Hello?");

  await expect(badge(page)).toHaveAttribute("data-state", "error");
  await expect(chatError(page)).toContainText("can't be reached");

  await ask(page, "Are you there?");

  await expect(page.getByText("Back online.")).toBeVisible();
  await expect(badge(page)).toHaveAttribute("data-state", "connected");
});

test("treats a stream that ends without completing as a failure", async ({
  page,
}) => {
  await openWorkspace(page, [interrupted]);

  await ask(page, "Summarise the plan.");

  await expect(badge(page)).toHaveAttribute("data-state", "error");
  await expect(page.getByTestId("concept-note-chat-retry")).toBeVisible();
});

test("times out a stalled stream instead of thinking forever", async ({
  page,
}) => {
  // The chat waits 45 s for any byte, heartbeats included. Jump the page clock
  // past that instead of waiting it out in real time.
  await page.clock.install();
  await openWorkspace(page, [stalled]);

  await ask(page, "Summarise the financing plan.");
  await expect(badge(page)).toHaveAttribute("data-state", "connected");

  await page.clock.fastForward(45_000);
  await expect(badge(page)).toHaveAttribute("data-state", "error");
  await expect(chatError(page)).toContainText("stopped responding");
});

test("shows a static visual without letting it reach the network", async ({
  page,
}) => {
  // Anything the visual sends out, by script, refresh, resource or link, lands here.
  const leaks: string[] = [];
  const listener = createServer((request, response) => {
    leaks.push(request.url ?? "");
    response.end();
  });
  await new Promise<void>((resolve) =>
    listener.listen(0, "127.0.0.1", resolve),
  );
  const out = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
  const html = `<!doctype html><html><head>
<meta http-equiv="refresh" content="0;url=${out}/refresh">
<link rel="stylesheet" href="${out}/css">
<style>body{margin:0;font:14px sans-serif}</style></head><body>
<script>location.href = "${out}/script?note=" + document.title;</script>
<svg viewBox="0 0 100 40" width="100%" data-testid="chart">
<rect width="60" height="20" fill="#2e7d32"></rect>
<a href="${out}/svg-link"><set attributeName="href" to="${out}/svg-set"></set>
<text x="2" y="35">Energy 60%</text></a></svg>
<img src="${out}/img" alt="">
<div style="background:url(${out}/bg);height:4px"></div>
<a href="${out}/link">Open the source</a>
</body></html>`;
  const visualReply = stream(
    sse(
      ["message", { content: "Here is the chart.", index: 0 }],
      [
        "done",
        {
          ok: true,
          tools_used: [
            {
              id: "call-1",
              name: "concept_note_render_visual",
              status: "success",
              arguments: { title: "Emissions by sector", html },
              result_json: {
                action: "concept_note.visual.render",
                success: true,
                data: { title: "Emissions by sector", html_chars: html.length },
                error_code: null,
              },
            },
          ],
        },
      ],
    ),
  );

  try {
    await openWorkspace(page, [visualReply]);
    await ask(page, "Chart the emissions.");

    await expect(page.getByText("Here is the chart.")).toBeVisible();
    // Give any script, refresh or resource time to arrive.
    await page.waitForTimeout(1_500);
    expect(leaks).toEqual([]);

    const visual = page
      .getByTestId("concept-note-chat-visual")
      .locator("iframe")
      .contentFrame();
    await expect(visual.getByTestId("chart")).toBeVisible();
    await visual.getByText("Energy 60%").click();
    await visual.getByText("Open the source").click();
    await page.waitForTimeout(1_500);
    expect(leaks).toEqual([]);
    await expect(visual.getByTestId("chart")).toBeVisible();
  } finally {
    listener.close();
  }
});

test("an unsent inline draft survives clicking an option and recovers without an extra request", async ({
  page,
}) => {
  const history: HistoryMessage[] = [
    { message_id: questionId, role: "assistant", text: questionText, choices },
  ];
  const { chatRequests } = await openWorkspace(
    page,
    [answer("Choice accepted.")],
    history,
  );
  const custom = page.getByRole("textbox", { name: "Write your own answer…" });
  await custom.fill("Unsent paragraph.\nKeep this detail.");
  await page
    .getByTestId("concept-note-chat-input")
    .fill("Existing composer draft");
  await page.getByRole("button", { name: choices[0], exact: true }).click();
  await expect(
    page.getByText("Choice accepted.", { exact: true }),
  ).toBeVisible();
  const saved = page.getByTestId("concept-note-saved-answer-draft");
  await expect(saved).toContainText("Unsent paragraph.");
  await saved.getByRole("button", { name: "Use draft", exact: true }).click();
  await expect(page.getByTestId("concept-note-chat-input")).toHaveValue(
    "Existing composer draft\n\nUnsent paragraph.\nKeep this detail.",
  );
  await expect(page.getByTestId("concept-note-chat-input")).toBeFocused();
  expect(chatRequests).toHaveLength(1);
  expect(chatRequests[0]).toMatchObject({
    context: { concept_note_question_message_id: questionId },
  });
  await page.screenshot({
    path: test.info().outputPath("inline-draft-recovered.png"),
  });
});

test("an unsent inline draft survives sending a different main message", async ({
  page,
}) => {
  const history: HistoryMessage[] = [
    { message_id: questionId, role: "assistant", text: questionText, choices },
  ];
  const { chatRequests } = await openWorkspace(
    page,
    [answer("Main message accepted.")],
    history,
  );
  await page
    .getByRole("textbox", { name: "Write your own answer…" })
    .fill("Unsent inline detail");
  await ask(page, "Another main message");
  await expect(
    page.getByText("Main message accepted.", { exact: true }),
  ).toBeVisible();
  await page
    .getByTestId("concept-note-saved-answer-draft")
    .getByRole("button", { name: "Use draft", exact: true })
    .click();
  await expect(page.getByTestId("concept-note-chat-input")).toHaveValue(
    "Unsent inline detail",
  );
  expect(chatRequests).toHaveLength(1);
});

test("a stale answer reloads current history without retrying or losing either draft", async ({
  page,
}) => {
  const latestId = "40000000-0000-4000-8000-000000000002";
  const history: HistoryMessage[] = [
    { message_id: questionId, role: "assistant", text: questionText, choices },
  ];
  const rejected: ChatReply = (route) => {
    history.splice(0, history.length, {
      message_id: latestId,
      role: "assistant",
      text: "Which source should we use?",
      choices: ["City climate plan", "Feasibility report"],
    });
    return route.fulfill({
      status: 409,
      json: {
        code: "concept_note_question_stale",
        message: "Question changed",
      },
    });
  };
  const { chatRequests } = await openWorkspace(
    page,
    [rejected, answer("Fresh choice accepted.")],
    history,
  );
  const draft = "Custom answer written in the old tab";
  await page
    .getByRole("textbox", { name: "Write your own answer…" })
    .fill(draft);
  await page
    .getByTestId("concept-note-chat-input")
    .fill("Keep this separate main draft");
  await page.getByRole("button", { name: "Send answer", exact: true }).click();
  await expect(
    page.getByText("Which source should we use?", { exact: true }),
  ).toBeVisible();
  await expect(chatError(page)).toContainText("another tab");
  await expect(page.getByTestId("concept-note-chat-retry")).toHaveCount(0);
  await expect(
    page.getByTestId("concept-note-saved-answer-draft"),
  ).toContainText(draft);
  await expect(page.getByTestId("concept-note-chat-input")).toHaveValue(
    "Keep this separate main draft",
  );
  expect(chatRequests).toHaveLength(1);
  expect(chatRequests[0]).toMatchObject({
    context: { concept_note_question_message_id: questionId },
  });
  await page.screenshot({
    path: test.info().outputPath("stale-answer-resynced-with-drafts.png"),
  });
  await page
    .getByRole("button", { name: "City climate plan", exact: true })
    .click();
  await expect(
    page.getByText("Fresh choice accepted.", { exact: true }),
  ).toBeVisible();
  await expect(chatError(page)).toHaveCount(0);
  expect(chatRequests.at(-1)).toMatchObject({
    context: { concept_note_question_message_id: latestId },
  });
});

// Exact eight-title options from the real model stress run, replayed to isolate UI selection.
const eightTitles = [
  "Warm Schools",
  "Comfortable Public Buildings",
  "Heat Smart Sampleton",
  "Better Buildings, Better Comfort",
  "Sampleton Retrofit Pilot",
  "Ten Buildings Transformed",
  "Efficient Heat, Shared Comfort",
  "Public Buildings Renewed",
];
test("eight suggested titles remain enabled and H sends its full title", async ({
  page,
}) => {
  const { chatRequests } = await openWorkspace(page, [
    question(eightTitles),
    answer("Title accepted."),
  ]);
  await ask(page, "Give me eight project titles to choose from.");
  const card = page.getByTestId("concept-note-chat-choices");
  const options = card.locator("button[aria-pressed]");
  await expect(options).toHaveCount(8);
  for (const [index, title] of eightTitles.entries()) {
    await expect(options.nth(index)).toBeEnabled();
    await expect(options.nth(index).locator("span").first()).toHaveText(
      String.fromCharCode(65 + index),
    );
    await expect(options.nth(index)).toHaveAccessibleName(title);
  }
  await card.getByRole("button", { name: eightTitles[7], exact: true }).click();
  await expect(
    page.getByText("Title accepted.", { exact: true }),
  ).toBeVisible();
  expect(chatRequests.at(-1)).toMatchObject({
    content: eightTitles[7],
    context: { concept_note_question_message_id: questionId },
  });
});
