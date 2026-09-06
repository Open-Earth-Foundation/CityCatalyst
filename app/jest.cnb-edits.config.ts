import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import preset from "ts-jest/presets/index.js";

const manifest = JSON.parse(
  readFileSync("tests/cnb-edit-coverage-files.json", "utf8"),
) as {
  files: string[];
  non_executable: Record<string, string>;
  test_files: string[];
};
const changed = [
  ...execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      process.env.CNB_EDIT_COVERAGE_BASE ?? "HEAD",
      "--",
      "src",
    ],
    { encoding: "utf8" },
  ).split(/\r?\n/),
  ...execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "src"],
    { encoding: "utf8" },
  ).split(/\r?\n/),
].map((path) => path.replace(/^app\//, ""));
const missing = changed.filter(
  (path) =>
    /^src\/.*\.(ts|tsx)$/.test(path) &&
    !manifest.files.includes(path) &&
    !manifest.non_executable[path],
);
if (missing.length) {
  throw new Error(
    `CC-732 coverage manifest omits production files: ${missing.join(", ")}`,
  );
}

const config = {
  ...preset.defaultsESM,
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: "tests/tsconfig.json", useESM: true },
    ],
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  clearMocks: true,
  coverageProvider: "v8",
  testMatch: manifest.test_files.map((path) => `<rootDir>/${path}`),
  collectCoverageFrom: manifest.files.map((path) =>
    path.replace(/[\[\]]/g, (bracket) => (bracket === "[" ? "[[]" : "[]]")),
  ),
  coveragePathIgnorePatterns: ["/node_modules/"],
  coverageDirectory: "coverage/cnb-edits",
  coverageReporters: ["text", "json", "json-summary", "lcov"],
  coverageThreshold: { global: { lines: 80 } },
};

export default config;
