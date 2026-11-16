import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { createLLMClient } from "@/backend/llm/client";
import { resetLLMConfigCache } from "@/backend/llm/config";
import { LLMError, LLMErrorCode } from "@/backend/llm/types";
import type {
  ILLMAdapter,
  LLMConfig,
  LLMCompleteResult,
} from "@/backend/llm/types";

const config: LLMConfig = {
  provider: "openai",
  apiKey: "test",
  models: {
    pdf_extraction: { name: "model-pdf" },
    crva_extraction: { name: "model-crva" },
    file_interpretation: { name: "model-interpret", temperature: 0 },
  },
  timeoutMs: 1000,
  maxRetries: 0,
};

describe("createLLMClient", () => {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedPath = process.env.LLM_CONFIG_PATH;

  beforeEach(() => {
    resetLLMConfigCache();
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    if (savedPath === undefined) delete process.env.LLM_CONFIG_PATH;
    else process.env.LLM_CONFIG_PATH = savedPath;
    resetLLMConfigCache();
  });

  it("passes the role's model settings to the adapter", async () => {
    const complete = jest
      .fn<ILLMAdapter["complete"]>()
      .mockResolvedValue({ content: "{}" } as LLMCompleteResult);
    const client = createLLMClient({ config, adapter: { complete } });
    const options = {
      use: "file_interpretation" as const,
      messages: [{ role: "user" as const, content: "x" }],
    };
    await client.complete(options);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toBe(options);
    expect(complete.mock.calls[0][2]).toEqual(
      config.models.file_interpretation,
    );
  });

  it("loads llm_config.yaml when no config is given", () => {
    process.env.OPENAI_API_KEY = "test";
    delete process.env.LLM_CONFIG_PATH;
    const loaded = createLLMClient().getConfig();
    expect(loaded.models.pdf_extraction.name).toBe("gpt-5.6-luna");
    expect(loaded.timeoutMs).toBe(180000);
  });

  it("fails without an API key", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_CONFIG_PATH;
    let error: unknown;
    try {
      createLLMClient();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LLMError);
    expect((error as LLMError).code).toBe(LLMErrorCode.CONFIG);
  });
});
