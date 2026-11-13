import { describe, expect, it } from "@jest/globals";
import { pdfExtractionModel } from "@/backend/ingestion-benchmark/model-config";
import type { LLMFileConfig } from "@/backend/llm/types";

const file = (
  pdf: LLMFileConfig["models"]["pdf_extraction"],
): LLMFileConfig => ({
  models: {
    pdf_extraction: pdf,
    crva_extraction: { name: "other" },
    file_interpretation: { name: "gpt-4o-mini" },
  },
  timeoutMs: 1000,
  maxRetries: 0,
});

describe("pdfExtractionModel", () => {
  it("names the pdf_extraction model with its provider, as prices.json does", () => {
    expect(
      pdfExtractionModel(file({ name: "gpt-5.6-luna" }), "openai"),
    ).toEqual({ model: "openai/gpt-5.6-luna", reasoningEffort: null });
  });

  it("keeps a provider prefix and reads the reasoning effort", () => {
    expect(
      pdfExtractionModel(
        file({ name: "openai/gpt-5.6-luna", reasoningEffort: "high" }),
        "openai",
      ),
    ).toEqual({ model: "openai/gpt-5.6-luna", reasoningEffort: "high" });
  });

  it("ignores the old environment variables", () => {
    process.env.LLM_EXTRACTION_MODEL = "openai/gpt-4o-mini";
    try {
      expect(
        pdfExtractionModel(file({ name: "gpt-5.6-luna" }), "openai").model,
      ).toBe("openai/gpt-5.6-luna");
    } finally {
      delete process.env.LLM_EXTRACTION_MODEL;
    }
  });
});
