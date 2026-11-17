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

/** What a Partial value is missing, against its gold row. */
export const PARTIAL_REASONS = [
  "less_detail",
  "incomplete_list",
  "merged_items",
] as const;
export type PartialReason = (typeof PARTIAL_REASONS)[number];

/** Likely cause of an error verdict, for the causes analysis. */
export const ERROR_CAUSES = [
  "ocr_text_extraction",
  "chunking",
  "prompt",
  "figure_or_map",
  "field_outside_v0",
  "scope",
  "gold_issue",
] as const;
export type ErrorCause = (typeof ERROR_CAUSES)[number];

/** Verdicts that are not errors, so they carry no cause. */
export const NO_CAUSE_VERDICTS: readonly Verdict[] = [
  "Correct",
  "Correct (NOT_FOUND)",
  "Normalisation",
];

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

/** Pages of the original PDF that one part covered, and its size. */
export interface PartRange {
  startPage: number;
  pageCount: number;
  bytes: number;
}

/** "1–62, 63–121": the part boundaries, where a passage may have been cut. */
export function formatPartPages(ranges: PartRange[]): string {
  return ranges
    .map((r) => `${r.startPage}–${r.startPage + r.pageCount - 1}`)
    .join(", ");
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
  /** Set exactly when the verdict is Partial. */
  partialReason: PartialReason | null;
  /** Set exactly when the verdict is an error (not Correct, Correct (NOT_FOUND) or Normalisation). */
  cause: ErrorCause | null;
}

/** One scored line: a gold row, an extra model value, or a duplicate match. */
export interface ScoredRow {
  kind: "gold" | "extra" | "duplicate";
  /** Sheet row of the gold row; null for extras and duplicates. */
  rowNumber: number | null;
  fieldId: string;
  itemKey: string;
  goldStatus: GoldStatus | null;
  /** The gold row's answer, for review; empty for extras. */
  goldValue: string;
  goldEvidence: string;
  goldPages: number[];
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
  /** From the judgment that gives this row its verdict. */
  partialReason: PartialReason | null;
  /** From that judgment; rule-scored Omission rows of non-v0 fields get field_outside_v0. */
  cause: ErrorCause | null;
}

/** Adapter field ids whose gold answer key uses another id for the same requirement. */
export const ADAPTER_TO_GOLD_FIELD: Record<string, string> = {
  "A2.4a": "A2.4",
};

export function goldFieldId(adapterFieldId: string): string {
  return ADAPTER_TO_GOLD_FIELD[adapterFieldId] ?? adapterFieldId;
}
