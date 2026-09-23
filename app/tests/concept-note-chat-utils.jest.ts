import { getConceptNoteContextState } from "@/components/ConceptNoteWorkspace/context-status";
import { describe, expect, it } from "@jest/globals";

import { readConceptNoteThreadMessages } from "@/components/ConceptNoteWorkspace/chat-utils";
import { getConceptNoteBundleProgress } from "@/components/ConceptNoteDashboard/utils";
import type { ConceptNoteUploadStatus } from "@/util/types";

describe("chat context readiness", () => {
  const readyBundle = getConceptNoteBundleProgress({
    context_bundle: {
      status: "ready",
      document_grounding: "uploaded_evidence",
      source_counts: { ready: 1 },
    },
  });
  const base = {
    bundle: readyBundle,
    activeUpload: null,
    isUploading: false,
    isRetrying: false,
  };

  it.each<ConceptNoteUploadStatus>(["queued", "processing"])(
    "blocks %s uploads even when old evidence is ready",
    (status) => {
      expect(
        getConceptNoteContextState({
          ...base,
          activeUpload: { uploadId: "new", status },
        }),
      ).toBe("processing");
    },
  );
  it("waits for the wizard upload to appear in the run", () => {
    expect(
      getConceptNoteContextState({ ...base, initialUploadId: "new" }),
    ).toBe("processing");
  });
  it("waits for context assembly after OCR, then unlocks", () => {
    const activeUpload = { uploadId: "new", status: "ready" as const };
    expect(
      getConceptNoteContextState({
        ...base,
        activeUpload,
        bundle: { ...readyBundle, status: "building" },
      }),
    ).toBe("processing");
    expect(
      getConceptNoteContextState({
        ...base,
        activeUpload,
        bundle: { ...readyBundle, readySources: 0 },
      }),
    ).toBe("processing");
    expect(getConceptNoteContextState({ ...base, activeUpload })).toBe("ready");
  });
  it("reports failure and stays blocked until retry completes", () => {
    const activeUpload = { uploadId: "new", status: "failed" as const };
    expect(getConceptNoteContextState({ ...base, activeUpload })).toBe(
      "failed",
    );
    expect(
      getConceptNoteContextState({
        ...base,
        activeUpload,
        isRetrying: true,
      }),
    ).toBe("processing");
  });
  it("blocks an upload in flight and context failure", () => {
    expect(getConceptNoteContextState({ ...base, isUploading: true })).toBe(
      "uploading",
    );
    expect(
      getConceptNoteContextState({
        ...base,
        bundle: { ...readyBundle, status: "failed" },
      }),
    ).toBe("failed");
  });
  it("allows a city-only run after its context is ready", () => {
    const bundle = {
      ...readyBundle,
      documentGrounding: "none" as const,
      readySources: 0,
    };
    expect(getConceptNoteContextState({ ...base, bundle })).toBe("none");
    expect(
      getConceptNoteContextState({
        ...base,
        bundle: { ...bundle, status: "building" },
      }),
    ).toBe("preparing");
  });
  it("checks every persisted upload, not only the selected file", () => {
    const uploads = ["ready", "processing"].map((status, index) => ({
      upload_id: String(index),
      run_id: "run",
      status: status as ConceptNoteUploadStatus,
      filename: "test.pdf",
      source_format: "pdf" as const,
      received_at: "2026-09-09T00:00:00Z",
    }));
    expect(
      getConceptNoteContextState({
        ...base,
        uploads,
        activeUpload: { uploadId: "0", status: "ready" },
      }),
    ).toBe("processing");
    uploads[1].status = "ready";
    expect(getConceptNoteContextState({ ...base, uploads })).toBe("processing");
    expect(
      getConceptNoteContextState({
        ...base,
        uploads,
        bundle: { ...readyBundle, readySources: 2 },
      }),
    ).toBe("ready");
  });
});

describe("Concept Note chat helpers", () => {
  it("keeps supported messages and drops malformed entries", () => {
    expect(
      readConceptNoteThreadMessages({
        messages: [
          { message_id: "message-1", role: "user", text: "Start thin" },
          {
            message_id: "message-2",
            role: "assistant",
            text: "We can start with the available context.",
          },
          null,
          { role: "system", text: "internal" },
          { role: "user", text: 12 },
        ],
      }),
    ).toEqual([
      { id: "message-1", role: "user", text: "Start thin" },
      {
        id: "message-2",
        role: "assistant",
        text: "We can start with the available context.",
      },
    ]);
    expect(readConceptNoteThreadMessages({})).toEqual([]);
  });
});
