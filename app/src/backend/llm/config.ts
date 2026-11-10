/**
 * Load LLM config from environment. Used by createLLMClient.
 * Env vars: OPENAI_API_KEY (required), LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL (optional), LLM_TIMEOUT_MS, LLM_MAX_RETRIES.
 * Defaults: provider "openai", model "gpt-4o-mini". API key is read from OPENAI_API_KEY.
 * For long PDF extraction, raise LLM_TIMEOUT_MS; the deploy workflows set 180000.
 * PDF extraction (InventoryExtractionService) also reads LLM_EXTRACTION_MODEL (falls back
 * to LLM_MODEL) and LLM_EXTRACTION_REASONING_EFFORT ("low", "medium" or "high";
 * unset = provider default).
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

import { LLMError, LLMErrorCode, LLM_USES } from "./types";
import type { LLMConfig, LLMFileConfig, LLMModelConfig, LLMUse } from "./types";

/** Default request timeout; increase for long PDF extraction (e.g. LLM_TIMEOUT_MS=120000). */
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4o-mini";

export function loadLLMConfigFromEnv(): LLMConfig {
  const provider =
    (process.env.LLM_PROVIDER?.trim() ?? "").toLowerCase() || DEFAULT_PROVIDER;
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";

  if (!apiKey) {
    throw new LLMError(
      "Missing LLM API key: set OPENAI_API_KEY",
      LLMErrorCode.CONFIG,
    );
  }

  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS ?? "", 10);
  const maxRetries = parseInt(process.env.LLM_MAX_RETRIES ?? "", 10);

  return {
    provider: provider.toLowerCase(),
    model,
    apiKey,
    baseURL: process.env.LLM_BASE_URL?.trim() || undefined,
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_TIMEOUT_MS,
    maxRetries:
      Number.isFinite(maxRetries) && maxRetries >= 0
        ? maxRetries
        : DEFAULT_MAX_RETRIES,
  };
}

const modelSchema = z
  .object({
    name: z.string().trim().min(1),
    temperature: z.number().min(0).max(2).optional(),
    reasoning_effort: z.enum(["low", "medium", "high"]).optional(),
    description: z.string().optional(),
  })
  .strict();

const fileSchema = z
  .object({
    models: z
      .object({
        pdf_extraction: modelSchema,
        crva_extraction: modelSchema,
        file_interpretation: modelSchema,
      })
      .strict(),
    api: z
      .object({
        timeout_ms: z.number().int().positive(),
        max_retries: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

type ParsedModel = z.infer<typeof modelSchema>;

let cachedFileConfig: LLMFileConfig | undefined;

/** Path of llm_config.yaml: LLM_CONFIG_PATH when set, else the file in the app root. */
export function resolveLLMConfigPath(): string {
  return (
    process.env.LLM_CONFIG_PATH?.trim() ||
    path.join(process.cwd(), "llm_config.yaml")
  );
}

function toModelConfig(model: ParsedModel): LLMModelConfig {
  const config: LLMModelConfig = { name: model.name };
  if (model.temperature !== undefined) config.temperature = model.temperature;
  if (model.reasoning_effort !== undefined) {
    config.reasoningEffort = model.reasoning_effort;
  }
  return config;
}

/** Read, validate and cache llm_config.yaml. Throws LLMError (CONFIG) on any problem. */
export function loadLLMFileConfig(): LLMFileConfig {
  if (cachedFileConfig) return cachedFileConfig;

  const filePath = resolveLLMConfigPath();
  const fail = (detail: string, cause: unknown): never => {
    throw new LLMError(
      `LLM config ${filePath}: ${detail}`,
      LLMErrorCode.CONFIG,
      cause,
    );
  };

  let raw: unknown;
  try {
    raw = parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), error);
  }

  const result = fileSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return fail(detail, result.error);
  }

  const { models, api } = result.data;
  cachedFileConfig = {
    models: Object.fromEntries(
      LLM_USES.map((use: LLMUse) => [use, toModelConfig(models[use])]),
    ) as Record<LLMUse, LLMModelConfig>,
    timeoutMs: api.timeout_ms,
    maxRetries: api.max_retries,
  };
  return cachedFileConfig;
}

/** Clear the cached config (tests). */
export function resetLLMConfigCache(): void {
  cachedFileConfig = undefined;
}
