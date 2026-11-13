/**
 * Removes answer-key content from run files written before the benchmark
 * redacted its output, in place. No database, LLM or OCR call.
 *
 *   npx tsx scripts/pdf-benchmark/redact-results.ts <run>/results.json [<run>/report.md ...]
 *
 * results.json goes through the same sanitizer as a new run (redact.ts).
 * report.md (format of the earlier harness, PR #3317) loses the diffs against
 * the expected total and the list of missing key rows.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { publishableSummary } from "@/backend/ingestion-benchmark/redact";

export function redactResultsText(text: string): string {
  const out = JSON.stringify(publishableSummary(JSON.parse(text)), null, 2);
  return text.endsWith("\n") ? `${out}\n` : out;
}

/** Key rows not found (text and value) and stored values that match no key row. */
const MISSING_ROWS_SECTION =
  /^## Lowest recall: what is missing\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m;
const TOTAL_DIFF = /[+-]?\d+(?:\.\d+)?% \((within|outside) tolerance\)/g;

export function redactReportText(text: string): string {
  return text
    .replace(MISSING_ROWS_SECTION, "")
    .replace(TOTAL_DIFF, "$1 tolerance");
}

if (process.argv[1] && process.argv[1].includes("redact-results")) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error(
      "Usage: npx tsx scripts/pdf-benchmark/redact-results.ts <results.json|report.md>...",
    );
    process.exit(2);
  }
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const out =
      basename(file) === "report.md"
        ? redactReportText(text)
        : redactResultsText(text);
    writeFileSync(file, out);
    console.log(`${out === text ? "unchanged" : "redacted"}: ${file}`);
  }
}
