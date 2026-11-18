import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CRVA_FIELD_IDS,
  type CrvaDraftBundle,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import type { OcrCache } from "../crva-eval/ocr-cache";
import type { RunStats } from "../crva-eval/run-adapter";
import type { Variant } from "./instructions";

/**
 * What one agent run returns: its raw output file, usage and caps.
 * Check `error` before using `outputText`: a capped run still returns whatever the agent
 * wrote (for debugging), and that output must not become a bundle.
 */
export interface AgentRunResult {
  /** Content of output/values.jsonl, or null when the agent never wrote it. */
  outputText: string | null;
  usage: { promptTokens: number; completionTokens: number };
  /** Model calls (one per turn). */
  modelTurns: number;
  toolCalls: number;
  /** Set when a cap stopped the run: "max turns <n>" or "timeout <m> min". */
  error?: string;
}

/**
 * The agent's starting files and nothing else (no .env, no keys).
 * A: one OCR page per file. B: the PDF itself. Both: an empty output/ for values.jsonl.
 */
export async function prepareWorkspace(
  variant: Variant,
  dir: string,
  ocr: OcrCache,
  pdfPath: string,
): Promise<void> {
  await mkdir(path.join(dir, "output"), { recursive: true });
  if (variant === "B") {
    await copyFile(pdfPath, path.join(dir, "doc.pdf"));
    return;
  }
  await mkdir(path.join(dir, "pages"), { recursive: true });
  for (const [page, text] of ocr.pages) {
    const name = `page-${String(page).padStart(3, "0")}.md`;
    await writeFile(path.join(dir, "pages", name), text);
  }
}

/**
 * Harness-shaped stats for one agent run. A capped run (`error`) or a missing output file
 * fails the run; a run with an output file but no values is ok. `warnings` is left at 0:
 * the caller sets it from the plugin's validate().
 */
export function statsFromAgent(
  run: number,
  result: AgentRunResult,
  bundle: CrvaDraftBundle | null,
  minutes: number,
  ocr: OcrCache,
): RunStats {
  const error =
    result.error ?? (result.outputText === null ? "no output file" : undefined);
  const kept = error ? null : bundle;
  const droppedByReason: Record<string, number> = {};
  for (const d of kept?.dropped ?? []) {
    droppedByReason[d.reason] = (droppedByReason[d.reason] ?? 0) + 1;
  }
  return {
    run,
    status: error ? "failed" : "ok",
    minutes,
    parts: ocr.partRanges.length,
    partRanges: ocr.partRanges,
    retries: 0,
    ocrPages: ocr.pageCount,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    llmCalls: result.modelTurns,
    nonStopFinishes: 0,
    modelTurns: result.modelTurns,
    toolCalls: result.toolCalls,
    valuesKept: kept?.values.length ?? 0,
    valuesDropped: kept?.dropped.length ?? 0,
    droppedByReason,
    fieldsWithValue: kept
      ? CRVA_FIELD_IDS.length - kept.uncoveredFields.length
      : 0,
    figures: kept?.figures.length ?? 0,
    warnings: 0,
    ...(error ? { error } : {}),
  };
}
