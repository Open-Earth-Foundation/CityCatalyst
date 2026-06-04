"use client";

import {
  clearStoredDraftContext,
  readStoredDraftContext,
} from "@/components/StationaryEnergyDraft/storage";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";

const TERMINAL_DRAFT_STATUSES = new Set([
  "saved",
  "partially_saved",
  "no_changes",
  "failed",
]);

export async function resolveStationaryEnergyDraftResume(params: {
  inventoryId: string;
  queryDraftRunId?: string | null;
  refreshDraftStatus: (draftRunId: string) => Promise<DraftStatusResponse>;
  resumeDraftFromServer: () => Promise<DraftStatusResponse | null>;
}): Promise<DraftStatusResponse | null> {
  if (params.queryDraftRunId) {
    return params.refreshDraftStatus(params.queryDraftRunId);
  }

  const storedContext = readStoredDraftContext(params.inventoryId);
  if (storedContext) {
    try {
      const payload = await params.refreshDraftStatus(storedContext.draftRunId);
      if (!TERMINAL_DRAFT_STATUSES.has(payload.status)) {
        return payload;
      }
      clearStoredDraftContext(params.inventoryId);
    } catch {
      clearStoredDraftContext(params.inventoryId);
    }
  }

  return params.resumeDraftFromServer();
}
