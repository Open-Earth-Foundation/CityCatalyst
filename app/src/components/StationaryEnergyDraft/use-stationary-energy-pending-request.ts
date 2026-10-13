"use client";

import { useCallback, useRef, useState } from "react";
import type { TFunction } from "i18next";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";
import { hasTerminalDraftStatus } from "@/components/StationaryEnergyDraft/stationary-energy-chat-controller-helpers";
import {
  clearStoredDraftContext,
  readStoredDraftContext,
  writeStoredDraftContext,
} from "@/components/StationaryEnergyDraft/storage";

export function useStationaryEnergyPendingRequest(
  inventoryId: string,
  t: TFunction,
) {
  // A request the agent started a run for; re-sent once that run is ready.
  const [pendingDraftStartResume, setPendingDraftStartResume] = useState<{
    draftRunId: string;
    content: string;
  } | null>(null);
  const pendingDraftStartResumeRef = useRef(pendingDraftStartResume);
  const [draftStartResumeNotice, setDraftStartResumeNotice] = useState<
    string | null
  >(null);
  // Update storage at the same time as the queue, before polling or reload can
  // observe it. Clearing the queue keeps the active run available for review.
  const updatePendingDraftStartResume = useCallback(
    (pending: typeof pendingDraftStartResume): void => {
      const previous = pendingDraftStartResumeRef.current;
      pendingDraftStartResumeRef.current = pending;
      setPendingDraftStartResume(pending);
      const stored = readStoredDraftContext(inventoryId);
      if (pending) {
        setDraftStartResumeNotice(null);
        writeStoredDraftContext(inventoryId, {
          draftRunId: pending.draftRunId,
          threadId:
            stored?.draftRunId === pending.draftRunId ? stored.threadId : null,
          pendingRequest: pending.content,
        });
      } else if (previous && stored?.draftRunId === previous.draftRunId) {
        writeStoredDraftContext(inventoryId, {
          draftRunId: stored.draftRunId,
          threadId: stored.threadId,
        });
      }
    },
    [inventoryId],
  );

  const applyDraftResumeContext = useCallback(
    (payload: DraftStatusResponse) => {
      const stored = readStoredDraftContext(inventoryId);
      const pending =
        pendingDraftStartResumeRef.current ??
        (stored?.draftRunId === payload.draft_run_id && stored.pendingRequest
          ? { draftRunId: stored.draftRunId, content: stored.pendingRequest }
          : null);
      const terminal = hasTerminalDraftStatus(payload.status);
      if (pending && pending.draftRunId === payload.draft_run_id) {
        if (terminal) {
          updatePendingDraftStartResume(null);
          setDraftStartResumeNotice(
            t(
              payload.status === "failed"
                ? "chat-pending-request-failed"
                : "chat-pending-request-ended",
            ),
          );
        } else if (!pendingDraftStartResumeRef.current) {
          // Restore in memory, then persist the refreshed run/thread once below.
          pendingDraftStartResumeRef.current = pending;
          setPendingDraftStartResume(pending);
          setDraftStartResumeNotice(null);
        }
      }
      if (terminal) {
        clearStoredDraftContext(inventoryId);
      } else {
        writeStoredDraftContext(inventoryId, {
          draftRunId: payload.draft_run_id,
          threadId: payload.thread_id ?? null,
          ...(pendingDraftStartResumeRef.current?.draftRunId ===
          payload.draft_run_id
            ? { pendingRequest: pendingDraftStartResumeRef.current.content }
            : {}),
        });
      }
    },
    [inventoryId, t, updatePendingDraftStartResume],
  );
  const cancelDraftStartResume = useCallback((): void => {
    updatePendingDraftStartResume(null);
    setDraftStartResumeNotice(t("chat-pending-request-canceled"));
  }, [t, updatePendingDraftStartResume]);
  const resetDraftStartResume = useCallback((): void => {
    updatePendingDraftStartResume(null);
    setDraftStartResumeNotice(null);
  }, [updatePendingDraftStartResume]);
  const isPendingDraftStartResume = useCallback(
    (pending?: NonNullable<typeof pendingDraftStartResume>): boolean =>
      pending
        ? pendingDraftStartResumeRef.current === pending
        : Boolean(pendingDraftStartResumeRef.current),
    [],
  );
  return {
    pendingDraftStartResume,
    draftStartResumeNotice,
    resetDraftStartResume,
    updatePendingDraftStartResume,
    applyDraftResumeContext,
    cancelDraftStartResume,
    isPendingDraftStartResume,
  };
}
