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
  usage: {
    promptTokens: number;
    completionTokens: number;
    /** Part of promptTokens served from the prompt cache, when the SDK reports it. */
    cachedInputTokens?: number;
  };
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

/** Sum of `cached_tokens` over the SDK's per-request input token details; 0 when absent. */
export function cachedInputTokens(
  details: Array<Record<string, unknown>>,
): number {
  return details.reduce((sum, d) => {
    const n = d?.cached_tokens ?? d?.cachedTokens;
    return sum + (typeof n === "number" ? n : 0);
  }, 0);
}

/** API errors can echo a (masked) key; keep any "sk-..." fragment out of files and logs. */
export function redactSecrets(text: string): string {
  return text.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
}

/**
 * Why a run failed, or undefined when its output is usable: a cap, a missing output file,
 * or an empty/whitespace-only one (a whole CRVA with zero values is an agent failure).
 */
export function agentFailure(result: AgentRunResult): string | undefined {
  if (result.error) return result.error;
  if (result.outputText === null) return "no output file";
  if (result.outputText.trim() === "") return "empty output file";
  return undefined;
}

/**
 * Harness-shaped stats for one agent run. A failed run (see agentFailure) has no bundle.
 * `warnings` is left at 0: the caller sets it from the plugin's validate().
 */
export function statsFromAgent(
  run: number,
  result: AgentRunResult,
  bundle: CrvaDraftBundle | null,
  minutes: number,
  ocr: OcrCache,
): RunStats {
  const error = agentFailure(result);
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
    ...(result.usage.cachedInputTokens !== undefined
      ? { cachedInputTokens: result.usage.cachedInputTokens }
      : {}),
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
