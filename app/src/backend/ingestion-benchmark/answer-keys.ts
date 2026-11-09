/**
 * Answer-key types and loader for the PDF extraction benchmark. The JSON is
 * produced from the Product answer-key workbook by
 * scripts/pdf-benchmark/export-answer-keys.ts and is never committed.
 */
import { readFileSync } from "node:fs";

export type KeyRow = {
  row: number | null;
  description: string;
  year: number | null;
  value: number | null;
  gpc: string;
  scope: string;
  ambiguous: boolean;
  rowType: string;
  notation: string;
  scored: boolean;
  note: string;
};

export type KeyDistractor = {
  where: string;
  what: string;
  examples: string;
  numbers: number[];
  failureMode: string;
};

export type KeyFile = {
  id: string;
  city: string;
  country: string;
  year: number;
  fileName: string;
  expectedTotal: number | null;
  toleranceText: string;
  tolerance: number;
  totalTolerance: number;
  keyValueRows: number | null;
  rows: KeyRow[];
  distractors: KeyDistractor[];
  /** Not a GPC inventory: score the total only, not the rows. */
  nonGpc?: boolean;
};

export function loadAnswerKeys(path: string): Record<string, KeyFile> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    files: Record<string, KeyFile>;
  };
  return parsed.files;
}
