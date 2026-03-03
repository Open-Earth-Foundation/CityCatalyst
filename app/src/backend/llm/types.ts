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
  /** Chat messages (system + user, or user + assistant + user, etc.). */
  messages: LLMMessage[];
  /** Override default model for this call. */
  model?: string;
  /** Temperature 0–2. Optional; provider default if not set. */
  temperature?: number;
  /** Max tokens to generate. Optional; provider default if not set. */
  maxTokens?: number;
  /** Ask for JSON output; adapter may set response_format / schema hint where supported. Caller still parses. */
  jsonMode?: boolean;
}

export interface LLMUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LLMCompleteResult {
  /** Assistant message content (plain text or JSON string). */
  content: string;
  /** Token usage when available. */
  usage?: LLMUsage;
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

/** Config loaded from env; used by createLLMClient and adapters. */
export interface LLMConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseURL?: string;
  timeoutMs: number;
  maxRetries: number;
}

/** Internal adapter interface; one implementation per provider (OpenAI, Anthropic, etc.). */
export interface ILLMAdapter {
  complete(options: LLMCompleteOptions, config: LLMConfig): Promise<LLMCompleteResult>;
}
