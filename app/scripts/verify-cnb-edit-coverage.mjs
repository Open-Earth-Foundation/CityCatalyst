/**
 * Verify complete-file CC-732 web coverage, including unexecuted manifest files.
 * Inputs: --manifest JSON (default tests/cnb-edit-coverage-files.json), --report
 * Istanbul JSON (default coverage/cnb-edits/coverage-final.json). No credentials.
 * Output: exact covered/total executable lines and percentage on stdout; nonzero
 * exit for missing files, a missing coverage entry, or less than 80 percent.
 * Usage from app/: node scripts/verify-cnb-edit-coverage.mjs
 * Run only after the scoped Jest command succeeds; it never edits source files.
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCoverageMap } = require("istanbul-lib-coverage");

export function verifyCoverage(manifest, report, root) {
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("The source manifest must contain files");
  }
  const coverage = createCoverageMap(report);
  const canonical = (name) => {
    const absolute = path.resolve(name).replaceAll("\\", "/");
    return process.platform === "win32" ? absolute.toLowerCase() : absolute;
  };
  const sourceRoot = realpathSync(root);
  const isWithinRoot = (name) => {
    const relative = path.relative(sourceRoot, name);
    return (
      relative !== "" &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep) &&
      !path.isAbsolute(relative)
    );
  };
  const measured = new Map(
    coverage.files().map((name) => [canonical(name), name]),
  );
  const seen = new Set();
  let covered = 0;
  let total = 0;
  for (const name of manifest.files) {
    if (typeof name !== "string" || name.length === 0)
      throw new Error("Source paths must be nonempty strings");
    const expected = path.resolve(sourceRoot, name);
    if (!isWithinRoot(expected))
      throw new Error(`Source path is outside app: ${name}`);
    if (!statSync(expected, { throwIfNoEntry: false })?.isFile())
      throw new Error(`Source file is missing: ${name}`);
    const realSource = realpathSync(expected);
    if (!isWithinRoot(realSource))
      throw new Error(`Source path is outside app: ${name}`);
    const identity = canonical(realSource);
    if (seen.has(identity)) throw new Error(`Duplicate source file: ${name}`);
    seen.add(identity);
    const actual = measured.get(canonical(expected));
    if (!actual) throw new Error(`Full-file coverage is missing: ${name}`);
    const lines = Object.values(
      coverage.fileCoverageFor(actual).getLineCoverage(),
    );
    total += lines.length;
    covered += lines.filter((hits) => hits > 0).length;
  }
  if (total === 0 || covered / total < 0.8)
    throw new Error(`Web full-file coverage is below 80%: ${covered}/${total}`);
  return {
    files: manifest.files.length,
    covered_lines: covered,
    executable_lines: total,
    percentage: (100 * covered) / total,
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      manifest: {
        type: "string",
        default: "tests/cnb-edit-coverage-files.json",
      },
      report: {
        type: "string",
        default: "coverage/cnb-edits/coverage-final.json",
      },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(
      "Usage: node scripts/verify-cnb-edit-coverage.mjs [--manifest file] [--report file]\n",
    );
    return;
  }
  const manifest = JSON.parse(readFileSync(values.manifest, "utf8"));
  const report = JSON.parse(readFileSync(values.report, "utf8"));
  process.stdout.write(
    JSON.stringify(verifyCoverage(manifest, report, process.cwd())) + "\n",
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
