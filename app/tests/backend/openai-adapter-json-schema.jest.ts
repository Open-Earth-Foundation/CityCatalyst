/** CC-1162: strict json_schema response format, which wins over jsonMode. */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const create = jest.fn<(body: Record<string, unknown>) => Promise<unknown>>();

jest.unstable_mockModule("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create } };
  },
}));

const { openaiComplete } = await import("@/backend/llm/openai-adapter");

const config = {
  apiKey: "test",
  model: "gpt-4o-mini",
  timeoutMs: 1000,
} as never;
const schema = { type: "object", properties: {} };

const call = async (extra: Record<string, unknown>) => {
  create.mockResolvedValue({
    choices: [{ message: { content: "{}" } }],
    usage: {},
  });
  await openaiComplete(
    { messages: [{ role: "user", content: "x" }], ...extra } as never,
    config,
  );
  return create.mock.calls[create.mock.calls.length - 1][0];
};

beforeEach(() => create.mockReset());

describe("openaiComplete response_format", () => {
  it("sends a strict json_schema", async () => {
    const body = await call({ jsonSchema: { name: "rows", schema } });
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "rows", schema, strict: true },
    });
  });

  it("prefers jsonSchema over jsonMode", async () => {
    const body = await call({
      jsonSchema: { name: "rows", schema },
      jsonMode: true,
    });
    expect((body.response_format as { type: string }).type).toBe("json_schema");
  });

  it("sends json_object for jsonMode only", async () => {
    const body = await call({ jsonMode: true });
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});
