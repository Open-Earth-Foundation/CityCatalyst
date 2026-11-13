import { describe, expect, it } from "@jest/globals";
import pino from "pino";
import {
  installUsageMeter,
  since,
  snapshot,
} from "@/backend/ingestion-benchmark/usage-meter";

const line = (promptTokens: number) =>
  JSON.stringify({
    msg: "LLM complete response",
    promptTokens,
    completionTokens: 10,
  });

describe("installUsageMeter", () => {
  it("counts each log line once when three contexts install it on one logger", () => {
    const written: string[] = [];
    const stream = {
      write: (chunk: string) => {
        written.push(chunk);
        return true;
      },
    };
    const logger = { [pino.symbols.streamSym]: stream };
    // A 27-case --all run creates three contexts, one per group.
    for (let group = 1; group <= 3; group += 1) {
      installUsageMeter(logger);
      const before = snapshot();
      stream.write(line(100));
      const usage = since(before);
      expect(usage.calls).toBe(1);
      expect(usage.promptTokens).toBe(100);
      expect(usage.completionTokens).toBe(10);
    }
    expect(written).toHaveLength(3);
  });
});
