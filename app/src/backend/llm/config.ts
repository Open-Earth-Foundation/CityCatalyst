/**
 * Load LLM config from environment. Used by createLLMClient.
 * Env vars: LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_BASE_URL (optional), LLM_TIMEOUT_MS, LLM_MAX_RETRIES.
 */

import { LLMError, LLMErrorCode } from "./types";
import type { LLMConfig } from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 1;

export function loadLLMConfigFromEnv(): LLMConfig {
  const provider = process.env.LLM_PROVIDER?.trim() ?? "";
  const model = process.env.LLM_MODEL?.trim() ?? "";
  const apiKey = process.env.LLM_API_KEY?.trim() ?? "";

  if (!provider || !model || !apiKey) {
    throw new LLMError(
      "Missing LLM config: set LLM_PROVIDER, LLM_MODEL, and LLM_API_KEY",
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
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    maxRetries:
      Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : DEFAULT_MAX_RETRIES,
  };
}
