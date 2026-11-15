/** @jest-environment jsdom */
import { expect, it, jest } from "@jest/globals";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
  Request as FetchRequest,
  Response as FetchResponse,
  Headers as FetchHeaders,
} from "node-fetch";
import type { DocumentWorkspacePoint } from "@/util/document-workspace";
jest.unstable_mockModule("@/lib/runtime-env", () => ({ env: () => undefined }));
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
it("shares pending commands and source warnings between compact and full cards while allowing recovery", async () => {
  const original = {
    Request: globalThis.Request,
    Response: globalThis.Response,
    Headers: globalThis.Headers,
    fetch: globalThis.fetch,
    structuredClone: globalThis.structuredClone,
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(globalThis, {
    Request: class extends FetchRequest {
      constructor(input: string | FetchRequest, init?: never) {
        super(
          typeof input === "string" && input.startsWith("/")
            ? `http://localhost${input}`
            : input,
          init,
        );
      }
    },
    Response: FetchResponse,
    Headers: FetchHeaders,
    structuredClone: (value: unknown) =>
      value === undefined ? value : JSON.parse(JSON.stringify(value)),
  });
  const { api } = await import("@/services/api");
  const { DocumentPointCard } =
    await import("@/components/ConceptNoteWorkspace/document-point-card");
  const point: DocumentWorkspacePoint = {
    point_id: "p",
    key: "cost",
    label: "Cost",
    description: "Budget",
    kind: "fact",
    answer_type: "number",
    required: true,
    allow_assumption: false,
    allow_not_applicable: false,
    version: 1,
    status: "needs_confirmation",
    value: null,
    chapter_refs: [],
    candidates: [
      { candidate_id: "c", value: 100, status: "pending", citations: [] },
    ],
    task: null,
    freshness: "current",
  };
  let finish!: (value: FetchResponse) => void;
  let calls = 0;
  globalThis.fetch = jest.fn(async () => {
    calls++;
    if (calls === 1)
      return await new Promise<FetchResponse>((resolve) => {
        finish = resolve;
      });
    return new FetchResponse(
      JSON.stringify({
        point: { ...point, status: "answered", value: 250 },
        workspace_revision: 2,
        update_job: null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (defaults) => defaults().concat(api.middleware),
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <Provider store={store}>
          <ChakraProvider value={defaultSystem}>
            <DocumentPointCard
              point={point}
              runId="run"
              lng="en"
              compact
              onAddSource={() => {}}
            />
            <DocumentPointCard
              point={point}
              runId="run"
              lng="en"
              onAddSource={() => {}}
            />
          </ChakraProvider>
        </Provider>,
      ),
    );
    const confirms = () =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
        (button) => button.textContent === "workspace-confirm",
      );
    await act(async () => {
      confirms()[1].click();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(confirms().map((button) => button.disabled)).toEqual([true, true]);
    await act(async () => {
      finish(
        new FetchResponse(
          JSON.stringify({
            title:
              "A supporting source is unavailable or changed. Review the source-backed answer.",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2);
    expect(confirms().map((button) => button.disabled)).toEqual([false, false]);
    const input = container.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "250");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(calls).toBe(2);
  } finally {
    await act(async () => root.unmount());
    store.dispatch(api.util.resetApiState());
    container.remove();
    Object.assign(globalThis, original);
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  }
});

it.each(["success", "stale"] as const)(
  "uses the authoritative Resume result while the parent refresh is held (%s)",
  async (mode) => {
    const original = {
      Request: globalThis.Request,
      Response: globalThis.Response,
      Headers: globalThis.Headers,
      fetch: globalThis.fetch,
      structuredClone: globalThis.structuredClone,
    };
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    Object.assign(globalThis, {
      Request: class extends FetchRequest {
        constructor(input: string | FetchRequest, init?: never) {
          super(
            typeof input === "string" && input.startsWith("/")
              ? `http://localhost${input}`
              : input,
            init,
          );
        }
      },
      Response: FetchResponse,
      Headers: FetchHeaders,
      structuredClone: (value: unknown) =>
        value === undefined ? value : JSON.parse(JSON.stringify(value)),
    });
    const { api } = await import("@/services/api");
    const { documentWorkspaceApi } =
      await import("@/services/document-workspace-api");
    const { DocumentPointCard } =
      await import("@/components/ConceptNoteWorkspace/document-point-card");
    const initial: DocumentWorkspacePoint = {
      point_id: "award-point",
      key: "award_date",
      label: "Award date",
      description: "Human-confirmed procurement date",
      kind: "fact",
      answer_type: "date",
      required: true,
      allow_assumption: false,
      allow_not_applicable: false,
      version: 2,
      status: mode === "stale" ? "answered" : "missing",
      value: mode === "stale" ? "2027-03-10" : null,
      chapter_refs: [],
      candidates: [],
      task: {
        status: "waiting",
        waiting_for: "Procurement officer",
        requested_information: "Confirm date",
        note: null,
      },
      freshness: "current",
    };
    const resumed: DocumentWorkspacePoint = {
      ...initial,
      version: 3,
      task: { ...initial.task!, status: "active" },
    };
    const commands: {
      command: string;
      expected_version: number;
      value?: string;
    }[] = [];
    let reads = 0;
    const releaseReads: ((value: FetchResponse) => void)[] = [];
    const response = (body: unknown, status = 200) =>
      new FetchResponse(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    globalThis.fetch = jest.fn(async (input: FetchRequest) => {
      if (input.url.endsWith("/workspace")) {
        reads++;
        if (reads === 1) return response({ revision: 2, points: [initial] });
        return await new Promise<FetchResponse>((resolve) =>
          releaseReads.push(resolve),
        );
      }
      expect(input.url).toContain("/points/award_date/commands");
      const body = (await input.json()) as (typeof commands)[number];
      commands.push(body);
      if (body.command === "resume")
        return response({
          point: resumed,
          workspace_revision: 3,
          update_job: null,
        });
      if (mode === "stale")
        return response(
          { title: "Point changed. Reload before answering." },
          409,
        );
      return response({
        point: {
          ...resumed,
          version: 4,
          status: "answered",
          value: body.value,
        },
        workspace_revision: 4,
        update_job: null,
      });
    }) as unknown as typeof fetch;
    const store = configureStore({
      reducer: { [api.reducerPath]: api.reducer },
      middleware: (defaults) => defaults().concat(api.middleware),
    });
    function Harness({ point }: { point: DocumentWorkspacePoint }) {
      const query =
        documentWorkspaceApi.useGetDocumentWorkspaceQuery("resume-run");
      return (
        <>
          <span data-testid="workspace-pending">
            {String(query.isFetching)}
          </span>
          <DocumentPointCard
            point={point}
            runId="resume-run"
            lng="en"
            compact
            onAddSource={() => {}}
          />
          <DocumentPointCard
            point={point}
            runId="resume-run"
            lng="en"
            onAddSource={() => {}}
          />
        </>
      );
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    async function render(point = initial) {
      await act(async () =>
        root.render(
          <Provider store={store}>
            <ChakraProvider value={defaultSystem}>
              <Harness point={point} />
            </ChakraProvider>
          </Provider>,
        ),
      );
    }
    const button = (text: string) =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === text,
      )!;
    async function fill(
      element: HTMLInputElement | HTMLTextAreaElement,
      value: string,
    ) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype,
          "value",
        )!.set!.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    async function settle() {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 35));
      });
    }
    try {
      await render();
      await settle();
      if (mode === "stale")
        await act(async () => button("workspace-edit-answer").click());
      await fill(
        container.querySelector<HTMLInputElement>('input[type="date"]')!,
        "2027-03-14",
      );
      await fill(
        container.querySelector("textarea")!,
        "Unsaved reason survives metadata commands",
      );
      await act(async () => button("workspace-resume").click());
      await settle();
      expect(commands).toEqual([
        expect.objectContaining({ command: "resume", expected_version: 2 }),
      ]);
      expect(reads).toBe(2);
      expect(
        container.querySelector('[data-testid="workspace-pending"]')
          ?.textContent,
      ).toBe("true");
      expect(
        container.querySelector<HTMLInputElement>('input[type="date"]')?.value,
      ).toBe("2027-03-14");
      expect(container.querySelector("textarea")?.value).toBe(
        "Unsaved reason survives metadata commands",
      );
      expect(button("workspace-resume")).toBeUndefined();
      if (mode === "stale") {
        // Same cache key but a different point identity must not reuse the result.
        await render({
          ...initial,
          point_id: "replacement-point",
          value: "2027-03-20",
        });
        expect(button("workspace-resume")).toBeDefined();
        // Equal-version props win: dependency freshness can change independently.
        await render({ ...resumed, freshness: "pending_review" });
        expect(container.textContent).toContain(
          "workspace-freshness-pending_review",
        );
        // A newer parent value/version supersedes the cached Resume response.
        await render({ ...resumed, version: 4, value: "2027-03-16" });
        expect(
          container.querySelector(
            '[data-testid="document-point-accepted-answer"]',
          )?.textContent,
        ).toContain("March 16, 2027");
      }
      await fill(
        container.querySelector<HTMLInputElement>('input[type="date"]')!,
        "2027-03-15",
      );
      await act(async () =>
        container
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
      );
      await settle();
      expect(commands[1]).toEqual(
        expect.objectContaining({
          command: mode === "stale" ? "correct" : "answer",
          expected_version: mode === "stale" ? 4 : 3,
          value: "2027-03-15",
        }),
      );
      if (mode === "stale") {
        await settle();
        expect(commands).toHaveLength(2);
        expect(
          container.querySelector<HTMLInputElement>('input[type="date"]')
            ?.value,
        ).toBe("2027-03-15");
        expect(container.querySelector("textarea")?.value).toBe(
          "Unsaved reason survives metadata commands",
        );
        expect(
          container.querySelector('[role="alert"]')?.textContent,
        ).toContain("workspace-stale-error");
      } else {
        // Both surfaces observe the same authoritative response while the parent
        // is still v2 and its actual RTK workspace GET remains in flight.
        expect(
          container.querySelectorAll(
            '[data-testid="document-point-accepted-answer"]',
          ),
        ).toHaveLength(2);
        expect(container.textContent).toContain("March 15, 2027");
        expect(container.querySelector("form")).toBeNull();
      }
    } finally {
      await act(async () => {
        for (const release of releaseReads)
          release(response({ revision: 4, points: [resumed] }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        await root.unmount();
      });
      store.dispatch(api.util.resetApiState());
      container.remove();
      Object.assign(globalThis, original);
      globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    }
  },
);
