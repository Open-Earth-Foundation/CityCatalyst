import type {
  EditApplyRequest,
  EditHistoryEntry,
  EditHistoryRequest,
  EditProposal,
  EditProposalRequest,
} from "@/util/concept-note-edit-types";

export class ConceptNoteEditError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super("The Concept Note edit request failed");
  }
}

async function editRequest<T>(
  runId: string,
  {
    suffix = "",
    body,
    signal,
    collection = "edit-proposals",
  }: {
    suffix?: string;
    body?: object;
    signal?: AbortSignal;
    collection?: "edit-proposals" | "revisions";
  } = {},
): Promise<T> {
  const response = await fetch(
    `/api/v1/concept-notes/${encodeURIComponent(runId)}/${collection}${suffix}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const code =
      typeof payload === "object" &&
      payload !== null &&
      "code" in payload &&
      typeof payload.code === "string"
        ? payload.code
        : "edit_request_failed";
    throw new ConceptNoteEditError(response.status, code);
  }
  return payload as T;
}

export function listEditProposals(
  runId: string,
  signal?: AbortSignal,
): Promise<EditProposal[]> {
  return editRequest(runId, { signal });
}

export function getEditProposal(
  runId: string,
  proposalId: string,
): Promise<EditProposal> {
  return editRequest(runId, { suffix: `/${encodeURIComponent(proposalId)}` });
}

export function createEditProposal(
  runId: string,
  body: EditProposalRequest,
): Promise<EditProposal> {
  return editRequest(runId, { body });
}

export function applyEditProposal(
  runId: string,
  proposalId: string,
  body: EditApplyRequest,
): Promise<EditProposal> {
  return editRequest(runId, {
    suffix: `/${encodeURIComponent(proposalId)}/apply`,
    body,
  });
}

export function rejectEditProposal(
  runId: string,
  proposalId: string,
): Promise<EditProposal> {
  return editRequest(runId, {
    suffix: `/${encodeURIComponent(proposalId)}/reject`,
    body: {},
  });
}

export function refineEditProposal(
  runId: string,
  proposalId: string,
  body: EditProposalRequest,
): Promise<EditProposal> {
  return editRequest(runId, {
    suffix: `/${encodeURIComponent(proposalId)}/refine`,
    body,
  });
}

export function listEditHistory(
  runId: string,
  beforeSequence?: number,
): Promise<EditHistoryEntry[]> {
  return editRequest(runId, {
    collection: "revisions",
    suffix: beforeSequence ? `?before_sequence=${beforeSequence}` : "",
  });
}

export function getEditHistory(
  runId: string,
  revisionId: string,
): Promise<EditHistoryEntry> {
  return editRequest(runId, {
    collection: "revisions",
    suffix: `/${encodeURIComponent(revisionId)}`,
  });
}

export function restoreEditHistory(
  runId: string,
  revisionId: string,
  operation: "undo" | "restore",
  body: EditHistoryRequest,
): Promise<EditHistoryEntry> {
  return editRequest(runId, {
    collection: "revisions",
    suffix: `/${encodeURIComponent(revisionId)}/${operation}`,
    body,
  });
}
