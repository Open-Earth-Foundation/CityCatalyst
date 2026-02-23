/**
 * Universal LLM client: loads config, selects adapter, exposes complete() with retries and logging.
 */

import { logger } from "@/services/logger";
import { loadLLMConfigFromEnv } from "./config";
import { openaiComplete } from "./openai-adapter";
import type {
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMConfig,
  ILLMAdapter,
} from "./types";
import { LLMError, LLMErrorCode } from "./types";

const log = logger.child({ module: "llm" });

function getAdapter(provider: string): ILLMAdapter {
  const p = provider.toLowerCase();
  if (p === "openai") {
    return { complete: openaiComplete };
  }
  throw new LLMError(
    `Unsupported LLM provider: ${provider}. Add an adapter in backend/llm/ and register here.`,
    LLMErrorCode.CONFIG,
  );
}

export interface LLMClient {
  complete(options: LLMCompleteOptions): Promise<LLMCompleteResult>;
  getConfig(): LLMConfig;
}

export interface CreateLLMClientOptions {
  config?: LLMConfig;
  /** Inject adapter for testing; otherwise selected from config.provider. */
  adapter?: ILLMAdapter;
}

/**
 * Create an LLM client. If config is omitted, loads from env (LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, etc.).
 */

export function createLLMClient(
  options?: LLMConfig | CreateLLMClientOptions,
): LLMClient {
  const opts: CreateLLMClientOptions =
    options && typeof (options as CreateLLMClientOptions).adapter === "object"
      ? (options as CreateLLMClientOptions)
      : { config: options as LLMConfig | undefined };
  const resolvedConfig = opts.config ?? loadLLMConfigFromEnv();
  const adapter = opts.adapter ?? getAdapter(resolvedConfig.provider);

  async function complete(
    options: LLMCompleteOptions,
  ): Promise<LLMCompleteResult> {
    const model = options.model ?? resolvedConfig.model;
    log.debug(
      {
        provider: resolvedConfig.provider,
        model,
        messageCount: options.messages.length,
      },
      "LLM complete request",
    );

    let lastError: unknown;
    const maxAttempts = resolvedConfig.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await adapter.complete(options, resolvedConfig);
        if (result.usage) {
          log.debug(
            {
              provider: resolvedConfig.provider,
              model,
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
            },
            "LLM complete response",
          );
        }
        return result;
      } catch (err) {
        lastError = err;
        const code = err instanceof LLMError ? err.code : undefined;
        const retryable =
          code === LLMErrorCode.TIMEOUT ||
          code === LLMErrorCode.RATE_LIMIT ||
          code === LLMErrorCode.PROVIDER_ERROR;
        if (!retryable || attempt === maxAttempts) {
          throw err;
        }
        log.debug(
          {
            provider: resolvedConfig.provider,
            attempt,
            maxAttempts,
            code,
            err: lastError,
            ...(lastError instanceof Error && {
              errorMessage: lastError.message,
              errorStack: lastError.stack,
            }),
          },
          "LLM request failed, retrying",
        );
      }
    }

    throw lastError;
  }

  return {
    complete,
    getConfig: () => resolvedConfig,
  };
}
