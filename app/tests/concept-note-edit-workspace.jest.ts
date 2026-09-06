/** @jest-environment jsdom */
import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  act,
  createElement,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { Root } from "react-dom/client";
import { TextDecoder, TextEncoder } from "node:util";

import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftChapter,
  ConceptNoteDraftState,
  ConceptNoteGap,
  ConceptNoteRun,
  ConceptNoteUploadResponse,
} from "@/util/types";
import {
  chapterId,
  cleanup,
  mount,
  prepareDom,
  runId,
  proposal,
  t,
} from "./cnb-edit-ui-helpers";

type ChatProps = ComponentProps<
  typeof import("@/components/ConceptNoteWorkspace/chat-panel").ConceptNoteChatPanel
>;
type DraftProps = ComponentProps<
  typeof import("@/components/ConceptNoteWorkspace/draft-tab").DraftTab
>;
type ContextProps = ComponentProps<
  typeof import("@/components/ConceptNoteWorkspace/context-tab").ContextTab
>;
type ExportProps = ComponentProps<
  typeof import("@/components/ConceptNoteWorkspace/export-dialog").ExportDialog
>;
type StructureProps = ComponentProps<
  typeof import("@/components/ConceptNoteWorkspace/structure-tab").StructureTab
>;

const cityId = "73200000-0000-4000-8000-000000000004";
const gap: ConceptNoteGap = {
  gap_id: "73200000-0000-4000-8000-000000000020",
  field_key: "investment",
  question: "What is the investment?",
  why_asking: "The budget needs evidence",
  severity: "critical",
  state: "open",
  suggestions: [],
  source_refs: [],
  version: 4,
  resolution: null,
  created_at: "2026-08-30T12:00:00Z",
  updated_at: "2026-08-30T12:00:00Z",
};
const chapter: ConceptNoteDraftChapter = {
  chapter_id: chapterId,
  template_section_id: "summary",
  title: "Project summary",
  position: 0,
  status: "ready",
  required: true,
  user_locked: false,
  body_markdown: "Existing text",
  gaps: [],
  open_gap_count: 0,
  caveat_count: 0,
  revision_number: 3,
  confirmed_body_markdown: "Existing text",
  confirmed_revision_number: 3,
  proposed_revision_number: null,
  regeneration_status: "idle",
  regeneration_error: null,
};

function query<T>(data?: T) {
  return {
    data,
    isLoading: false,
    isError: false,
    refetch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

function mutation<T>(value: T) {
  const unwrap = jest.fn<() => Promise<T>>().mockResolvedValue(value);
  return {
    isLoading: false,
    isError: false,
    unwrap,
    trigger: jest
      .fn<(...args: unknown[]) => { unwrap: typeof unwrap }>()
      .mockImplementation(() => ({ unwrap })),
  };
}

function initialState() {
  const run: ConceptNoteRun = {
    run_id: runId,
    thread_id: "thread-owned",
    name: "Owned concept note",
    city_id: cityId,
    project_id: null,
    funder_id: null,
    selected_funding_opportunity_id: null,
    status: "active",
    workflow_step: "editing_document",
    progress_summary: {
      context_bundle: { status: "ready", document_grounding: "none" },
    },
    created_at: "2026-08-30T12:00:00Z",
    updated_at: "2026-08-30T12:00:00Z",
  };
  const application: ConceptNoteApplicationContext = {
    run_id: runId,
    city_id: cityId,
    funder: { id: "funder", name: "Funder" },
    opportunity: { id: "opportunity", name: "Opportunity" },
    template: {
      id: "template",
      name: "Template",
      output_format: null,
      chapter_schema: [],
      required_fields: [],
    },
    included_sources: {
      city: true,
      project: false,
      ghgi: false,
      ccra: false,
      hiap: false,
    },
  };
  const draft: ConceptNoteDraftState = {
    run_id: runId,
    status: "complete",
    completed_chapters: 1,
    total_chapters: 1,
    current_chapter_id: null,
    focused_gap_id: null,
    error_code: null,
    chapters: [chapter],
  };
  return {
    run: query(run),
    city: query({ name: "Fixture City", country: "Fixture Country" }),
    application: query(application),
    draft: query(draft),
    population: query({ population: 12000, year: 2024 }),
    inventory: query({ year: 2024 }),
    dashboard: query<ContextProps["cityDashboard"]>(),
    files: query([{ fileName: "source.pdf" }]),
    uploadStatus: query<ConceptNoteUploadResponse>(),
    upload: mutation<ConceptNoteUploadResponse>({
      uploadId: "upload-one",
      status: "queued",
    }),
    retryUpload: mutation<ConceptNoteUploadResponse>({
      uploadId: "upload-one",
      status: "processing",
    }),
    retryBundle: mutation(undefined),
    startDraft: mutation(undefined),
    resolveGap: mutation(undefined),
    confirmChapter: mutation(undefined),
  };
}

let state = initialState();
let reducedMotion: boolean | null = null;
let captured: {
  chat?: ChatProps;
  draft?: DraftProps;
  context?: ContextProps;
  export?: ExportProps;
  structure?: StructureProps;
} = {};
let root: Root | undefined;
let container: HTMLDivElement;
let Workspace: typeof import("@/components/ConceptNoteWorkspace").ConceptNoteWorkspace;
let editApplied: (chapterIds: string[]) => Promise<void>;
const edits = {
  proposals: [] as (typeof proposal)[],
  busy: null,
  error: null,
  apply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  reject: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
} as unknown as ChatProps["edits"];

prepareDom();
Object.assign(globalThis, { TextEncoder, TextDecoder });
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));
jest.unstable_mockModule("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) =>
    createElement("a", { href }, children),
}));
jest.unstable_mockModule("framer-motion", () => ({
  motion: {
    main: ({
      children,
      style,
    }: {
      children?: ReactNode;
      style?: CSSProperties;
    }) => createElement("main", { style }, children),
  },
  useReducedMotion: () => reducedMotion,
}));

const apiMock = {
  useGetConceptNoteRunQuery: jest.fn((..._args: unknown[]) => state.run),
  useGetCityQuery: jest.fn((..._args: unknown[]) => state.city),
  useGetConceptNoteApplicationContextQuery: jest.fn(
    (..._args: unknown[]) => state.application,
  ),
  useGetConceptNoteDraftQuery: jest.fn((..._args: unknown[]) => state.draft),
  useGetMostRecentCityPopulationQuery: jest.fn(
    (..._args: unknown[]) => state.population,
  ),
  useGetInventoryByCityIdQuery: jest.fn(
    (..._args: unknown[]) => state.inventory,
  ),
  useGetCityDashboardQuery: jest.fn((..._args: unknown[]) => state.dashboard),
  useGetUserFilesQuery: jest.fn((..._args: unknown[]) => state.files),
  useGetConceptNoteUploadStatusQuery: jest.fn(
    (..._args: unknown[]) => state.uploadStatus,
  ),
  useUploadConceptNoteSourceMutation: () => [
    state.upload.trigger,
    state.upload,
  ],
  useRetryConceptNoteUploadMutation: () => [
    state.retryUpload.trigger,
    state.retryUpload,
  ],
  useRetryConceptNoteContextBundleMutation: () => [
    state.retryBundle.trigger,
    state.retryBundle,
  ],
  useStartConceptNoteDraftMutation: () => [
    state.startDraft.trigger,
    state.startDraft,
  ],
  useResolveConceptNoteGapMutation: () => [
    state.resolveGap.trigger,
    state.resolveGap,
  ],
  useConfirmConceptNoteChapterMutation: () => [
    state.confirmChapter.trigger,
    state.confirmChapter,
  ],
};
jest.unstable_mockModule("@/services/api", () => ({ api: apiMock }));
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-edits",
  () => ({
    useConceptNoteEdits: (options: { onApplied: typeof editApplied }) => {
      editApplied = options.onApplied;
      return edits;
    },
  }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/chat-panel",
  () => ({
    ConceptNoteChatPanel: (props: ChatProps) => {
      captured.chat = props;
      return createElement("div", { "data-testid": "workspace-chat-boundary" });
    },
  }),
);
jest.unstable_mockModule("@/components/ConceptNoteWorkspace/draft-tab", () => ({
  DraftTab: (props: DraftProps) => {
    captured.draft = props;
    return createElement(
      "div",
      { "data-testid": "concept-note-draft-preview", tabIndex: -1 },
      props.noteName,
    );
  },
}));
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/context-tab",
  () => ({
    ContextTab: (props: ContextProps) => {
      captured.context = props;
      return createElement("div", {
        "data-testid": "workspace-context-boundary",
      });
    },
  }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/structure-tab",
  () => ({
    StructureTab: (props: StructureProps) => {
      captured.structure = props;
      return createElement("div");
    },
  }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/export-dialog",
  () => ({
    ExportDialog: (props: ExportProps) => {
      captured.export = props;
      return null;
    },
  }),
);

beforeAll(async () => {
  ({ ConceptNoteWorkspace: Workspace } =
    await import("@/components/ConceptNoteWorkspace"));
});
beforeEach(() => {
  state = initialState();
  captured = {};
  edits.proposals = [];
  reducedMotion = null;
  jest.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: jest.fn(),
  });
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
});
afterEach(async () => {
  await cleanup(root);
  root = undefined;
  jest.restoreAllMocks();
});

async function render(initialUploadId?: string) {
  const result = await mount(
    createElement(Workspace, { cityId, lng: "en", runId, initialUploadId }),
    true,
  );
  root = result.root;
  container = result.container;
}
async function invoke(action: () => unknown) {
  await act(async () => {
    await action();
  });
}
function button(text: string) {
  const found = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((element) => element.textContent?.trim() === text);
  if (!found) throw new Error(`Button ${text} is missing`);
  return found;
}
function markdownFile() {
  const text = "# Fixture evidence";
  const file = new File([text], "city.evidence.md", { type: "text/markdown" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode(text).buffer,
  });
  return file;
}

it("binds owned run/city queries and passes current draft/context to review boundaries", async () => {
  await render();
  expect(apiMock.useGetConceptNoteRunQuery).toHaveBeenCalledWith(
    { cityId, runId },
    {
      pollingInterval: 5000,
      skipPollingIfUnfocused: true,
    },
  );
  expect(apiMock.useGetConceptNoteDraftQuery).toHaveBeenCalledWith(runId, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true,
  });
  expect(apiMock.useGetCityQuery).toHaveBeenCalledWith(cityId);
  expect(captured.chat?.threadId).toBe("thread-owned");
  expect(captured.chat?.draft).toBe(state.draft.data);
  expect(captured.structure?.draft).toBe(state.draft.data);
  expect(captured.context?.cityName).toBe("Fixture City");
  expect(captured.context?.populationLabel).toContain("12,000");
  expect(captured.context?.firstCityFile).toBe("source.pdf");
  expect(apiMock.useGetConceptNoteUploadStatusQuery).toHaveBeenCalledWith(
    { runId, uploadId: "" },
    { skip: true, pollingInterval: 0, skipPollingIfUnfocused: true },
  );
});

it("collects exact inline decisions and applies only accepted hunks after review", async () => {
  const first = {
    ...proposal.changes[0],
    before: "Existing",
    after: "Updated",
    start: 0,
    base_revision: 3,
  };
  const second = {
    ...first,
    change_id: "55555555-5555-4555-8555-555555555555",
    before: "text",
    after: "copy",
    start: 9,
  };
  const multi = {
    ...proposal,
    base_revisions: { [chapterId]: 3 },
    changes: [first, second],
  };
  edits.proposals = [multi];
  await render();

  await invoke(() => captured.draft!.onRejectReviewChange!([first.change_id]));
  expect(captured.draft?.reviewDecisions).toEqual({
    [first.change_id]: "rejected",
  });
  expect(edits.apply).not.toHaveBeenCalled();

  await invoke(() => captured.draft!.onAcceptReviewChange!([second.change_id]));
  expect(edits.apply).toHaveBeenCalledWith(multi, [second.change_id]);
});

it("shows loading without mounting controls that could mutate a draft", async () => {
  state.run.isLoading = true;
  await render();
  expect(container.firstElementChild).not.toBeNull();
  expect(captured.chat).toBeUndefined();
  expect(captured.draft).toBeUndefined();
  expect(container.textContent).not.toContain("Owned concept note");
});

it.each(["failed", "missing", "foreign-city"])(
  "does not expose workspace controls for a %s run",
  async (reason) => {
    if (reason === "failed") state.run.isError = true;
    if (reason === "missing") state.run.data = undefined;
    if (reason === "foreign-city") state.run.data!.city_id = "foreign-city";
    await render();
    expect(container.textContent).toContain(t("workspace-load-error-title"));
    expect(container.textContent).not.toContain("Owned concept note");
    expect(captured.chat).toBeUndefined();
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      `/en/cities/${cityId}/concept-notes`,
    );
  },
);

it("keeps automatic scope and routes a new proposal directly to document review", async () => {
  edits.proposals = [proposal];
  await render();
  expect(
    container.querySelector('[data-testid="concept-note-document-review"]'),
  ).not.toBeNull();
  await invoke(() => captured.draft?.onFocusedChapterChange?.(chapterId));
  expect(captured.chat?.editScope).toEqual({
    kind: "auto",
    focused_chapter_id: chapterId,
  });
  await invoke(() => captured.chat?.onOpenContext());
  const firstRequest = captured.draft?.editFocus?.requestId;
  await invoke(() => editApplied([chapterId, "another-chapter"]));
  expect(state.draft.refetch).toHaveBeenCalledTimes(1);
  expect(captured.draft?.editFocus).toMatchObject({ chapterId, focus: true });
  expect(captured.draft?.editFocus?.requestId).not.toBe(firstRequest);
  expect(captured.chat?.editScope).toEqual({
    kind: "auto",
    focused_chapter_id: chapterId,
  });
});

it("refreshes an empty apply result without inventing a focus target", async () => {
  await render();
  await invoke(() => editApplied([]));
  expect(state.draft.refetch).toHaveBeenCalledTimes(1);
  expect(captured.draft?.editFocus).toBeNull();
  state.draft.refetch.mockRejectedValueOnce(new Error("refresh failed"));
  await expect(editApplied([chapterId])).rejects.toThrow("refresh failed");
  expect(captured.draft?.editFocus).toBeNull();
});

it("uses document navigation only as a focus hint for automatic scope", async () => {
  await render();
  await invoke(() => captured.draft?.onFocusedChapterChange?.(chapterId));
  expect(captured.chat?.editScope).toEqual({
    kind: "auto",
    focused_chapter_id: chapterId,
  });
});

it.each([true, false])(
  "focuses draft review without disturbing scroll (reduced motion %s)",
  async (reduced) => {
    reducedMotion = reduced;
    await render();
    await invoke(() => captured.chat?.onOpenContext());
    await invoke(() => captured.chat?.onReviewDraft());
    const preview = container.querySelector<HTMLElement>(
      '[data-testid="concept-note-draft-preview"]',
    )!;
    expect(preview.scrollIntoView).toHaveBeenCalledWith({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
    });
    expect(document.activeElement).toBe(preview);
  },
);

it("opens the requested open gap and ignores chapters without open gaps", async () => {
  await render();
  await invoke(() => captured.draft?.onReviewChapterGaps(chapter));
  expect(captured.chat?.reviewGapChapterId).toBeNull();
  const otherGap = { ...gap, gap_id: "other-gap" };
  const withGaps = { ...chapter, gaps: [gap, otherGap] };
  await invoke(() => captured.draft?.onReviewChapterGaps(withGaps));
  expect(captured.chat?.reviewGapId).toBe(gap.gap_id);
  await invoke(() => captured.draft?.onReviewChapterGaps(withGaps, otherGap));
  expect(captured.chat?.reviewGapChapterId).toBe(chapterId);
  expect(captured.chat?.reviewGapId).toBe("other-gap");
  await invoke(() => captured.chat?.onStopGapInterview());
  expect(captured.chat?.reviewGapChapterId).toBeNull();
  expect(captured.chat?.reviewGapId).toBeNull();
});

it.each(["answer", "correction", "not_a_gap", "defer_as_caveat"] as const)(
  "forwards versioned %s gap decisions and surfaces failure",
  async (action) => {
    await render();
    state.resolveGap.unwrap.mockRejectedValueOnce(new Error("conflict"));
    await invoke(() =>
      captured.chat?.onResolveGap(gap, action, "Confirmed answer"),
    );
    expect(captured.chat?.mutationError).toBe(t("gap-resolution-error"));
    expect(state.draft.refetch).not.toHaveBeenCalled();
    await invoke(() =>
      captured.chat?.onResolveGap(gap, action, "Confirmed answer"),
    );
    expect(captured.chat?.mutationError).toBeNull();
    expect(state.resolveGap.trigger).toHaveBeenLastCalledWith({
      runId,
      gapId: gap.gap_id,
      action,
      answer: "Confirmed answer",
      expectedVersion: 4,
      idempotencyKey: expect.any(String),
    });
    expect(state.draft.refetch).toHaveBeenCalledTimes(1);
  },
);

it("requires an exact chapter revision and makes confirmation failures visible", async () => {
  await render();
  await invoke(() =>
    captured.chat?.onConfirmChapter({ ...chapter, revision_number: null }),
  );
  expect(state.confirmChapter.trigger).not.toHaveBeenCalled();
  state.confirmChapter.unwrap.mockRejectedValueOnce(new Error("stale"));
  await invoke(() => captured.draft?.onConfirmChapter(chapter));
  expect(captured.chat?.mutationError).toBe(t("chapter-confirm-error"));
  await invoke(() => captured.chat?.onConfirmChapter(chapter));
  expect(state.confirmChapter.trigger).toHaveBeenLastCalledWith({
    runId,
    chapterId,
    expectedRevision: 3,
    idempotencyKey: expect.any(String),
  });
  expect(state.draft.refetch).toHaveBeenCalledTimes(1);
  expect(captured.chat?.mutationError).toBeNull();
});

it("validates source files before upload and retains durable upload identity", async () => {
  await render();
  await invoke(() =>
    captured.context?.onUploadFile(new File(["x"], "invalid.exe")),
  );
  expect(captured.context?.uploadError).toBe(t("invalid-source-type"));
  expect(state.upload.trigger).not.toHaveBeenCalled();
  const file = markdownFile();
  await invoke(() => captured.context?.onUploadFile(file));
  const payload = state.upload.trigger.mock.calls[0][0] as {
    cityId: string;
    runId: string;
    formData: FormData;
  };
  expect(payload.cityId).toBe(cityId);
  expect(payload.runId).toBe(runId);
  expect(payload.formData.get("sourceLabel")).toBe("city.evidence");
  expect((payload.formData.get("file") as File).name).toBe(file.name);
  expect(captured.context?.upload?.uploadId).toBe("upload-one");
  expect(captured.context?.uploadError).toBeNull();
  expect(state.run.refetch).toHaveBeenCalledTimes(1);
  expect(apiMock.useGetConceptNoteUploadStatusQuery).toHaveBeenLastCalledWith(
    { runId, uploadId: "upload-one" },
    { skip: false, pollingInterval: 5000, skipPollingIfUnfocused: true },
  );
});

it("reports upload errors and avoids retrying an upload without an identity", async () => {
  await render();
  await invoke(() => captured.context?.onRetryUpload());
  expect(state.retryUpload.trigger).not.toHaveBeenCalled();
  state.upload.unwrap.mockRejectedValueOnce(new Error("upload failed"));
  await invoke(() => captured.context?.onUploadFile(markdownFile()));
  expect(captured.context?.uploadError).toBe(t("upload-source-error"));
});

it("retries the active upload and preserves actionable conversion errors", async () => {
  await render("upload-one");
  expect(apiMock.useGetConceptNoteUploadStatusQuery).toHaveBeenLastCalledWith(
    { runId, uploadId: "upload-one" },
    { skip: false, pollingInterval: 5000, skipPollingIfUnfocused: true },
  );
  state.retryUpload.unwrap.mockRejectedValueOnce(
    new Error("conversion failed"),
  );
  await invoke(() => captured.context?.onRetryUpload());
  expect(captured.context?.uploadError).toBe(t("conversion-retry-error"));
  await invoke(() => captured.context?.onRetryUpload());
  expect(state.retryUpload.trigger).toHaveBeenLastCalledWith({
    runId,
    uploadId: "upload-one",
  });
  expect(captured.context?.upload?.status).toBe("processing");
  expect(captured.context?.uploadError).toBeNull();
});

it("retries context through either surface and reports retry errors", async () => {
  await render();
  state.retryBundle.unwrap.mockRejectedValueOnce(new Error("retry failed"));
  await invoke(() => captured.context?.onRetryBundle());
  expect(captured.context?.uploadError).toBe(t("context-retry-error"));
  await invoke(() => captured.draft?.onRetry());
  expect(state.retryBundle.trigger).toHaveBeenLastCalledWith(runId);
  expect(state.run.refetch).toHaveBeenCalledTimes(1);
});

it.each(["no-template", "running", "available", "failure"])(
  "respects drafting prerequisite state %s",
  async (mode) => {
    if (mode === "no-template") state.application.data!.template = null;
    if (mode === "running") state.draft.data!.status = "running";
    if (mode === "failure") {
      state.startDraft.isError = true;
      state.startDraft.unwrap.mockRejectedValueOnce(
        new Error("draft start failed"),
      );
    }
    await render();
    await invoke(() => captured.draft?.onStartDrafting());
    if (mode === "no-template" || mode === "running") {
      expect(state.startDraft.trigger).not.toHaveBeenCalled();
    } else {
      expect(state.startDraft.trigger).toHaveBeenCalledWith(runId);
      expect(state.draft.refetch).toHaveBeenCalledTimes(
        mode === "available" ? 1 : 0,
      );
      expect(state.run.refetch).toHaveBeenCalledTimes(
        mode === "available" ? 1 : 0,
      );
    }
    expect(captured.draft?.draftError).toBe(
      mode === "failure" ? t("draft-start-error") : null,
    );
  },
);

it("passes absent context safely and gives refreshed upload failures precedence", async () => {
  state.city.data = undefined;
  state.population.data = undefined;
  state.inventory.data = undefined;
  state.files.data = undefined;
  state.application.data = undefined;
  state.draft.data = undefined;
  state.application.isError = true;
  state.application.isLoading = true;
  state.uploadStatus.data = { uploadId: "restored", status: "ready" };
  state.uploadStatus.isError = true;
  await render("restored");
  expect(captured.context).toMatchObject({
    cityName: t("selected-city"),
    country: null,
    inventoryYear: null,
    firstCityFile: null,
    cityFilesCount: 0,
    populationLabel: t("population-unavailable"),
    upload: state.uploadStatus.data,
    uploadError: t("refresh-status-error"),
  });
  expect(captured.draft).toMatchObject({
    draft: null,
    applicationContext: null,
    applicationContextFailed: true,
    applicationContextLoading: true,
    canStartDrafting: false,
  });
});

it("opens/closes export for the current accepted draft and supports tab selection", async () => {
  state.run.data!.progress_summary = {
    context_bundle: { status: "ready", source_counts: { ready: 1 } },
  };
  await render();
  expect(captured.export).toMatchObject({
    open: false,
    draft: state.draft.data,
    hasGroundedSources: true,
  });
  await invoke(() => button(t("export")).click());
  expect(captured.export?.open).toBe(true);
  await invoke(() => captured.export?.onOpenChange(false));
  expect(captured.export?.open).toBe(false);
  await invoke(() => button(t("structure-tab")).click());
  expect(button(t("structure-tab")).getAttribute("aria-selected")).toBe("true");
  await invoke(() => captured.draft?.onOpenContext());
  expect(button(t("context-tab")).getAttribute("aria-selected")).toBe("true");
});

it("places all-set review and export together in the document header without a second toolbar", async () => {
  edits.proposals = [
    {
      ...proposal,
      base_revisions: { [chapterId]: 3 },
      changes: [
        {
          ...proposal.changes[0],
          before: "Existing text",
          start: 0,
          base_revision: 3,
        },
      ],
    },
  ];
  await render();
  const header = container.querySelector(
    '[data-testid="concept-note-document-header"]',
  )!;
  expect(
    header.querySelector('[data-testid="concept-note-edit-apply-all"]'),
  ).not.toBeNull();
  expect(
    header.querySelector('[data-testid="concept-note-edit-reject-all"]'),
  ).not.toBeNull();
  expect(
    header.querySelector('[data-testid="concept-note-export"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[data-testid="concept-note-review-toolbar"]'),
  ).toBeNull();
  expect(captured.draft?.isReviewing).toBe(true);
  await invoke(() => button(t("context-tab")).click());
  expect(
    header.querySelector('[data-testid="concept-note-edit-apply-all"]'),
  ).toBeNull();
  await invoke(() =>
    header
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-review-return-to-draft"]',
      )!
      .click(),
  );
  expect(button(t("draft-tab")).getAttribute("aria-selected")).toBe("true");
  expect(
    header.querySelector('[data-testid="concept-note-edit-apply-all"]'),
  ).not.toBeNull();
});
