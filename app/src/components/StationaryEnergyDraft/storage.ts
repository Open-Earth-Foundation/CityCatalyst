"use client";

type StoredDraftContext = {
  draftRunId: string;
  threadId: string | null;
  pendingRequest?: string;
};

function buildDraftStorageKey(inventoryId: string): string {
  return `stationary-energy-draft:${inventoryId}`;
}

export function readStoredDraftContext(
  inventoryId: string,
): StoredDraftContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(buildDraftStorageKey(inventoryId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      draftRunId?: unknown;
      threadId?: unknown;
      pendingRequest?: unknown;
    };
    if (typeof parsed.draftRunId !== "string" || !parsed.draftRunId.trim()) {
      return null;
    }

    return {
      draftRunId: parsed.draftRunId,
      threadId:
        typeof parsed.threadId === "string" && parsed.threadId.trim()
          ? parsed.threadId
          : null,
      ...(typeof parsed.pendingRequest === "string" &&
      parsed.pendingRequest.trim()
        ? { pendingRequest: parsed.pendingRequest }
        : {}),
    };
  } catch {
    return null;
  }
}

export function writeStoredDraftContext(
  inventoryId: string,
  context: StoredDraftContext,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      buildDraftStorageKey(inventoryId),
      JSON.stringify(context),
    );
  } catch {
    // The current session can still continue when browser storage is unavailable.
  }
}

export function clearStoredDraftContext(inventoryId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(buildDraftStorageKey(inventoryId));
  } catch {
    // Browser storage can be unavailable in private or restricted sessions.
  }
}
