/**
 * CC-1008: the OpenAI API answers 400 to temperature 0 for gpt-5 and o-series models.
 * OpenRouter drops the parameter, so only a direct OpenAI call (Dev) shows the error.
 * CC-1191: the same holds for gpt-6; reasoning_effort goes to reasoning models only,
 * and the finish reason and reasoning tokens come back to the caller. An unknown
 * reasoning effort is dropped with a warning instead of a 400 on every call.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const create = jest.fn<(body: Record<string, unknown>) => Promise<unknown>>();

jest.unstable_mockModule("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create } };
  },
}));

const { isReasoningModel, openaiComplete, supportsCustomTemperature } =
  await import("@/backend/llm/openai-adapter");
const { logger } = await import("@/services/logger");

const config = {
  apiKey: "test",
  model: "gpt-4o-mini",
  timeoutMs: 1000,
} as never;

const call = async (
  model: string,
  temperature?: number,
  reasoningEffort?: string,
) => {
  create.mockResolvedValue({
    choices: [{ message: { content: "{}" } }],
    usage: {},
    model,
  });
  await openaiComplete(
    {
      model,
      temperature,
      reasoningEffort,
      messages: [{ role: "user", content: "x" }],
    } as never,
    config,
  );
  return create.mock.calls[create.mock.calls.length - 1][0];
};

beforeEach(() => create.mockReset());
afterEach(() => jest.restoreAllMocks());

describe("supportsCustomTemperature", () => {
  it.each([
    ["gpt-5.6-luna", false],
    ["openai/gpt-5.6-luna", false],
    ["gpt-5.4-mini", false],
    ["o3", false],
    ["o4-mini", false],
    ["gpt-6-luna", false],
    ["gpt-6.1-terra", false],
    ["openai/gpt-6.1-terra", false],
    ["gpt-10", false],
    ["openai/gpt-12.1-mini", false],
    ["gpt-4o", true],
    ["gpt-4o-mini", true],
    ["openai/gpt-4o", true],
    ["gpt-4.1", true],
  ])("%s", (model, expected) => {
    expect(supportsCustomTemperature(model)).toBe(expected);
    expect(isReasoningModel(model)).toBe(!expected);
  });
});

describe("temperature in the request body", () => {
  it("is left out for gpt-5.6-luna, as the OpenAI API rejects 0", async () => {
    const body = await call("gpt-5.6-luna", 0);
    expect(body).not.toHaveProperty("temperature");
  });

  it("is left out for a provider-prefixed gpt-5 model", async () => {
    const body = await call("openai/gpt-5.6-luna", 0);
    expect(body).not.toHaveProperty("temperature");
  });

  it("is left out for gpt-6 models", async () => {
    expect(await call("gpt-6.1-terra", 0)).not.toHaveProperty("temperature");
    expect(await call("openai/gpt-6-luna", 0)).not.toHaveProperty(
      "temperature",
    );
  });

  it("is left out for gpt-10", async () => {
    expect(await call("gpt-10", 0)).not.toHaveProperty("temperature");
  });

  it("is still sent as 0 to models that accept it", async () => {
    const body = await call("gpt-4o", 0);
    expect(body).toHaveProperty("temperature", 0);
    expect(await call("gpt-4o-mini", 0)).toHaveProperty("temperature", 0);
  });
});

describe("reasoning_effort in the request body", () => {
  it("is sent to gpt-6 models", async () => {
    const body = await call("gpt-6.1-terra", 0, "low");
    expect(body).toHaveProperty("reasoning_effort", "low");
  });

  it("is not sent to models without reasoning", async () => {
    const body = await call("gpt-4o", 0, "low");
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("is not sent when not set", async () => {
    const body = await call("gpt-6.1-terra", 0);
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it.each(["low", "medium", "high"])(
    "sends the valid value %s without a warning",
    async (effort) => {
      const warn = jest.spyOn(logger, "warn");
      const body = await call("gpt-5.6-luna", 0, effort);
      expect(body).toHaveProperty("reasoning_effort", effort);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it("drops an unknown value with one warning instead of a 400", async () => {
    const warn = jest.spyOn(logger, "warn");
    const first = await call("gpt-6.1-terra", 0, "med");
    const second = await call("gpt-6.1-terra", 0, "med");
    expect(first).not.toHaveProperty("reasoning_effort");
    expect(second).not.toHaveProperty("reasoning_effort");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({ reasoningEffort: "med" });
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
      {
        model: "gpt-6.1-terra",
        messages: [{ role: "user", content: "x" }],
      } as never,
      config,
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
