/**
 * LlamaExtract Agentic Plus generator (CC-1295): sends each benchmark PDF to
 * LlamaCloud Extract v2 on the `agentic_plus` tier and writes the answers as an
 * envelope folder for `--pipeline precomputed`.
 *
 *   npx tsx scripts/pdf-benchmark/generators/llamaextract.ts \
 *     --cases C-018 --runs 1 --out benchmarks/pdf/generated/llamaextract-<date>
 *
 * The API flow, version and cost are described in llamaextract-api.ts. The key
 * is LLAMA_CLOUD_API_KEY from app/.env; it is only put in request headers and
 * redacted from the saved raw answers.
 */
import { exitWith, runGenerator } from "./common";
import {
  LLAMA_MODE,
  LLAMA_MODEL,
  LLAMA_PIPELINE,
  llamaExtractAttempt,
} from "./llamaextract-api";

exitWith(
  runGenerator(
    {
      vendor: "llamacloud",
      pipeline: LLAMA_PIPELINE,
      mode: LLAMA_MODE,
      model: LLAMA_MODEL,
      keyName: "LLAMA_CLOUD_API_KEY",
      attempt: (ctx) => llamaExtractAttempt(ctx),
    },
    process.argv.slice(2),
  ),
);
