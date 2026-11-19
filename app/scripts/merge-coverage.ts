/**
 * Merges the coverage-final.json files of sharded Jest runs into one report and
 * applies jest.config.ts' global coverageThreshold, which the shards skip because
 * each sees only part of the suite.
 *
 * Writes jest.config.ts' coverageReporters to its coverageDirectory, as an
 * unsharded `jest` run would.
 *
 * Usage: npx tsx scripts/merge-coverage.ts <coverage-final.json>...
 */
import fs from "node:fs";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports, { type ReportType } from "istanbul-reports";
import jestConfig from "../jest.config";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error(
    "Usage: npx tsx scripts/merge-coverage.ts <coverage-final.json>...",
  );
  process.exit(2);
}

const coverageMap = libCoverage.createCoverageMap({});
for (const file of files) {
  coverageMap.merge(JSON.parse(fs.readFileSync(file, "utf8")));
}

const context = libReport.createContext({
  dir: jestConfig.coverageDirectory,
  coverageMap,
});
for (const reporter of jestConfig.coverageReporters ?? []) {
  reports.create(reporter as ReportType).execute(context);
}

// shortcut: only positive "global" percentages (what jest.config.ts uses); add negative-count and
// per-path thresholds here if the config starts using them.
// Merging converted reports can list a few more branches than one unsharded run (+0.4 pt measured).
const totals = coverageMap.getCoverageSummary().data;
const thresholds = jestConfig.coverageThreshold?.global ?? {};
let failed = false;
for (const [metric, minimum] of Object.entries(thresholds)) {
  const pct = totals[metric as keyof typeof totals].pct;
  if (minimum !== undefined && pct < minimum) {
    console.error(
      `Jest: "global" coverage threshold for ${metric} (${minimum}%) not met: ${pct}%`,
    );
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
