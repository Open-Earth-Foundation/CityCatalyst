/**
 * The PDF extraction model and reasoning effort the application uses, read from
 * the same resolved configuration (llm_config.yaml, role `pdf_extraction`), so
 * reports, baseline entries, MLflow and price selection name the model that ran.
 */
import type { LLMFileConfig } from "@/backend/llm/types";

export type ExtractionModel = { model: string; reasoningEffort: string | null };

/**
 * `provider/name`, the form `prices.json` and earlier runs use; a name that
 * already carries a provider prefix is kept as it is.
 */
export function pdfExtractionModel(
  file: LLMFileConfig,
  provider: string,
): ExtractionModel {
  const { name, reasoningEffort } = file.models.pdf_extraction;
  return {
    model: name.includes("/") ? name : `${provider}/${name}`,
    reasoningEffort: reasoningEffort ?? null,
  };
}
