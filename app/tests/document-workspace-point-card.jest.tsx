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
import type { DocumentWorkspacePoint } from "@/util/document-workspace";

const save = jest.fn<(payload: unknown) => void>();
const ask = jest.fn();
let commandError: { status: number } | undefined;
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
    useGetDocumentPointQuestionMutation: () => [ask, {}],
    useLazyGetDocumentWorkspaceQuery: () => [reload, {}],
  },
}));
let DocumentPointCard: typeof import("@/components/ConceptNoteWorkspace/document-point-card").DocumentPointCard;
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
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalClone;
});
beforeEach(() => {
  save.mockClear();
  ask.mockClear();
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
async function render(nextPoint = point) {
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <DocumentPointCard
          point={nextPoint}
          runId="run-1"
          lng="en"
          onAddSource={() => {}}
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
