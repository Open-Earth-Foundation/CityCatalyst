/**
 * Universal LLM wrapper
 *
 * Purpose: Single provider-agnostic interface for LLM calls.
 * Scope: New code only;
 *
 * Config (env):
 *   LLM_PROVIDER   - e.g. "openai"
 *   LLM_MODEL      - e.g. "gpt-4o-mini"
 *   LLM_API_KEY    - API key for the provider
 *   LLM_BASE_URL   - (optional) override API base URL
 *   LLM_TIMEOUT_MS - (optional) request timeout, default 60000
 *   LLM_MAX_RETRIES - (optional) retries on timeout/rate-limit/provider error, default 1
 *
 * Example:
 *   const client = createLLMClient();
 *   const { content } = await client.complete({
 *     messages: [{ role: "system", content: "..." }, { role: "user", content: "..." }],
 *     jsonMode: true,
 *   });
 *
 * Adding a provider: implement ILLMAdapter in a new file (e.g. anthropic-adapter.ts),
 * then register in client.ts getAdapter(provider).
 */

export { createLLMClient } from "./client";
export type { LLMClient } from "./client";
export { loadLLMConfigFromEnv } from "./config";
export { LLMError, LLMErrorCode } from "./types";
export type {
  LLMConfig,
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMMessage,
  LLMMessageRole,
  LLMUsage,
} from "./types";
