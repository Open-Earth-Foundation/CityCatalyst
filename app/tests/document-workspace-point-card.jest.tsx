/** @jest-environment jsdom */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  DocumentWorkspace,
  DocumentWorkspacePoint,
} from "@/util/document-workspace";

const save = jest.fn<(payload: unknown) => void>();
const ask = jest.fn();
const addSource = jest.fn();
let questionData:
  | { why_asking: string; questions: { question: string; options: string[] }[] }
  | undefined;
let commandError: { status: number; data?: { title: string } } | undefined;
const reload = jest.fn<() => Promise<void>>();
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.unstable_mockModule("@/services/document-workspace-api", () => ({
  documentWorkspaceApi: {
    useCommandDocumentPointMutation: () => [
      (payload: unknown) => {
        save(payload);
        return { unwrap: async () => ({}) };
      },
      {
        isLoading: false,
        isError: Boolean(commandError),
        error: commandError,
        reset: () => {
          commandError = undefined;
        },
      },
    ],
    useGetDocumentPointQuestionMutation: () => [ask, { data: questionData }],
    useLazyGetDocumentWorkspaceQuery: () => [reload, {}],
  },
}));
let DocumentPointCard: typeof import("@/components/ConceptNoteWorkspace/document-point-card").DocumentPointCard;
let WorkspaceOverview: typeof import("@/components/ConceptNoteWorkspace/document-workspace-panels").WorkspaceOverview;
let root: Root;
let container: HTMLDivElement;
const point: DocumentWorkspacePoint = {
  point_id: "p1",
  key: "project.cost",
  label: "Project cost",
  description: "Total EUR",
  kind: "fact",
  answer_type: "number",
  required: true,
  allow_assumption: true,
  allow_not_applicable: false,
  version: 7,
  status: "needs_confirmation",
  value: null,
  chapter_refs: [],
  candidates: [
    {
      candidate_id: "c1",
      value: 100,
      status: "pending",
      citations: [
        {
          source_label: "Budget.pdf",
          page_number: 3,
          quote: "Total project cost: EUR 100",
          source_anchor: null,
        },
      ],
    },
  ],
  task: null,
  freshness: "missing",
};
const originalClone = globalThis.structuredClone;
beforeAll(async () => {
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ DocumentPointCard } =
    await import("@/components/ConceptNoteWorkspace/document-point-card"));
  ({ WorkspaceOverview } =
    await import("@/components/ConceptNoteWorkspace/document-workspace-panels"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalClone;
});
beforeEach(() => {
  save.mockClear();
  addSource.mockClear();
  ask.mockClear();
  questionData = undefined;
  commandError = undefined;
  reload.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(nextPoint = point, sourceBusy = false) {
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <DocumentPointCard
          point={nextPoint}
          runId="run-1"
          lng="en"
          onAddSource={addSource}
          sourceBusy={sourceBusy}
        />
      </ChakraProvider>,
    ),
  );
}
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  )!;
async function type(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("shows the exact source and confirms the candidate through the versioned command", async () => {
  await render();
  expect(container.textContent).toContain("Total project cost: EUR 100");
  expect(container.textContent).toContain("Budget.pdf");
  await act(async () => button("workspace-confirm").click());
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      runId: "run-1",
      pointKey: "project.cost",
      command: expect.objectContaining({
        command: "confirm_candidate",
        candidate_id: "c1",
        expected_version: 7,
        idempotency_key: expect.any(String),
      }),
    }),
  );
});
it("keeps each narrative item next to its own supporting quotation and page", async () => {
  const quote = point.candidates[0].citations[0];
  const candidate = {
    ...point.candidates[0],
    value: "• Retrofit the roof.\n• Install meters.",
    citations: [
      {
        ...quote,
        quote: "Pierwszy cytat",
        page_number: 12,
        component_values: ["Retrofit the roof."],
      },
      {
        ...quote,
        quote: "Drugi cytat",
        page_number: 18,
        component_values: ["Install meters."],
      },
    ],
  };
  await render({
    ...point,
    answer_type: "multiline",
    candidates: [candidate],
  });
  const evidence = Array.from(container.querySelectorAll("details")).find(
    (detail) =>
      detail
        .querySelector(":scope > summary")
        ?.textContent?.includes("validation-check-evidence"),
  );
  expect(evidence).toBeDefined();
  const first = evidence!.querySelector("blockquote")!.parentElement!;
  expect(first.textContent).toContain("Retrofit the roof.");
  expect(first.textContent).toContain("Pierwszy cytat");
  expect(first.textContent).not.toContain("Drugi cytat");
  expect(evidence!.querySelectorAll("blockquote")).toHaveLength(2);
});
it("submits zero as a number and requires an explanation for assumptions", async () => {
  await render();
  expect(button("workspace-save-assumption").disabled).toBe(true);
  await type(container.querySelector('input[type="number"]')!, "0");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({ command: "answer", value: 0 }),
    }),
  );
  await type(
    container.querySelector("textarea")!,
    "Finance estimate pending approval",
  );
  expect(button("workspace-save-assumption").disabled).toBe(false);
});
it("parks a point with the actual requested information and contact", async () => {
  await render();
  await act(async () => button("workspace-park").click());
  expect(button("workspace-save-waiting").disabled).toBe(true);
  const inputs = container.querySelectorAll("input");
  await type(inputs[inputs.length - 1], "City Treasurer");
  const fields = container.querySelectorAll("textarea");
  await type(fields[fields.length - 1], "Approved financing plan");
  await act(async () => button("workspace-save-waiting").click());
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({
        command: "park",
        waiting_for: "City Treasurer",
        requested_information: "Approved financing plan",
      }),
    }),
  );
});

it("preserves a typed answer when reloading after a stale-version rejection", async () => {
  commandError = { status: 409 };
  await render();
  await type(container.querySelector('input[type="number"]')!, "250");
  expect(button("workspace-save-answer").disabled).toBe(true);
  await act(async () => button("workspace-reload").click());
  await render({ ...point, version: 8, value: 150, status: "answered" });
  expect(
    container.querySelector<HTMLInputElement>('input[type="number"]')!.value,
  ).toBe("250");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({
        command: "correct",
        value: 250,
        expected_version: 8,
      }),
    }),
  );
});

it("offers trusted template choices without requesting model guidance or preselecting an answer", async () => {
  await render({
    ...point,
    answer_type: "choice",
    choices: ["Public delivery", "Joint venture"],
    candidates: [],
    status: "missing",
    value: null,
  });
  const select = container.querySelector("select")!;
  expect(select).not.toBeNull();
  expect([...select.options].map((option) => option.value)).toEqual([
    "",
    "Public delivery",
    "Joint venture",
  ]);
  expect(select.value).toBe("");
  expect(button("workspace-save-answer").disabled).toBe(true);
  expect(ask).not.toHaveBeenCalled();
  await act(async () => {
    select.value = "Joint venture";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({
        command: "answer",
        value: "Joint venture",
        expected_version: 7,
      }),
    }),
  );
});

it("does not save undeclared choice values or invent options when the schema is unavailable", async () => {
  await render({
    ...point,
    answer_type: "choice",
    choices: ["Public delivery"],
    value: "Model invented option",
    candidates: [],
  });
  expect(container.querySelector("select")!.value).toBe("");
  expect(button("workspace-save-answer").disabled).toBe(true);
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(save).not.toHaveBeenCalled();
  await render({
    ...point,
    answer_type: "choice",
    choices: [],
    value: null,
    candidates: [],
  });
  expect(container.querySelector("select")!.disabled).toBe(true);
  expect(container.textContent).toContain("workspace-choices-unavailable");
});

it("renders model options as draft input without accepting a value automatically", async () => {
  questionData = {
    why_asking: "Choose a starting estimate",
    questions: [
      { question: "Which budget estimate?", options: ["100", "250"] },
    ],
  };
  await render({ ...point, candidates: [] });
  expect(container.textContent).toContain("Which budget estimate?");
  await act(async () => button("250").click());
  expect(
    container.querySelector<HTMLInputElement>('input[type="number"]')!.value,
  ).toBe("250");
  expect(save).not.toHaveBeenCalled();
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({ value: 250 }),
    }),
  );
});

it("keeps model suggestions outside declared choices disabled", async () => {
  questionData = {
    why_asking: "Compare delivery models",
    questions: [
      { question: "Which option?", options: ["Allowed", "Invented"] },
    ],
  };
  await render({
    ...point,
    answer_type: "choice",
    choices: ["Allowed"],
    candidates: [],
  });
  expect(button("Invented").disabled).toBe(true);
  await act(async () => button("Allowed").click());
  expect(container.querySelector("select")!.value).toBe("Allowed");
  expect(save).not.toHaveBeenCalled();
});

it("explains that another upload is busy instead of silently dropping Add evidence", async () => {
  await render(point, true);
  expect(button("workspace-evidence-uploading").disabled).toBe(true);
  await act(async () => button("workspace-evidence-uploading").click());
  expect(addSource).not.toHaveBeenCalled();
});

it("shows an accepted waiting point in Overview without claiming nothing is waiting", async () => {
  const acceptedWaiting = {
    ...point,
    status: "answered",
    value: 100,
    task: {
      status: "waiting",
      waiting_for: "Treasurer",
      requested_information: "Updated approval",
      note: null,
    },
  } as DocumentWorkspacePoint;
  const workspace = {
    revision: 1,
    points: [acceptedWaiting],
    needs: [],
    setup: { ready: true, name: "City template" },
    overview: {
      required_total: 1,
      required_covered: 1,
      optional_total: 0,
      optional_covered: 0,
      waiting_count: 1,
      next_steps: [],
    },
    export_eligibility: {
      working: true,
      final: false,
      blockers: [],
      workspace_revision: 1,
    },
  } as DocumentWorkspace;
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <WorkspaceOverview
          workspace={workspace}
          lng="en"
          chapters={[]}
          onSelectPoint={() => {}}
          onOpenDraft={() => {}}
        />
      </ChakraProvider>,
    ),
  );
  expect(container.textContent).toContain("Treasurer");
  expect(container.textContent).toContain("Updated approval");
  expect(container.textContent).not.toContain("workspace-nothing-waiting");
  expect(container.textContent).toContain("workspace-known-facts");
});

it.each(["not_applicable", "assumption", "answered"] as const)(
  "shows the saved basis for %s after remount without relying on the editable reason field",
  async (status) => {
    const savedPoint: DocumentWorkspacePoint = {
      ...point,
      status,
      value: status === "not_applicable" ? null : 100,
      candidates: [],
      task: {
        status: "done",
        waiting_for: null,
        requested_information: null,
        note: "Finance confirmed: no grant applies to this phase.",
      },
    };
    await render(savedPoint);
    const accepted = () =>
      container.querySelector(
        '[data-testid="document-point-accepted-answer"]',
      )!;
    expect(accepted().textContent).toContain("workspace-accepted-basis");
    expect(accepted().textContent).toContain(savedPoint.task!.note);
    if (status === "not_applicable") {
      expect(accepted().textContent).toContain("workspace-not-applicable");
      expect(accepted().textContent).not.toContain("workspace-no-value");
    }
    expect(container.querySelector("form")).toBeNull();
    await act(async () => button("workspace-edit-answer").click());
    await type(
      container.querySelector("textarea")!,
      "Unsaved replacement reason",
    );
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(savedPoint);
    expect(accepted().textContent).toContain(savedPoint.task!.note);
    expect(accepted().textContent).not.toContain("Unsaved replacement reason");
    expect(container.querySelector("form")).toBeNull();
    await act(async () => button("workspace-edit-answer").click());
    expect(container.querySelector("textarea")!.value).toBe("");
    expect(save).not.toHaveBeenCalled();
  },
);

it("keeps the immutable accepted basis after parking and remounting, rather than replacing it with a task note", async () => {
  const savedPoint: DocumentWorkspacePoint = {
    ...point,
    status: "assumption",
    value: 100,
    candidates: [],
    accepted_reason: "Finance estimate approved as a planning assumption.",
    task: {
      status: "done",
      waiting_for: null,
      requested_information: null,
      note: "Finance estimate approved as a planning assumption.",
    },
  };
  await render(savedPoint);
  const parkedPoint: DocumentWorkspacePoint = {
    ...savedPoint,
    version: 8,
    task: {
      status: "waiting",
      waiting_for: "Treasurer",
      requested_information: "Final budget",
      note: "Parking note is not the basis of acceptance.",
    },
  };
  await render(parkedPoint);
  const accepted = () =>
    container.querySelector('[data-testid="document-point-accepted-answer"]')!;
  expect(accepted().textContent).toContain(savedPoint.accepted_reason);
  expect(accepted().textContent).not.toContain(parkedPoint.task!.note);
  await act(async () => root.unmount());
  root = createRoot(container);
  await render(parkedPoint);
  expect(accepted().textContent).toContain(savedPoint.accepted_reason);
  expect(accepted().textContent).not.toContain(parkedPoint.task!.note);
});

it("does not promote a mutable park note to an accepted reason when the server explicitly returns null", async () => {
  await render({
    ...point,
    status: "answered",
    value: 100,
    candidates: [],
    accepted_reason: null,
    task: {
      status: "parked",
      waiting_for: null,
      requested_information: "Updated evidence",
      note: "A later task note",
    },
  });
  const accepted = container.querySelector(
    '[data-testid="document-point-accepted-answer"]',
  )!;
  expect(accepted.textContent).not.toContain("workspace-accepted-basis");
  expect(accepted.textContent).not.toContain("A later task note");
});

it("keeps the accepted answer and basis visible while comparing a new conflict", async () => {
  await render({
    ...point,
    status: "conflict",
    value: 80,
    accepted_reason: "Approved budget",
    candidates: [
      {
        ...point.candidates[0],
        candidate_id: "old",
        status: "accepted",
        value: 80,
        citations: [
          {
            ...point.candidates[0].citations[0],
            quote: "Approved total: EUR 80",
          },
        ],
      },
      point.candidates[0],
    ],
  });
  const current = container.querySelector(
    '[data-testid="document-point-accepted-answer"]',
  );
  expect(current?.textContent).toContain("workspace-current-answer");
  expect(current?.textContent).toContain("80");
  expect(current?.textContent).toContain("Approved budget");
  expect(current?.textContent).toContain("Approved total: EUR 80");
  expect(container.textContent).toContain("workspace-new-source-answer");
  expect(container.textContent).toContain("Total project cost: EUR 100");
  expect(save).not.toHaveBeenCalled();
});

it("offers evidence review rather than revision reload when a supporting source is unavailable", async () => {
  commandError = {
    status: 409,
    data: {
      title:
        "A supporting source is unavailable or changed. Review the source-backed answer.",
    },
  };
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "workspace-source-unavailable-error",
  );
  expect(button("workspace-reload")).toBeUndefined();
  await act(async () => button("workspace-review-evidence").click());
  expect(addSource).toHaveBeenCalledTimes(1);
});

it("Overview uses current candidate attribution and presents actionable setup emptiness", async () => {
  const old = {
    ...point.candidates[0],
    candidate_id: "old",
    status: "accepted" as const,
    value: 400000,
    citations: [
      { ...point.candidates[0].citations[0], quote: "OLD QUOTE 400000" },
    ],
  };
  const latest = {
    ...old,
    candidate_id: "latest",
    value: 420000,
    citations: [{ ...old.citations[0], quote: "CURRENT QUOTE 420000" }],
  };
  const accepted = {
    ...point,
    status: "answered" as const,
    value: 420000,
    accepted_candidate_id: "latest",
    candidates: [old, latest],
  };
  const workspace = {
    revision: 1,
    setup: { ready: true, name: "City template" },
    points: [accepted],
    needs: [],
    overview: {
      required_total: 1,
      required_covered: 1,
      optional_total: 0,
      optional_covered: 0,
      waiting_count: 0,
      next_steps: [],
    },
    export_eligibility: {
      working: true,
      final: false,
      blockers: [],
      workspace_revision: 1,
    },
  } as DocumentWorkspace;
  const choose = jest.fn();
  async function overview(value: DocumentWorkspace) {
    await act(async () =>
      root.render(
        <ChakraProvider value={defaultSystem}>
          <WorkspaceOverview
            workspace={value}
            lng="en"
            chapters={[]}
            onSelectPoint={() => {}}
            onOpenDraft={() => {}}
            onOpenSetup={choose}
          />
        </ChakraProvider>,
      ),
    );
  }
  await overview(workspace);
  expect(container.textContent).toContain("CURRENT QUOTE 420000");
  expect(container.textContent).not.toContain("OLD QUOTE 400000");
  await overview({
    ...workspace,
    points: [{ ...accepted, accepted_candidate_id: null }],
  });
  expect(container.textContent).not.toContain("CURRENT QUOTE");
  await overview({
    ...workspace,
    setup: null,
    points: [],
    overview: { ...workspace.overview, required_total: 0, required_covered: 0 },
  });
  expect(
    container.querySelector('[data-testid="document-workspace-setup-empty"]'),
  ).not.toBeNull();
  expect(container.querySelector("progress")).toBeNull();
  await act(async () => button("workspace-choose-template").click());
  expect(choose).toHaveBeenCalledTimes(1);
});

it("keeps covered points read-only until Edit answer and preserves an unsaved correction through refetch", async () => {
  const accepted = {
    ...point,
    status: "answered" as const,
    value: 420000,
    unit: "USD",
    candidates: [],
  };
  await render(accepted);
  expect(container.querySelector("form")).toBeNull();
  expect(
    container.querySelector('[data-testid="document-point-accepted-answer"]')
      ?.textContent,
  ).toContain("USD 420,000");
  expect(button("workspace-park")).toBeUndefined();
  await act(async () => button("workspace-edit-answer").click());
  await type(container.querySelector("input")!, "430001.125");
  await render({ ...accepted, version: 8, value: 420500 });
  expect(container.querySelector("input")!.value).toBe("430001.125");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({
        command: "correct",
        value: 430001.125,
        expected_version: 8,
      }),
    }),
  );
});

it("prioritizes normalized legacy draft questions and pending proposals over an all-covered message", async () => {
  const workspace = {
    revision: 1,
    setup: { ready: true, name: "Test" },
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
      working: true,
      final: false,
      blockers: [],
      workspace_revision: 1,
    },
  } as DocumentWorkspace;
  const chapter = {
    chapter_id: "finance",
    title: "Financing",
    body_markdown: "Delivery [Information needed: Confirm date]",
    gaps: [],
    open_gap_count: 0,
  } as import("@/util/types").ConceptNoteDraftChapter;
  const openGap = jest.fn(),
    viewChanges = jest.fn();
  async function overview(reviewPending = false) {
    await act(async () =>
      root.render(
        <ChakraProvider value={defaultSystem}>
          <WorkspaceOverview
            workspace={workspace}
            lng="en"
            chapters={[chapter]}
            onSelectPoint={() => {}}
            onOpenDraft={() => {}}
            onOpenGap={openGap}
            reviewPending={reviewPending}
            onViewChanges={viewChanges}
          />
        </ChakraProvider>,
      ),
    );
  }
  await overview();
  expect(container.textContent).not.toContain("workspace-ready-for-review");
  await act(async () => button("workspace-open-question").click());
  expect(openGap).toHaveBeenCalledWith(
    chapter,
    expect.objectContaining({ question: "Confirm date", gap: null }),
  );
  await overview(true);
  expect(container.textContent).toContain("workspace-proposal-next");
  await act(async () => button("edit-view-changes").click());
  expect(viewChanges).toHaveBeenCalledTimes(1);
});
