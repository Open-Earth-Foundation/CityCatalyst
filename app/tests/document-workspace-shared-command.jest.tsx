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
