/**
 * Universal LLM wrapper – provider-agnostic types and errors.
 * Used for Path C (extraction) and future Path B (interpretation). No migration of existing OpenAI callers.
 */

export type LLMMessageRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
}

export interface LLMCompleteOptions {
  /** Role in llm_config.yaml that supplies model, temperature and reasoning effort. */
  use: LLMUse;
  /** Chat messages (system + user, or user + assistant + user, etc.). */
  messages: LLMMessage[];
  /** Max tokens to generate. Optional; provider default if not set. */
  maxTokens?: number;
  /** Ask for JSON output; adapter may set response_format / schema hint where supported. Caller still parses. */
  jsonMode?: boolean;
  /** Strict structured output (OpenAI json_schema); wins over jsonMode. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}

export interface LLMUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Part of completionTokens spent on hidden reasoning (reasoning models only). */
  reasoningTokens?: number;
}

export interface LLMCompleteResult {
  /** Assistant message content (plain text or JSON string). */
  content: string;
  /** Token usage when available. */
  usage?: LLMUsage;
  /** Model that answered, as reported by the provider. */
  model?: string;
  /** Why the model stopped, e.g. "stop" or "length" (cut off at the token limit). */
  finishReason?: string;
  /** Raw provider response for debugging; avoid logging. */
  raw?: unknown;
}

/** App-level error codes so callers don't branch on provider. */
export enum LLMErrorCode {
  TIMEOUT = "LLM_TIMEOUT",
  RATE_LIMIT = "LLM_RATE_LIMIT",
  AUTH = "LLM_AUTH",
  BAD_REQUEST = "LLM_BAD_REQUEST",
  PROVIDER_ERROR = "LLM_PROVIDER_ERROR",
  CONFIG = "LLM_CONFIG",
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: LLMErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LLMError";
    Object.setPrototypeOf(this, LLMError.prototype);
  }
}

/** Roles that pick a model; keys of `models` in llm_config.yaml. */
export const LLM_USES = [
  "pdf_extraction",
  "crva_extraction",
  "file_interpretation",
] as const;
export type LLMUse = (typeof LLM_USES)[number];
export type LLMReasoningEffort = "low" | "medium" | "high";

/** Model settings for one role, from llm_config.yaml. */
export interface LLMModelConfig {
  name: string;
  temperature?: number;
  reasoningEffort?: LLMReasoningEffort;
}

/** Validated contents of llm_config.yaml. */
export interface LLMFileConfig {
  models: Record<LLMUse, LLMModelConfig>;
  timeoutMs: number;
  maxRetries: number;
}

/** Config used by createLLMClient and adapters: env (provider, key, base URL) plus llm_config.yaml. */
export interface LLMConfig {
  provider: string;
  apiKey: string;
  baseURL?: string;
  models: Record<LLMUse, LLMModelConfig>;
  timeoutMs: number;
  maxRetries: number;
}

/** Internal adapter interface; one implementation per provider (OpenAI, Anthropic, etc.). */
export interface ILLMAdapter {
  complete(
    options: LLMCompleteOptions,
    config: LLMConfig,
    model: LLMModelConfig,
  ): Promise<LLMCompleteResult>;
}
