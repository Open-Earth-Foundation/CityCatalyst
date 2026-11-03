/** Stored per row in `mappingConfiguration.overrides`. */
export type ImportRowDecision = {
  reviewDecision: "keep" | "reclassify" | "skip";
  gpcRefNo?: string;
  /** What the user saw: the server drops a decision when the row differs. */
  decisionRef: string;
  decisionValue: number | null;
};

/** Decisions belong to one uploaded file: row numbers mean nothing across files. */
export type FileRowDecisions = {
  fileId: string | null;
  decisions: Record<string, ImportRowDecision>;
};

export const NO_ROW_DECISIONS: FileRowDecisions = {
  fileId: null,
  decisions: {},
};

export function decisionsForFile(
  state: FileRowDecisions,
  fileId: string | null,
): Record<string, ImportRowDecision> {
  return state.fileId === fileId ? state.decisions : {};
}

export function withRowDecision(
  state: FileRowDecisions,
  fileId: string | null,
  rowIndex: number,
  decision: ImportRowDecision | null,
): FileRowDecisions {
  const { [String(rowIndex)]: _previous, ...rest } = decisionsForFile(
    state,
    fileId,
  );
  return {
    fileId,
    decisions: decision ? { ...rest, [String(rowIndex)]: decision } : rest,
  };
}
