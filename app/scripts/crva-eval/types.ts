export const VERDICTS = [
  "Correct",
  "Correct (NOT_FOUND)",
  "Partial",
  "Hallucination",
  "Omission",
  "Wrong content",
  "Misattribution",
  "Unsupported inference",
  "Normalisation",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const MODEL_STATUSES = ["FOUND", "PARTIAL", "NOT_FOUND"] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];
export type GoldStatus = ModelStatus | "N/A";

export interface PdfPart {
  index: number;
  /** 1-based page number in the original PDF. */
  startPage: number;
  pageCount: number;
  buffer: Buffer;
}

/** One row of the Gold tab (the human-made answer key). */
export interface GoldRow {
  /** 1-based row in the Sheet, so reports can point back to it. */
  rowNumber: number;
  fieldId: string;
  itemKey: string;
  goldValue: string;
  pages: number[];
  evidence: string;
  status: GoldStatus;
  notes: string;
  /** Notes start with `TRAP:`: the annotator marked a look-alike page. */
  trapNote: boolean;
}

export interface TrapEntry {
  pages: number[] | "all";
  what: string;
  why: string;
}

export interface GoldWorkbook {
  pdfFileName: string;
  pageCount: number;
  rows: GoldRow[];
  traps: TrapEntry[];
}

/** The judge's reading of one model value of a field. */
export interface Judgment {
  /** Index into the field's values in bundle order. */
  valueIndex: number;
  /** Gold row the value fills, or null when it fills none. */
  itemKey: string | null;
  verdict: Verdict | null;
  modelStatus: ModelStatus;
  reason: string;
  /** A close call a person checks before the number is published. */
  uncertain: boolean;
  /** The value is in the PDF but the gold missed it; no row, no verdict. */
  goldGap: boolean;
  /** `<fieldId>/<item_key>` of the row the value belongs in, for Misattribution. */
  misattributedTo: string | null;
}

/** One scored line: a gold row, an extra model value, or a duplicate match. */
export interface ScoredRow {
  kind: "gold" | "extra" | "duplicate";
  /** Sheet row of the gold row; null for extras and duplicates. */
  rowNumber: number | null;
  fieldId: string;
  itemKey: string;
  goldStatus: GoldStatus | null;
  isV0Field: boolean;
  trap: boolean;
  modelValue: string;
  modelEvidence: string;
  modelStatus: ModelStatus;
  verdict: Verdict | null;
  /** Eval note for the Sheet's `eval notes` column (never the gold notes). */
  notes: string;
  /** The judge's reason. */
  reason: string;
  uncertain: boolean;
}
