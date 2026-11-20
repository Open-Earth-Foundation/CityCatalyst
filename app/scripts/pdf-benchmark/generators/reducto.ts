/**
 * Reducto Deep Extract generator, citations on (CC-1295): sends each benchmark
 * PDF to Reducto Extract with Deep Extract and writes the answers as an
 * envelope folder for `--pipeline precomputed`.
 *
 *   npx tsx scripts/pdf-benchmark/generators/reducto.ts \
 *     --cases C-018 --runs 1 --out benchmarks/pdf/generated/reducto-<date>
 *
 * The API flow, pinned model, citations and cost are described in
 * reducto-api.ts. The key is REDUCTO_API_KEY from app/.env; it is only put in
 * request headers and redacted from the saved raw answers.
 */
import { exitWith, runGenerator } from "./common";
import {
  REDUCTO_MODE,
  REDUCTO_MODEL,
  REDUCTO_PIPELINE,
  reductoAttempt,
} from "./reducto-api";

exitWith(
  runGenerator(
    {
      vendor: "reducto",
      pipeline: REDUCTO_PIPELINE,
      mode: REDUCTO_MODE,
      model: REDUCTO_MODEL,
      keyName: "REDUCTO_API_KEY",
      attempt: (ctx) => reductoAttempt(ctx),
    },
    process.argv.slice(2),
  ),
);
