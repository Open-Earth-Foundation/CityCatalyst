// Usage: npx tsx scripts/crva-eval/ocr-pdf.ts --pdf <path> --city <slug> [--max-part-mib 15] [--out <dir>]
// Paid: calls Mistral OCR once per PDF part. Writes reports/crva-eval/<city>/ocr/, or --out.
import { readFile } from "node:fs/promises";
import path from "node:path";
import env from "@next/env";
import { ocrPdf, writeOcrCache } from "./ocr-cache";
import { APP_DIR } from "./run-adapter";

function argValue(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

async function main() {
  env.loadEnvConfig(process.cwd());
  const pdfPath = argValue("--pdf");
  const city = argValue("--city");
  const maxPartBytes = Number(argValue("--max-part-mib", "15")) * 1024 * 1024;

  const cache = await ocrPdf(await readFile(pdfPath), path.basename(pdfPath), {
    maxPartBytes,
  });
  const dir = argValue(
    "--out",
    path.join(APP_DIR, "reports", "crva-eval", city, "ocr"),
  );
  await writeOcrCache(dir, cache);
  console.log(
    `OCR cache: ${cache.pages.size} pages, ${cache.figures.length} figures, model ${cache.ocrModel} -> ${dir}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
