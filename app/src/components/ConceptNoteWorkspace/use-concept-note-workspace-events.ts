"use client";

import { useEffect } from "react";

import { useAppDispatch } from "@/lib/hooks";
import { api } from "@/services/api";
import { logger } from "@/services/logger";
import type { ConceptNoteWorkspaceSnapshot } from "@/util/types";

const INITIAL_RETRY_MS = 500;
const MAX_RETRY_MS = 30_000;

interface WorkspaceEventsOptions {
  cityId: string;
  observeDraft: boolean;
  observeRun: boolean;
  observeUpload: boolean;
  runId: string;
  uploadId: string | null;
}

interface ParsedEvent {
  data: unknown;
  type: string;
}

class ObservationFailure extends Error {
  constructor(readonly retryable: boolean) {
    super("Concept Note workspace observation failed");
  }
}

function parseEvent(frame: string): ParsedEvent | null {
  let type = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  const value = data.join("\n");
  try {
    return { type, data: JSON.parse(value) as unknown };
  } catch {
    return { type, data: value };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asSnapshot(value: unknown): ConceptNoteWorkspaceSnapshot | null {
  if (!isRecord(value) || typeof value.sequence !== "number") return null;
  return value as unknown as ConceptNoteWorkspaceSnapshot;
}

function retryDelay(attempt: number): number {
  const base = Math.min(MAX_RETRY_MS, INITIAL_RETRY_MS * 2 ** attempt);
  return base + Math.floor(Math.random() * base * 0.25);
}

function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, delayMs);
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
  });
}

async function consumeEvents(
  response: Response,
  signal: AbortSignal,
  onSnapshot: (snapshot: ConceptNoteWorkspaceSnapshot) => void,
): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) throw new ObservationFailure(true);
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  let latestSequence = 0;

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = parseEvent(frame);
        if (!event) continue;
        if (event.type === "done") {
          terminal = true;
          continue;
        }
        if (event.type === "error") {
          throw new ObservationFailure(
            isRecord(event.data) && event.data.retryable === true,
          );
        }
        if (event.type === "snapshot") {
          const snapshot = asSnapshot(event.data);
          if (snapshot && snapshot.sequence > latestSequence) {
            latestSequence = snapshot.sequence;
            onSnapshot(snapshot);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return terminal;
}

/** Hydrate RTK caches from one snapshot-first SSE observer while work is active. */
export function useConceptNoteWorkspaceEvents({
  cityId,
  observeDraft,
  observeRun,
  observeUpload,
  runId,
  uploadId,
}: WorkspaceEventsOptions): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const resources = [
      ...(observeRun ? ["run"] : []),
      ...(observeDraft ? ["draft"] : []),
      ...(observeUpload && uploadId ? ["upload"] : []),
    ];
    if (resources.length === 0) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ resources: resources.join(",") });
    if (observeUpload && uploadId) params.set("upload_id", uploadId);

    function updateCaches(snapshot: ConceptNoteWorkspaceSnapshot): void {
      if (snapshot.run?.run_id === runId) {
        dispatch(
          api.util.updateQueryData(
            "getConceptNoteRun",
            { cityId, runId },
            (current) => Object.assign(current, snapshot.run),
          ),
        );
      }
      if (snapshot.draft?.run_id === runId) {
        dispatch(
          api.util.updateQueryData("getConceptNoteDraft", runId, (current) =>
            Object.assign(current, snapshot.draft),
          ),
        );
      }
      if (snapshot.upload?.uploadId === uploadId && uploadId) {
        dispatch(
          api.util.updateQueryData(
            "getConceptNoteUploadStatus",
            { runId, uploadId },
            (current) => Object.assign(current, snapshot.upload),
          ),
        );
      }
    }

    async function observe(): Promise<void> {
      let attempt = 0;
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(
            `/api/v1/concept-notes/${encodeURIComponent(runId)}/events?${params}`,
            { signal: controller.signal },
          );
          if (!response.ok) {
            throw new ObservationFailure(
              response.status === 429 ||
                response.status === 503 ||
                response.status >= 500,
            );
          }
          if (
            await consumeEvents(response, controller.signal, (snapshot) => {
              attempt = 0;
              updateCaches(snapshot);
            })
          ) {
            return;
          }
          throw new ObservationFailure(true);
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!(error instanceof ObservationFailure) || !error.retryable) {
            logger.warn({ error, run_id: runId }, "Workspace observer stopped");
            return;
          }
          await wait(retryDelay(attempt), controller.signal);
          attempt += 1;
        }
      }
    }

    void observe();
    return () => controller.abort();
  }, [
    cityId,
    dispatch,
    observeDraft,
    observeRun,
    observeUpload,
    runId,
    uploadId,
  ]);
}
