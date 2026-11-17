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
