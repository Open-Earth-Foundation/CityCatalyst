import { z } from "zod";

import { loadConceptNoteUploadStatus } from "@/backend/ConceptNoteUploadStatusService";
import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import type {
  ConceptNoteDraftState,
  ConceptNoteRun,
  ConceptNoteWorkspaceSnapshot,
} from "@/util/types";

const OBSERVATION_INTERVAL_MS = 10_000;
const MAX_OBSERVATION_INTERVAL_MS = 30_000;
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

export type ConceptNoteWorkspaceResource = "run" | "draft" | "upload" | "edits";

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
  constructor(
    readonly status: number,
    readonly retryAfterMs = 0,
  ) {
    super(`Concept Note workspace observation failed (${status})`);
  }
}

async function readUpstreamSnapshot<T>(
  response: Response,
  schema: z.ZodType,
): Promise<T> {
  if (!response.ok) {
    throw new WorkspaceObservationError(
      response.status,
      retryAfterMs(response.headers.get("retry-after")),
    );
  }
  const payload = await readConceptNoteApiPayload(response);
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
    signal: options.signal,
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
    signal: options.signal,
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
          signal: options.signal,
        })
      : undefined;

  const editsPromise = options.resources.has("edits")
    ? callConceptNoteApi({
        path: `/v1/concept-notes/${options.runId}/edit-proposals`,
        userId: options.userId,
        requestId: options.requestId,
        signal: options.signal,
        searchParams: { user_id: options.userId },
      }).then((response) =>
        readUpstreamSnapshot<
          NonNullable<ConceptNoteWorkspaceSnapshot["edits"]>
        >(
          response,
          z.array(
            z
              .object({
                run_id: z.literal(options.runId),
                proposal_id: z.string().uuid(),
                status: z.string(),
              })
              .passthrough(),
          ),
        ),
      )
    : undefined;
  const [run, draft, upload, edits] = await Promise.all([
    runPromise,
    draftPromise,
    uploadPromise,
    editsPromise,
  ]);
  return { run, draft, upload, edits };
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
    snapshot.edits?.some((proposal) => proposal.status === "processing") ||
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
  const editsHash = snapshot.edits && JSON.stringify(snapshot.edits);
  if (editsHash && editsHash !== hashes.edits) {
    hashes.edits = editsHash;
    changed.edits = snapshot.edits;
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

/** Parse both standard Retry-After representations without changing limiter policy. */
function retryAfterMs(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Math.max(0, Date.parse(value) - Date.now()) || 0;
}

type Update = {
  snapshot?: SnapshotWithoutSequence;
  terminal?: boolean;
  status?: number;
};
type Listener = (update: Update) => void;
interface Observation {
  listeners: Set<Listener>;
  controller: AbortController;
  latest?: Update;
}
// Authorization is checked by the route before joining. Never share user-scoped data
// between users. Each resource has one observer per process, regardless of tab count
// or the combination of resources requested by a connection.
const observations = new Map<string, Observation>();

function subscribeResource(
  options: WorkspaceObserverOptions,
  resource: ConceptNoteWorkspaceResource,
  listener: Listener,
): () => void {
  const key = JSON.stringify([
    options.userId,
    options.runId,
    resource,
    resource === "upload" ? options.uploadId : null,
  ]);
  let observation = observations.get(key);
  if (!observation) {
    observation = { listeners: new Set(), controller: new AbortController() };
    observations.set(key, observation);
  }
  const shared = observation;
  shared.listeners.add(listener);
  if (shared.latest) listener(shared.latest);

  async function observe(): Promise<void> {
    const hashes: Partial<Record<ConceptNoteWorkspaceResource, string>> = {};
    const minimum = options.intervalMs ?? OBSERVATION_INTERVAL_MS;
    let delay = minimum;
    try {
      while (!shared.controller.signal.aborted) {
        try {
          const snapshot = await loadSnapshot({
            ...options,
            resources: new Set([resource]),
            signal: AbortSignal.any([
              shared.controller.signal,
              AbortSignal.timeout(30_000),
            ]),
          });
          if (shared.controller.signal.aborted) return;
          const changed =
            Object.keys(changedSnapshot(snapshot, hashes)).length > 0;
          const terminal = !isSnapshotActive(snapshot);
          shared.latest = { snapshot, terminal };
          if (changed || terminal) {
            for (const notify of [...shared.listeners]) notify(shared.latest);
          }
          if (terminal) return;
          delay = changed
            ? minimum
            : Math.min(MAX_OBSERVATION_INTERVAL_MS, delay * 2);
        } catch (error) {
          if (shared.controller.signal.aborted) return;
          const status =
            error instanceof WorkspaceObservationError
              ? error.status
              : Number((error as { statusCode?: number })?.statusCode) || 500;
          if (status !== 429 && status < 500) {
            shared.latest = { status, terminal: true };
            for (const notify of [...shared.listeners]) notify(shared.latest);
            return;
          }
          // Retry here, once for every subscriber, instead of making each browser reconnect.
          delay = Math.max(
            Math.min(MAX_OBSERVATION_INTERVAL_MS, Math.max(minimum, delay * 2)),
            error instanceof WorkspaceObservationError
              ? error.retryAfterMs
              : retryAfterMs(
                  (error as { retryAfter?: string })?.retryAfter ?? null,
                ),
          );
        }
        await wait(delay, shared.controller.signal);
      }
    } finally {
      if (observations.get(key) === shared) observations.delete(key);
    }
  }
  if (shared.listeners.size === 1 && !shared.latest) void observe();
  return () => {
    shared.listeners.delete(listener);
    if (shared.listeners.size === 0) {
      shared.controller.abort();
      if (observations.get(key) === shared) observations.delete(key);
    }
  };
}

/** Fan out shared active-resource observations; never start a loop per connection. */
export function createConceptNoteWorkspaceEventStream(
  options: WorkspaceObserverOptions,
): ReadableStream<Uint8Array> {
  let cleanup: (cancelled?: boolean) => void = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let sequence = 0;
      const pending = new Set(options.resources);
      const unsubscribes: (() => void)[] = [];
      const heartbeat = setInterval(() => {
        if (!closed)
          controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
      }, HEARTBEAT_INTERVAL_MS);
      function finish(cancelled = false): void {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        options.signal.removeEventListener("abort", onAbort);
        for (const unsubscribe of unsubscribes) unsubscribe();
        if (!cancelled) controller.close();
      }
      const onAbort = () => finish();
      cleanup = finish;
      options.signal.addEventListener("abort", onAbort, { once: true });
      if (options.signal.aborted) {
        finish();
        return;
      }
      for (const resource of options.resources) {
        const unsubscribe = subscribeResource(options, resource, (update) => {
          if (closed) return;
          if (update.status) {
            controller.enqueue(
              encodeEvent("error", { status: update.status, retryable: false }),
            );
            finish();
            return;
          }
          if (update.snapshot) {
            controller.enqueue(
              encodeEvent("snapshot", {
                sequence: ++sequence,
                ...update.snapshot,
              }),
            );
          }
          if (update.terminal) pending.delete(resource);
          if (pending.size === 0) {
            controller.enqueue(encodeEvent("done", { ok: true }));
            finish();
          }
        });
        if (closed) unsubscribe();
        else unsubscribes.push(unsubscribe);
        if (closed) break;
      }
    },
    cancel() {
      cleanup(true);
    },
  });
}
