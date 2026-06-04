import type {
  DraftListResponse,
  DraftStatusResponse,
  SaveResponse,
} from "@/components/StationaryEnergyDraft/types";
import { readJson } from "@/components/StationaryEnergyDraft/utils";

export async function fetchDraftRuns(params: {
  cityId: string;
  inventoryId: string;
}): Promise<DraftListResponse> {
  const query = new URLSearchParams({
    city_id: params.cityId,
    inventory_id: params.inventoryId,
  });
  const response = await fetch(
    `/api/v1/stationary-energy-drafts?${query.toString()}`,
  );
  return readJson<DraftListResponse>(
    response,
    "Failed to load Stationary Energy drafts",
  );
}

export async function fetchDraftStatus(params: {
  draftRunId: string;
  inventoryId: string;
}): Promise<DraftStatusResponse> {
  const response = await fetch(
    `/api/v1/stationary-energy-drafts/${params.draftRunId}?inventory_id=${encodeURIComponent(params.inventoryId)}`,
  );
  return readJson<DraftStatusResponse>(
    response,
    "Failed to load Stationary Energy draft status",
  );
}

export async function fetchResumedDraft(params: {
  cityId: string;
  inventoryId: string;
}): Promise<DraftStatusResponse | null> {
  const query = new URLSearchParams({
    city_id: params.cityId,
    inventory_id: params.inventoryId,
  });
  const response = await fetch(
    `/api/v1/stationary-energy-drafts/resume?${query.toString()}`,
  );
  if (response.status === 404) {
    return null;
  }
  return readJson<DraftStatusResponse>(
    response,
    "Failed to resume Stationary Energy draft",
  );
}

export async function createChatThread(params: {
  inventoryId: string;
  signal?: AbortSignal;
}): Promise<{ threadId: string }> {
  const response = await fetch("/api/v1/chat/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: params.signal,
    body: JSON.stringify({
      inventory_id: params.inventoryId,
      title: "Stationary Energy draft",
    }),
  });
  return readJson<{ threadId: string }>(
    response,
    "Failed to create Clima chat thread",
  );
}

export async function startDraftRun(params: {
  cityId: string;
  inventoryId: string;
  threadId: string | null;
  locale: string;
}): Promise<{ draft_run_id?: string }> {
  const response = await fetch("/api/v1/stationary-energy-drafts/start/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      city_id: params.cityId,
      inventory_id: params.inventoryId,
      thread_id: params.threadId ?? undefined,
      locale: params.locale,
    }),
  });
  return readJson<{ draft_run_id?: string }>(
    response,
    "Failed to start Stationary Energy draft",
  );
}

export async function persistReviewDecisionPayload(params: {
  draftRunId: string;
  inventoryId: string;
  decisions: unknown[];
}): Promise<unknown> {
  const response = await fetch(
    `/api/v1/stationary-energy-drafts/${params.draftRunId}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventory_id: params.inventoryId,
        decisions: params.decisions,
      }),
    },
  );
  return readJson(
    response,
    "Failed to save Stationary Energy draft decisions",
  );
}

export async function saveAcceptedDraftRows(params: {
  draftRunId: string;
  inventoryId: string;
}): Promise<SaveResponse> {
  const response = await fetch(
    `/api/v1/stationary-energy-drafts/${params.draftRunId}/save`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventory_id: params.inventoryId,
      }),
    },
  );
  return readJson<SaveResponse>(
    response,
    "Failed to save accepted Stationary Energy rows",
  );
}
