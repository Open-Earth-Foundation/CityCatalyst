/** @jest-environment jsdom */
import { afterAll, beforeAll, expect, it, jest } from "@jest/globals";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider, useDispatch } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
  Request as FetchRequest,
  Response as FetchResponse,
  Headers as FetchHeaders,
} from "node-fetch";
import { TextDecoder, TextEncoder } from "node:util";
import type { DocumentWorkspace } from "@/util/document-workspace";
import type { ConceptNoteDraftChapter } from "@/util/types";
import type { EditProposal } from "@/util/concept-note-edit-types";

jest.unstable_mockModule("@/lib/runtime-env", () => ({ env: () => undefined }));
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.unstable_mockModule("@/lib/hooks", () => ({
  useAppDispatch: useDispatch,
}));
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-workspace-events",
  () => ({ useConceptNoteWorkspaceEvents: () => {} }),
);

const originals = {
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  fetch: globalThis.fetch,
  structuredClone: globalThis.structuredClone,
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
};
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  Object.assign(globalThis, originals);
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

it("discovers an asynchronous protected-text proposal after a point correction without remounting", async () => {
  Object.assign(globalThis, {
    TextEncoder,
    TextDecoder,
    Response: FetchResponse,
    Headers: FetchHeaders,
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
    structuredClone: (value: unknown) =>
      value === undefined ? value : JSON.parse(JSON.stringify(value)),
  });
  const { api } = await import("@/services/api");
  const { documentWorkspaceApi } =
    await import("@/services/document-workspace-api");
  const { useConceptNoteEdits } =
    await import("@/components/ConceptNoteWorkspace/use-concept-note-edits");
  const { DocumentReviewToolbar, selectReviewProposal } =
    await import("@/components/ConceptNoteWorkspace/document-review");
  const chapterId = "11111111-1111-4111-8111-111111111111";
  const chapter = {
    chapter_id: chapterId,
    revision_number: 1,
    body_markdown: "Cost: 100",
    position: 0,
  } as ConceptNoteDraftChapter;
  const proposal = {
    proposal_id: "proposal",
    run_id: "run",
    status: "proposed",
    instruction: "Update accepted cost",
    scope: { kind: "auto" },
    base_revisions: { [chapterId]: 1 },
    changes: [
      {
        change_id: "change",
        chapter_id: chapterId,
        chapter_title: "Budget",
        base_revision: 1,
        start: 6,
        before: "100",
        after: "250",
        kind: "factual",
        group_id: "canonical_points",
        source_refs: [],
        user_input_quote: "250",
      },
    ],
    clarification: null,
    error_code: null,
    result: null,
  } as EditProposal;
  let corrected = false;
  let workerCompleted = false;
  let collectionReads = 0;
  const view = () =>
    ({
      revision: corrected ? 2 : 1,
      setup: { ready: true },
      points: [
        {
          key: "project.cost",
          freshness: workerCompleted
            ? "pending_review"
            : corrected
              ? "updating"
              : "current",
        },
      ],
    }) as DocumentWorkspace;
  const response = (body: unknown) =>
    new FetchResponse(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  globalThis.fetch = jest.fn(async (request: FetchRequest) => {
    if (request.url.endsWith("/commands")) {
      corrected = true;
      return response({
        point: { key: "project.cost" },
        workspace_revision: 2,
        update_job: { job_id: "job", status: "queued" },
      });
    }
    if (request.url.endsWith("/edit-proposals")) {
      collectionReads++;
      return response(workerCompleted ? [proposal] : []);
    }
    if (request.url.endsWith("/workspace")) return response(view());
    throw new Error(`Unexpected URL: ${request.url}`);
  }) as unknown as typeof fetch;
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (defaults) => defaults().concat(api.middleware),
  });
  const correctionLabel = "Correct cost";
  function Harness() {
    const workspace =
      documentWorkspaceApi.useGetDocumentWorkspaceQuery("run").data;
    const edits = useConceptNoteEdits({
      runId: "run",
      onApplied: async () => {},
      observeBackgroundUpdates: Boolean(
        workspace?.points.some(
          (point) =>
            point.freshness === "updating" ||
            point.freshness === "pending_review",
        ),
      ),
    });
    const [command] = documentWorkspaceApi.useCommandDocumentPointMutation();
    const active = selectReviewProposal(edits.proposals);
    return (
      <ChakraProvider value={defaultSystem}>
        <button
          onClick={() =>
            void command({
              runId: "run",
              pointKey: "project.cost",
              command: {
                command: "correct",
                value: 250,
                expected_version: 1,
                idempotency_key: "test",
              },
            })
          }
        >
          {correctionLabel}
        </button>
        {active && (
          <DocumentReviewToolbar
            proposal={active}
            chapters={[chapter]}
            edits={edits}
            changes={active.changes}
            lng="en"
            onNavigate={() => {}}
            onOpenSources={() => {}}
          />
        )}
      </ChakraProvider>
    );
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  async function settleUntil(predicate: () => boolean) {
    for (let attempt = 0; attempt < 45 && !predicate(); attempt++)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 75));
      });
    expect(predicate()).toBe(true);
  }
  try {
    await act(async () =>
      root.render(
        <Provider store={store}>
          <Harness />
        </Provider>,
      ),
    );
    await settleUntil(() => collectionReads > 0);
    expect(
      container.querySelector('[data-testid="concept-note-document-review"]'),
    ).toBeNull();
    await act(async () => container.querySelector("button")!.click());
    await settleUntil(() => corrected && collectionReads > 1);
    workerCompleted = true;
    await settleUntil(() =>
      Boolean(
        container.querySelector('[data-testid="concept-note-document-review"]'),
      ),
    );
    expect(collectionReads).toBeGreaterThan(2);
    expect(
      container.querySelector('[data-testid="concept-note-edit-apply-all"]'),
    ).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    store.dispatch(api.util.resetApiState());
    container.remove();
  }
}, 15000);
