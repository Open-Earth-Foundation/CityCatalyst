import type { LLMClient } from "@/backend/llm";

export interface LlmCallRecord {
  promptTokens: number;
  completionTokens: number;
  finishReason: string | null;
}

/** The finish reason is read from the provider response, not the app wrapper. */
function finishReasonOf(raw: unknown): string | null {
  const choices = (raw as { choices?: { finish_reason?: unknown }[] } | null)
    ?.choices;
  const reason = choices?.[0]?.finish_reason;
  return typeof reason === "string" ? reason : null;
}

/** Wraps a client so every completed call leaves a record for the run stats. */
export function recordingClient(inner: LLMClient): {
  client: LLMClient;
  calls: LlmCallRecord[];
} {
  const calls: LlmCallRecord[] = [];
  const client: LLMClient = {
    getConfig: () => inner.getConfig(),
    complete: async (options) => {
      const result = await inner.complete(options);
      calls.push({
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        finishReason: finishReasonOf(result.raw),
      });
      return result;
    },
  };
  return { client, calls };
}
