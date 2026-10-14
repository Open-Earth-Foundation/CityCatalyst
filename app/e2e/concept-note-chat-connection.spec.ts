import { expect, test, type Page, type Route } from "@playwright/test";
import type { CityDashboardResponse } from "@/util/types";
import { skipCookieConsent } from "./helpers";

test.beforeEach(({ context }) => skipCookieConsent(context));

// Real workspace UI and chat hook with scripted chat responses, so every
// failure mode is deterministic. Climate Advisor tests cover retry storage.
const cityId = "f8063baa-e795-4ffb-a507-7a2ea6090eae";
const runId = "e7cca88d-de54-4050-88ed-d6b39790853c";
const threadId = "30000000-0000-4000-8000-000000000001";

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

async function openWorkspace(page: Page, replies: ChatReply[]) {
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
      return route.fulfill({ json: { messages: [] } });
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

async function ask(page: Page, text: string) {
  const input = page.getByTestId("concept-note-chat-input");
  await expect(input).toBeEnabled();
  await input.fill(text);
  await input.press("Enter");
}

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
  // The chat waits 45 s for any byte, heartbeats included.
  test.setTimeout(120_000);
  await openWorkspace(page, [stalled]);

  await ask(page, "Summarise the financing plan.");
  await expect(badge(page)).toHaveAttribute("data-state", "connected");

  await expect(badge(page)).toHaveAttribute("data-state", "error", {
    timeout: 60_000,
  });
  await expect(chatError(page)).toContainText("stopped responding");
});
