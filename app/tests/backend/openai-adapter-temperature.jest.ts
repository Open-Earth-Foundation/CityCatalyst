/**
 * The adapter sends exactly what the role's model settings define: the model name,
 * temperature and reasoning effort come from llm_config.yaml, never from the model name.
 * CC-1008: the OpenAI API answers 400 to temperature 0 for gpt-5 and o-series models,
 * so those roles define no temperature.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { LLMModelConfig } from "@/backend/llm/types";

const create = jest.fn<(body: Record<string, unknown>) => Promise<unknown>>();

jest.unstable_mockModule("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create } };
  },
}));

const { openaiComplete } = await import("@/backend/llm/openai-adapter");

const config = {
  provider: "openai",
  apiKey: "test",
  models: {},
  timeoutMs: 1000,
  maxRetries: 0,
} as never;

const call = async (model: LLMModelConfig) => {
  create.mockResolvedValue({
    choices: [{ message: { content: "{}" } }],
    usage: {},
    model: model.name,
  });
  await openaiComplete(
    { use: "pdf_extraction", messages: [{ role: "user", content: "x" }] },
    config,
    model,
  );
  return create.mock.calls[create.mock.calls.length - 1][0];
};

beforeEach(() => create.mockReset());

describe("request body", () => {
  it("sends temperature 0 when the role defines it", async () => {
    const body = await call({ name: "gpt-4o-mini", temperature: 0 });
    expect(body).toHaveProperty("temperature", 0);
  });

  it.each(["gpt-5.6-luna", "gpt-6-luna", "gpt-4o-mini"])(
    "sends no temperature when the role has none (%s)",
    async (name) => {
      const body = await call({ name });
      expect(body).not.toHaveProperty("temperature");
    },
  );

  it("sends the role's temperature for any model name", async () => {
    const body = await call({ name: "gpt-6-luna", temperature: 1 });
    expect(body).toHaveProperty("temperature", 1);
  });

  it("sends reasoning_effort when the role defines it", async () => {
    const body = await call({
      name: "gpt-5.6-luna",
      reasoningEffort: "low",
    });
    expect(body).toHaveProperty("reasoning_effort", "low");
  });

  it("sends no reasoning_effort when the role has none", async () => {
    const body = await call({ name: "gpt-5.6-luna" });
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("uses the role's model name", async () => {
    const body = await call({ name: "gpt-5.6-luna" });
    expect(body).toHaveProperty("model", "gpt-5.6-luna");
  });
});

describe("result", () => {
  it("returns the finish reason, the model and the reasoning tokens", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "{" }, finish_reason: "length" }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 16000,
        total_tokens: 16010,
        completion_tokens_details: { reasoning_tokens: 12000 },
      },
      model: "gpt-6.1-terra-2026-09-01",
    });
    const result = await openaiComplete(
      { use: "pdf_extraction", messages: [{ role: "user", content: "x" }] },
      config,
      { name: "gpt-6.1-terra" },
    );
    expect(result.finishReason).toBe("length");
    expect(result.model).toBe("gpt-6.1-terra-2026-09-01");
    expect(result.usage).toMatchObject({
      promptTokens: 10,
      completionTokens: 16000,
      reasoningTokens: 12000,
    });
  });
});
