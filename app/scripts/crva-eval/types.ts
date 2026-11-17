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
