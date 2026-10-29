/**
 * OpenAI adapter for the universal LLM wrapper.
 * Uses chat completions only; no assistants or tools. Add other adapters (e.g. anthropic-adapter.ts) alongside.
 */

import OpenAI from "openai";
import type {
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMConfig,
  LLMMessage,
} from "./types";
import { LLMError, LLMErrorCode } from "./types";

/**
 * Reasoning models (gpt-5 and later, o-series) accept only the default temperature and
 * answer 400 "temperature does not support 0 with this model" to any other value.
 * OpenRouter drops the parameter silently, the OpenAI API does not. The provider
 * prefix (`openai/gpt-5.6-luna`) is ignored.
 */
export function supportsCustomTemperature(model: string): boolean {
  const name = model.split("/").pop() ?? model;
  return !/^(gpt-[5-9]|o\d)/i.test(name);
}

function toOpenAIRole(
  role: LLMMessage["role"],
): "system" | "user" | "assistant" {
  return role;
}

/**
 * Maps OpenAI API errors to app-level LLMError with LLMErrorCode.
 */
function normalizeError(err: unknown): LLMError {
  if (err instanceof LLMError) return err;
  const openaiError = err as {
    status?: number;
    message?: string;
    code?: string;
  };
  const status = openaiError?.status;
  const message = openaiError?.message ?? String(err);
  if (status === 401) {
    return new LLMError(message, LLMErrorCode.AUTH, err);
  }
  if (status === 429) {
    return new LLMError(message, LLMErrorCode.RATE_LIMIT, err);
  }
  if (status === 400 || status === 422) {
    return new LLMError(message, LLMErrorCode.BAD_REQUEST, err);
  }
  if (
    (typeof openaiError?.code === "string" &&
      openaiError.code.toLowerCase().includes("timeout")) ||
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("request was aborted")
  ) {
    return new LLMError(message, LLMErrorCode.TIMEOUT, err);
  }
  return new LLMError(message, LLMErrorCode.PROVIDER_ERROR, err);
}

export async function openaiComplete(
  options: LLMCompleteOptions,
  config: LLMConfig,
): Promise<LLMCompleteResult> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL && { baseURL: config.baseURL }),
  });

  const model = options.model ?? config.model;
  // Some models (e.g. gpt-4o-mini) only support default temperature (1); omit when 0.1 to avoid 400
  const customTemperature = supportsCustomTemperature(model);
  const sendTemperature =
    options.temperature !== undefined &&
    options.temperature !== 0.1 &&
    customTemperature;
  // Only reasoning models (the ones without custom temperature) take reasoning_effort.
  const sendReasoningEffort = !!options.reasoningEffort && !customTemperature;

  const body: OpenAI.Chat.ChatCompletionCreateParams = {
    model,
    messages: options.messages.map((m) => ({
      role: toOpenAIRole(m.role),
      content: m.content,
    })),
    ...(sendTemperature && { temperature: options.temperature }),
    // Newer models (e.g. gpt-4o-mini) require max_completion_tokens; older accept both
    ...(options.maxTokens !== undefined && {
      max_completion_tokens: options.maxTokens,
    }),
    ...(options.jsonMode && { response_format: { type: "json_object" } }),
    ...(sendReasoningEffort && {
      reasoning_effort:
        options.reasoningEffort as OpenAI.Chat.ChatCompletionCreateParams["reasoning_effort"],
    }),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await client.chat.completions.create(
      body as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);

    const choice = response.choices?.[0];
    const content = choice?.message?.content ?? "";
    const usage = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
          reasoningTokens:
            response.usage.completion_tokens_details?.reasoning_tokens,
        }
      : undefined;

    return {
      content,
      model: response.model ?? model,
      usage,
      finishReason: choice?.finish_reason ?? undefined,
      raw: response,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort =
      (err instanceof Error && err.name === "AbortError") ||
      /request was aborted|aborted/i.test(msg);
    if (isAbort) {
      throw new LLMError("Request timed out", LLMErrorCode.TIMEOUT, err);
    }
    throw normalizeError(err);
  }
}
