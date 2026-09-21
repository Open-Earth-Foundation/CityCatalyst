import { z } from "zod";

import { loadConceptNoteUploadStatus } from "@/backend/ConceptNoteUploadStatusService";
import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import type {
  ConceptNoteDraftState,
  ConceptNoteRun,
  ConceptNoteUploadResponse,
  ConceptNoteWorkspaceSnapshot,
} from "@/util/types";

const OBSERVATION_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

const runSchema = z
  .object({
    run_id: z.string().uuid(),
    progress_summary: z.record(z.string(), z.unknown()),
  })
  .passthrough();
const draftSchema = z
  .object({
    run_id: z.string().uuid(),
    status: z.enum(["not_started", "running", "failed", "complete"]),
    chapters: z.array(z.unknown()),
  })
  .passthrough();

export type ConceptNoteWorkspaceResource = "run" | "draft" | "upload";

type SnapshotWithoutSequence = Omit<ConceptNoteWorkspaceSnapshot, "sequence">;

interface WorkspaceObserverOptions {
  runId: string;
  userId: string;
  resources: Set<ConceptNoteWorkspaceResource>;
  uploadId?: string;
  requestId?: string;
  signal: AbortSignal;
  intervalMs?: number;
}

class WorkspaceObservationError extends Error {
  constructor(readonly status: number) {
    super(`Concept Note workspace observation failed (${status})`);
  }
}

async function readUpstreamSnapshot<T>(
  response: Response,
  schema: z.ZodType,
): Promise<T> {
  const payload = await readConceptNoteApiPayload(response);
  if (!response.ok) {
    throw new WorkspaceObservationError(response.status);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new WorkspaceObservationError(502);
  }
  return payload as T;
}

async function loadRun(
  options: WorkspaceObserverOptions,
): Promise<ConceptNoteRun> {
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${options.runId}`,
    userId: options.userId,
    requestId: options.requestId,
    searchParams: { user_id: options.userId },
  });
  return readUpstreamSnapshot<ConceptNoteRun>(response, runSchema);
}

async function loadDraft(
  options: WorkspaceObserverOptions,
): Promise<ConceptNoteDraftState> {
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${options.runId}/draft`,
    userId: options.userId,
    requestId: options.requestId,
    searchParams: { user_id: options.userId },
  });
  return readUpstreamSnapshot<ConceptNoteDraftState>(response, draftSchema);
}

async function loadSnapshot(
  options: WorkspaceObserverOptions,
): Promise<SnapshotWithoutSequence> {
  const runPromise = options.resources.has("run")
    ? loadRun(options)
    : undefined;
  const draftPromise = options.resources.has("draft")
    ? loadDraft(options)
    : undefined;
  const uploadPromise =
    options.resources.has("upload") && options.uploadId
      ? loadConceptNoteUploadStatus({
          runId: options.runId,
          uploadId: options.uploadId,
          userId: options.userId,
          requestId: options.requestId,
        })
      : undefined;

  const [run, draft, upload] = await Promise.all([
    runPromise,
    draftPromise,
    uploadPromise,
  ]);
  return { run, draft, upload };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRunActive(run: ConceptNoteRun | undefined): boolean {
  const bundle = run?.progress_summary.context_bundle;
  return isRecord(bundle) && bundle.status === "building";
}

function isSnapshotActive(snapshot: SnapshotWithoutSequence): boolean {
  return (
    isRunActive(snapshot.run) ||
    snapshot.draft?.status === "running" ||
    snapshot.upload?.status === "queued" ||
    snapshot.upload?.status === "processing"
  );
}

function changedSnapshot(
  snapshot: SnapshotWithoutSequence,
  hashes: Partial<Record<ConceptNoteWorkspaceResource, string>>,
): SnapshotWithoutSequence {
  const changed: SnapshotWithoutSequence = {};

  const runHash = snapshot.run && JSON.stringify(snapshot.run);
  if (runHash && runHash !== hashes.run) {
    hashes.run = runHash;
    changed.run = snapshot.run;
  }
  const draftHash = snapshot.draft && JSON.stringify(snapshot.draft);
  if (draftHash && draftHash !== hashes.draft) {
    hashes.draft = draftHash;
    changed.draft = snapshot.draft;
  }
  const uploadHash = snapshot.upload && JSON.stringify(snapshot.upload);
  if (uploadHash && uploadHash !== hashes.upload) {
    hashes.upload = uploadHash;
    changed.upload = snapshot.upload;
  }
  return changed;
}

function encodeEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

function wait(intervalMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, intervalMs);
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
  });
}

/** Observe active workspace resources over one SSE connection until terminal state. */
export function createConceptNoteWorkspaceEventStream(
  options: WorkspaceObserverOptions,
): ReadableStream<Uint8Array> {
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      async function observe(): Promise<void> {
        const hashes: Partial<Record<ConceptNoteWorkspaceResource, string>> =
          {};
        let sequence = 0;
        let heartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS;

        try {
          while (!cancelled && !options.signal.aborted) {
            const snapshot = await loadSnapshot(options);
            if (cancelled || options.signal.aborted) break;

            const changed = changedSnapshot(snapshot, hashes);
            if (Object.keys(changed).length > 0) {
              sequence += 1;
              controller.enqueue(
                encodeEvent("snapshot", { sequence, ...changed }),
              );
            }

            if (!isSnapshotActive(snapshot)) {
              controller.enqueue(encodeEvent("done", { ok: true }));
              controller.close();
              return;
            }

            if (Date.now() >= heartbeatAt) {
              controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
              heartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS;
            }
            await wait(
              options.intervalMs ?? OBSERVATION_INTERVAL_MS,
              options.signal,
            );
          }
          if (!cancelled) controller.close();
        } catch (error) {
          if (cancelled || options.signal.aborted) return;
          const status =
            error instanceof WorkspaceObservationError ? error.status : 500;
          controller.enqueue(
            encodeEvent("error", {
              retryable: status === 429 || status === 503 || status >= 500,
              status,
            }),
          );
          controller.close();
        }
      }

      void observe();
    },
    cancel() {
      cancelled = true;
    },
  });
}
