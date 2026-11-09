import { describe, expect, it } from "@jest/globals";
import { parseArgs } from "../../../scripts/pdf-benchmark/args";

describe("parseArgs", () => {
  it("uses 3 runs and the default config path", () => {
    const options = parseArgs(["--cases", "C-004"]);
    expect(options.runs).toBe(3);
    expect(options.configPath).toBe("benchmarks/pdf/config.local.json");
    expect(options).toMatchObject({
      cases: "C-004",
      eligible: false,
      list: false,
      dryRun: false,
      updateBaseline: false,
      noMlflow: false,
    });
  });

  it("parses --runs", () => {
    expect(parseArgs(["--cases", "C-004", "--runs", "2"]).runs).toBe(2);
  });

  it("parses --set and the boolean flags", () => {
    const options = parseArgs([
      "--set",
      "held-out",
      "--eligible",
      "--dry-run",
      "--no-mlflow",
      "--config",
      "x.json",
    ]);
    expect(options).toMatchObject({
      set: "held-out",
      eligible: true,
      dryRun: true,
      noMlflow: true,
      configPath: "x.json",
    });
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown flag: --bogus/);
  });

  it("rejects an unknown block and a bad run count", () => {
    expect(() => parseArgs(["--set", "nope"])).toThrow(/--set/);
    expect(() => parseArgs(["--cases", "C-004", "--runs", "0"])).toThrow(
      /--runs/,
    );
  });

  it("rejects a flag without its value", () => {
    expect(() => parseArgs(["--cases"])).toThrow(/needs a value/);
  });

  it("refuses to update the baseline from exploratory runs", () => {
    expect(() =>
      parseArgs(["--cases", "C-004", "--runs", "2", "--update-baseline"]),
    ).toThrow("exploratory runs cannot update the baseline");
    expect(
      parseArgs(["--cases", "C-004", "--update-baseline"]).updateBaseline,
    ).toBe(true);
  });
});

describe("parseArgs --rescore", () => {
  it("takes the results file and needs no selection", () => {
    const options = parseArgs(["--rescore", "runs/x/results.json"]);
    expect(options.rescore).toBe("runs/x/results.json");
    expect(parseArgs(["--cases", "C-004"]).rescore).toBeUndefined();
  });

  it("needs a value and never updates the baseline", () => {
    expect(() => parseArgs(["--rescore"])).toThrow(/needs a value/);
    expect(() =>
      parseArgs(["--rescore", "results.json", "--update-baseline"]),
    ).toThrow("a rescore cannot update the baseline");
  });
});
