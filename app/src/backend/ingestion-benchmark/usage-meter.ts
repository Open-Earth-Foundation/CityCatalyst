/**
 * Counts LLM calls and tokens of the PDF benchmark from the product logs.
 *
 * Product code logs every LLM call with its token usage; the meter reads those
 * lines from the shared pino stream so the benchmark needs no product change.
 * The meter wraps a stream once: a run with several contexts (`--all` groups)
 * installs it again on the same logger, and a second wrapper would count every
 * line twice.
 */
import pino from "pino";
import { ZERO_TOKENS, type Tokens } from "@/backend/ingestion-benchmark/report";

type Stream = { write: (chunk: string) => boolean };

const meter: Tokens = { ...ZERO_TOKENS };
let windowMax = 0;
const metered = new WeakSet<Stream>();

export const snapshot = (): Tokens => ({ ...meter });

/** Usage since `before`; also resets the largest completion seen in the window. */
export const since = (before: Tokens): Tokens => {
  const max = windowMax;
  windowMax = 0;
  return {
    calls: meter.calls - before.calls,
    promptTokens: meter.promptTokens - before.promptTokens,
    completionTokens: meter.completionTokens - before.completionTokens,
    reasoningTokens:
      (meter.reasoningTokens ?? 0) - (before.reasoningTokens ?? 0),
    lengthStops: (meter.lengthStops ?? 0) - (before.lengthStops ?? 0),
    maxCompletionTokens: max,
  };
};

export function installUsageMeter(logger: object): void {
  const stream = (logger as Record<symbol, Stream>)[pino.symbols.streamSym];
  if (metered.has(stream)) return;
  metered.add(stream);
  const write = stream.write.bind(stream);
  stream.write = (chunk: string) => {
    if (
      typeof chunk === "string" &&
      chunk.includes('"LLM complete response"')
    ) {
      try {
        const entry = JSON.parse(chunk) as {
          promptTokens?: number;
          completionTokens?: number;
          reasoningTokens?: number;
          finishReason?: string;
        };
        meter.calls += 1;
        meter.promptTokens += entry.promptTokens ?? 0;
        meter.completionTokens += entry.completionTokens ?? 0;
        meter.reasoningTokens =
          (meter.reasoningTokens ?? 0) + (entry.reasoningTokens ?? 0);
        if (entry.finishReason === "length") {
          meter.lengthStops = (meter.lengthStops ?? 0) + 1;
        }
        windowMax = Math.max(windowMax, entry.completionTokens ?? 0);
      } catch {
        // a malformed log line only loses one call from the count
      }
    }
    return write(chunk);
  };
}
