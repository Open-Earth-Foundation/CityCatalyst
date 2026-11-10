/**
 * LLM config. The yaml file llm_config.yaml (app root) holds the non-secret settings: per role
 * (pdf_extraction, crva_extraction, file_interpretation) the model name, temperature and
 * reasoning effort, plus api.timeout_ms and api.max_retries. loadLLMFileConfig reads and
 * validates it; the result is cached once per process and the cache is not keyed by path, so
 * changing LLM_CONFIG_PATH after the first load needs resetLLMConfigCache().
 * Env vars that remain: OPENAI_API_KEY (required), LLM_PROVIDER (default "openai"),
 * LLM_BASE_URL (optional) and LLM_CONFIG_PATH (optional path of the yaml file; default
 * llm_config.yaml in the working directory). loadLLMConfig combines both for createLLMClient.
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

import { LLMError, LLMErrorCode, LLM_USES } from "./types";
import type { LLMConfig, LLMFileConfig, LLMModelConfig, LLMUse } from "./types";

const DEFAULT_PROVIDER = "openai";

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

/** Config for createLLMClient: provider, key and base URL from env, the rest from llm_config.yaml. */
export function loadLLMConfig(): LLMConfig {
  const provider =
    (process.env.LLM_PROVIDER?.trim() ?? "").toLowerCase() || DEFAULT_PROVIDER;
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";

  if (!apiKey) {
    throw new LLMError(
      "Missing LLM API key: set OPENAI_API_KEY",
      LLMErrorCode.CONFIG,
    );
  }

  const { models, timeoutMs, maxRetries } = loadLLMFileConfig();
  return {
    provider,
    apiKey,
    baseURL: process.env.LLM_BASE_URL?.trim() || undefined,
    models,
    timeoutMs,
    maxRetries,
  };
}
