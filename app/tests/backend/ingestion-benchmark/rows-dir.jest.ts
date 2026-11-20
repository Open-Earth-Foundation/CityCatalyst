import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readRowsDir,
  RowsDirError,
} from "@/backend/ingestion-benchmark/pipelines/rows-dir";

const row = (over: Record<string, unknown> = {}) => ({
  source_label: "Residential fuel",
  gpc_ref: "I.1.1",
  scope: 1,
  emissions_tco2e: 1000.5,
  notation_key: null,
  row_role: "emission",
  total_inclusion: "included",
  scope_basis: "explicit",
  ...over,
});

const envelope = (rows: unknown[] = [row(), row({ scope: null })]) => ({
  result: {
    data: {
      reporting_year: 2020,
      reported_total_tco2e: 5000,
      total_basis: "gross",
      total_kind: "gross",
      reported_gross_total_tco2e: 5000,
      reported_removals_tco2e: null,
      reported_net_total_tco2e: null,
      reconciliation_tolerance_tco2e: null,
      rows,
    },
  },
  usage: { input_tokens: 10, output_tokens: 5 },
  execution_status: "success",
  cost_usd: 0.25,
  benchmark: { checks: [{ value: 123456.7 }] },
  repair: { note: "secret-repair" },
});

let dir: string;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function writeFixture(
  env: unknown,
  opts: { entries?: Record<string, unknown>[]; skipFile?: boolean } = {},
) {
  const text = JSON.stringify(env);
  fs.mkdirSync(path.join(dir, "results"), { recursive: true });
  if (!opts.skipFile) fs.writeFileSync(path.join(dir, "results/a.json"), text);
  const entry = {
    case_id: "C-015",
    attempt: 1,
    file: "results/a.json",
    sha256: sha(text),
  };
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      study: "study-x",
      stage: "stage-y",
      entries: opts.entries ?? [entry],
    }),
  );
  return entry;
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RowsDirError);
    return (e as RowsDirError).code;
  }
  return undefined;
}

describe("readRowsDir", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rows-dir-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("reads a verified envelope", () => {
    writeFixture(envelope());
    const got = readRowsDir(dir).get("C-015", 1);
    expect(got.data.rows).toHaveLength(2);
    expect(got.executionStatus).toBe("success");
    expect(got.costUsd).toBe(0.25);
    expect(got.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    expect(got.info).toEqual({
      id: "precomputed",
      study: "study-x",
      stage: "stage-y",
      mode: null,
      version: null,
    });
  });

  it("exposes study and stage even when no envelope can be read", () => {
    writeFixture(envelope(), { skipFile: true });
    const rows = readRowsDir(dir);
    expect(rows.info).toEqual({ study: "study-x", stage: "stage-y" });
    expect(codeOf(() => rows.get("C-015", 1))).toBe("missing_file");
  });

  it("rejects a tampered file", () => {
    writeFixture(envelope());
    fs.appendFileSync(path.join(dir, "results/a.json"), " ");
    expect(codeOf(() => readRowsDir(dir).get("C-015", 1))).toBe(
      "hash_mismatch",
    );
  });

  it("rejects a missing entry", () => {
    writeFixture(envelope());
    expect(codeOf(() => readRowsDir(dir).get("C-099", 1))).toBe(
      "missing_entry",
    );
  });

  it("rejects a listed file that is absent", () => {
    writeFixture(envelope(), { skipFile: true });
    expect(codeOf(() => readRowsDir(dir).get("C-015", 1))).toBe("missing_file");
  });

  it("rejects duplicate entries", () => {
    const e = writeFixture(envelope());
    writeFixture(envelope(), { entries: [e, e] });
    expect(codeOf(() => readRowsDir(dir).get("C-015", 1))).toBe(
      "duplicate_entry",
    );
  });

  it("never exposes benchmark or repair content", () => {
    writeFixture(envelope());
    const json = JSON.stringify(readRowsDir(dir).get("C-015", 1));
    expect(json).not.toContain("benchmark");
    expect(json).not.toContain("repair");
    expect(json).not.toContain("123456.7");
  });

  it("rejects rows with a missing row_role or an invalid scope", () => {
    const { row_role: _omit, ...noRole } = row();
    writeFixture(envelope([noRole]));
    expect(codeOf(() => readRowsDir(dir).get("C-015", 1))).toBe(
      "invalid_envelope",
    );
    fs.rmSync(dir, { recursive: true, force: true });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rows-dir-"));
    writeFixture(envelope([row({ scope: 4 })]));
    expect(codeOf(() => readRowsDir(dir).get("C-015", 1))).toBe(
      "invalid_envelope",
    );
  });

  it("rejects an unknown gpc_ref and keeps error messages free of values", () => {
    writeFixture(envelope([row({ gpc_ref: "Z.9.9", source_label: "LEAKME" })]));
    try {
      readRowsDir(dir).get("C-015", 1);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as RowsDirError).code).toBe("invalid_envelope");
      expect((e as Error).message).not.toContain("LEAKME");
      expect((e as Error).message).not.toContain("Z.9.9");
    }
  });

  it("takes optional pipeline metadata from the envelope", () => {
    const env = { ...envelope(), mode: "fast", version: "v2" };
    writeFixture(env);
    const got = readRowsDir(dir).get("C-015", 1);
    expect(got.info.id).toBe("precomputed");
    expect(got.info.mode).toBe("fast");
    expect(got.info.version).toBe("v2");
  });

  it("rejects an invalid-JSON envelope", () => {
    writeFixture(envelope());
    const text = "{not json";
    fs.writeFileSync(path.join(dir, "results/a.json"), text);
    const m = JSON.parse(
      fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
    );
    m.entries[0].sha256 = sha(text);
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(m));
    expect(codeOf(() => readRowsDir(dir).get("C-015", 1))).toBe(
      "invalid_envelope",
    );
  });

  it("rejects missing result.data, bad execution_status, missing tolerance", () => {
    const cases: Record<string, unknown>[] = [];
    cases.push({ ...envelope(), result: {} });
    cases.push({ ...envelope(), execution_status: 3 });
    const noTol = envelope();
    delete (noTol.result.data as Record<string, unknown>)
      .reconciliation_tolerance_tco2e;
    cases.push(noTol);
    for (const env of cases) {
      fs.rmSync(dir, { recursive: true, force: true });
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "rows-dir-"));
      writeFixture(env);
      expect(codeOf(() => readRowsDir(dir).get("C-015", 1))).toBe(
        "invalid_envelope",
      );
    }
  });

  it("fails with a fixed message on a bad manifest", () => {
    const expected = `invalid manifest.json in ${dir}`;
    fs.writeFileSync(path.join(dir, "manifest.json"), "SECRETTEXT {");
    expect(() => readRowsDir(dir)).toThrow(expected);
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ entries: "SECRETTEXT" }),
    );
    try {
      readRowsDir(dir);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).toBe(expected);
    }
  });

  it("fails at open time when the schema is missing", () => {
    writeFixture(envelope());
    expect(() =>
      readRowsDir(dir, { schemaPath: path.join(dir, "nope.json") }),
    ).toThrow();
  });

  it("drops unknown keys from data and rows", () => {
    const env = envelope([row({ extra_row: "x" })]);
    (env.result.data as Record<string, unknown>).extra_data = "y";
    writeFixture(env);
    const got = readRowsDir(dir).get("C-015", 1);
    expect(JSON.stringify(got)).not.toContain("extra_");
    expect(got.data.rows[0].source_label).toBe("Residential fuel");
  });

  it("flattens nested numeric usage one level deep", () => {
    const env = {
      ...envelope(),
      usage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 4, label: "x", deep: { a: 1 } },
      },
    };
    writeFixture(env);
    expect(readRowsDir(dir).get("C-015", 1).usage).toEqual({
      input_tokens: 10,
      "input_tokens_details.cached_tokens": 4,
    });
  });

  it("treats an entry file outside the folder as missing_file", () => {
    const outside = path.join(os.tmpdir(), `outside-${process.pid}.json`);
    const text = JSON.stringify(envelope());
    fs.writeFileSync(outside, text);
    try {
      writeFixture(envelope(), {
        entries: [
          {
            case_id: "C-015",
            attempt: 1,
            file: path.relative(dir, outside),
            sha256: sha(text),
          },
        ],
      });
      expect(codeOf(() => readRowsDir(dir).get("C-015", 1))).toBe(
        "missing_file",
      );
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});
