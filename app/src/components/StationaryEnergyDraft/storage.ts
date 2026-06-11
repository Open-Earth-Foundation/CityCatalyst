"use client";

type StoredDraftContext = {
  draftRunId: string;
  threadId: string | null;
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

  window.localStorage.setItem(
    buildDraftStorageKey(inventoryId),
    JSON.stringify(context),
  );
}

export function clearStoredDraftContext(inventoryId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(buildDraftStorageKey(inventoryId));
}
