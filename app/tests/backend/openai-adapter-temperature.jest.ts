/**
 * CC-1008: the OpenAI API answers 400 to temperature 0 for gpt-5 and o-series models.
 * OpenRouter drops the parameter, so only a direct OpenAI call (Dev) shows the error.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const create = jest.fn<(body: Record<string, unknown>) => Promise<unknown>>();

jest.unstable_mockModule("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create } };
  },
}));

const { openaiComplete, supportsCustomTemperature } =
  await import("@/backend/llm/openai-adapter");

const config = {
  apiKey: "test",
  model: "gpt-4o-mini",
  timeoutMs: 1000,
} as never;

const call = async (model: string, temperature?: number) => {
  create.mockResolvedValue({
    choices: [{ message: { content: "{}" } }],
    usage: {},
    model,
  });
  await openaiComplete(
    { model, temperature, messages: [{ role: "user", content: "x" }] } as never,
    config,
  );
  return create.mock.calls[create.mock.calls.length - 1][0];
};

beforeEach(() => create.mockReset());

describe("supportsCustomTemperature", () => {
  it.each([
    ["gpt-5.6-luna", false],
    ["openai/gpt-5.6-luna", false],
    ["gpt-5.4-mini", false],
    ["o3", false],
    ["o4-mini", false],
    ["gpt-4o", true],
    ["gpt-4o-mini", true],
    ["openai/gpt-4o", true],
  ])("%s", (model, expected) => {
    expect(supportsCustomTemperature(model)).toBe(expected);
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

  it("is still sent as 0 to models that accept it", async () => {
    const body = await call("gpt-4o", 0);
    expect(body).toHaveProperty("temperature", 0);
  });
});
