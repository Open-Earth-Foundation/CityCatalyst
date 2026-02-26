/**
 * Load LLM config from environment. Used by createLLMClient.
 * Env vars: OPENAI_API_KEY (required), LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL (optional), LLM_TIMEOUT_MS, LLM_MAX_RETRIES.
 * Defaults: provider "openai", model "gpt-4o-mini". API key is read from OPENAI_API_KEY.
 * For long PDF extraction, set LLM_TIMEOUT_MS=120000 (or higher) if chunked extraction still times out.
 */

import { LLMError, LLMErrorCode } from "./types";
import type { LLMConfig } from "./types";

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
