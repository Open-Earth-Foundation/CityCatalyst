/**
 * Universal LLM wrapper
 *
 * Purpose: Single provider-agnostic interface for LLM calls.
 * Scope: New code only;
 *
 * Config: llm_config.yaml (app root; path override LLM_CONFIG_PATH) maps each role
 * (`use`) to a model, temperature and reasoning effort, plus api timeout and retries.
 * Env: OPENAI_API_KEY (required), LLM_PROVIDER ("openai" default), LLM_BASE_URL (optional).
 *
 * Example:
 *   const client = createLLMClient();
 *   const { content } = await client.complete({
 *     use: "pdf_extraction",
 *     messages: [{ role: "system", content: "..." }, { role: "user", content: "..." }],
 *     jsonMode: true,
 *   });
 *
 * Adding a provider: implement ILLMAdapter in a new file (e.g. anthropic-adapter.ts),
 * then register in client.ts getAdapter(provider).
 */

export { createLLMClient } from "./client";
export type { LLMClient } from "./client";
export { loadLLMConfig } from "./config";
export { LLMError, LLMErrorCode } from "./types";
export type {
  LLMConfig,
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMMessage,
  LLMMessageRole,
  LLMModelConfig,
  LLMUse,
  LLMUsage,
} from "./types";
