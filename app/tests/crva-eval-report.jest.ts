import { describe, expect, it, jest } from "@jest/globals";
import {
  buildReport,
  summarize,
  type ReportRunStats,
} from "../scripts/crva-eval/report";
import {
  judgmentsFromLog,
  modelsFromLog,
  parseLog,
} from "../scripts/crva-eval/score-run";
import type {
  GoldWorkbook,
  ModelStatus,
  ScoredRow,
  Verdict,
} from "../scripts/crva-eval/types";

function row(overrides: Partial<ScoredRow>): ScoredRow {
  return {
    kind: "gold",
    rowNumber: 2,
    fieldId: "A1.2a",
    itemKey: "k",
    goldStatus: "FOUND",
    isV0Field: true,
    trap: false,
    modelValue: "",
    modelEvidence: "",
    modelStatus: "FOUND",
    verdict: "Correct",
    notes: "",
    reason: "",
    uncertain: false,
    ...overrides,
  };
}

function rowsOf(
  verdict: Verdict | null,
  n: number,
  extra: Partial<ScoredRow> = {},
) {
  return Array.from({ length: n }, () => row({ verdict, ...extra }));
}

const stats: ReportRunStats = {
  run: 1,
  status: "ok",
  minutes: 12.5,
  parts: 3,
  retries: 0,
  ocrPages: 185,
  promptTokens: 1000,
  completionTokens: 500,
  llmCalls: 40,
  nonStopFinishes: 0,
  valuesKept: 96,
  valuesDropped: 4,
  droppedByReason: { bad_page: 4 },
  fieldsWithValue: 11,
  figures: 5,
  warnings: 2,
};

const gold: GoldWorkbook = {
  pdfFileName: "ba.pdf",
  pageCount: 185,
  rows: Array.from({ length: 34 }, (_, i) => ({
    rowNumber: i + 2,
    fieldId: `Z${i}`,
    itemKey: "k",
    goldValue: "",
    pages: [],
    evidence: "",
    status: "FOUND" as const,
    notes: "",
    trapNote: false,
  })),
  traps: [
    { pages: [18], what: "Look-alike table", why: "Different year" },
    { pages: "all", what: "Scanned PDF", why: "OCR noise" },
  ],
};

describe("summarize", () => {
  it("share correct matches the Summary formula", () => {
    const rows = [
      ...rowsOf("Correct", 3),
      ...rowsOf("Correct (NOT_FOUND)", 1, { goldStatus: "NOT_FOUND" }),
      ...rowsOf("Omission", 4),
    ];
    const s = summarize(rows);
    expect(s.scored).toBe(8);
    expect(s.shareCorrect).toBe(0.5);
    expect(s.verdictCounts.Omission).toBe(4);
  });

  it("rows without a verdict are not scored", () => {
    const s = summarize([...rowsOf("Correct", 1), ...rowsOf(null, 3)]);
    expect(s.scored).toBe(1);
    expect(s.shareCorrect).toBe(1);
  });

  it("status matrix counts only gold rows with gold status FOUND/PARTIAL/NOT_FOUND", () => {
    const m = (
      gold: ScoredRow["goldStatus"],
      model: ModelStatus,
      kind: ScoredRow["kind"] = "gold",
    ) => row({ goldStatus: gold, modelStatus: model, kind });
    const s = summarize([
      m("FOUND", "FOUND"),
      m("FOUND", "FOUND"),
      m("FOUND", "NOT_FOUND"),
      m("NOT_FOUND", "NOT_FOUND"),
      m("N/A", "NOT_FOUND"),
      m(null, "FOUND", "extra"),
    ]);
    expect(s.statusMatrix.FOUND.FOUND).toBe(2);
    expect(s.statusMatrix.FOUND.NOT_FOUND).toBe(1);
    expect(s.statusMatrix.NOT_FOUND.NOT_FOUND).toBe(1);
    expect(s.statusMatchRate).toBe(3 / 4);
  });

  it("applies the filter", () => {
    const s = summarize(
      [
        row({ isV0Field: true }),
        row({ isV0Field: false, verdict: "Omission" }),
      ],
      (r) => !r.isV0Field,
    );
    expect(s.scored).toBe(1);
    expect(s.shareCorrect).toBe(0);
  });
});

describe("buildReport", () => {
  const rows = [
    ...rowsOf("Correct", 9),
    ...rowsOf("Omission", 1),
    row({ isV0Field: false, verdict: "Correct" }),
    row({
      kind: "duplicate",
      rowNumber: null,
      verdict: null,
      notes: "duplicate of k",
    }),
    row({
      kind: "extra",
      rowNumber: null,
      verdict: null,
      notes: "GOLD GAP",
      uncertain: true,
    }),
    row({
      kind: "extra",
      rowNumber: null,
      verdict: null,
      notes: "not judged",
      uncertain: true,
    }),
  ];
  const report = buildReport({
    city: "buenos-aires",
    rows,
    gold,
    stats,
    judgeModel: "judge-x",
    extractionModel: "ext-y",
    failedFields: ["A1.2a"],
  });

  it("has the required sections", () => {
    for (const h of [
      "Overall",
      "v0 fields (12)",
      "Other fields (34)",
      "Traps",
      "Thresholds",
      "Run",
    ]) {
      expect(report).toContain(`
## ${h}
`);
    }
    const thresholds = report.split("## Thresholds")[1].split("\n## ")[0];
    expect(thresholds).toMatch(/Dropped values under 5%.*pass/);
    expect(thresholds).toMatch(/At least 10 of 12.*(pass|fail)/);
    expect(thresholds).toMatch(/At least 80% correct.*pass/);
    // 11 fields with a value is at least 10
    expect(thresholds).toMatch(/At least 10 of 12.*pass/);
    const traps = report.split("## Traps")[1].split("\n## ")[0];
    expect(traps).toContain("Look-alike table");
    expect(traps).toContain("Scanned PDF");
  });

  it("shows fail when a threshold is missed", () => {
    const bad = buildReport({
      city: "x",
      rows: rowsOf("Omission", 4),
      gold,
      stats: { ...stats, valuesDropped: 50, fieldsWithValue: 3 },
    });
    const t = bad.split("## Thresholds")[1].split("\n## ")[0];
    expect(t.match(/fail/g)).toHaveLength(3);
  });

  it("lists uncertain and duplicate counts and says definitions are provisional", () => {
    expect(report).toMatch(/Uncertain rows: 2/);
    expect(report).toMatch(/Duplicates: 1/);
    expect(report).toMatch(/GOLD GAP rows: 1/);
    expect(report).toMatch(/Not judged rows: 1/);
    expect(report).toMatch(/provisional/i);
    expect(report).toContain("judge-x");
    expect(report).toContain("ext-y");
    expect(report).toMatch(/Fields not judged.*A1\.2a/);
  });
});

describe("judgmentsFromLog", () => {
  it("keeps the last ok line per field and skips failures", () => {
    const j = (reason: string) => [{ valueIndex: 0, reason }] as never;
    const base = { request: null, response: null };
    const out = judgmentsFromLog([
      { fieldId: "A", attempt: 1, ok: true, judgments: j("old"), ...base },
      { fieldId: "A", attempt: 1, ok: true, judgments: j("new"), ...base },
      { fieldId: "B", attempt: 1, ok: false, error: "x", ...base },
    ]);
    expect(Object.keys(out)).toEqual(["A"]);
    expect(out.A[0].reason).toBe("new");
  });
});

describe("report hardening", () => {
  const base = { city: "x", rows: rowsOf("Correct", 2), gold, stats };

  it("names the models from the log and warns when JUDGE_MODEL differs", () => {
    const r = buildReport({ ...base, judgeModel: "now", judgeModels: ["old"] });
    expect(r).toContain("Judge model: old");
    expect(r).toMatch(/Warning:.*old.*JUDGE_MODEL is now now/);
    const same = buildReport({ ...base, judgeModel: "a", judgeModels: ["a"] });
    expect(same).not.toContain("Warning:");
  });

  it("warns under Overall when fields were not judged", () => {
    const r = buildReport({ ...base, failedFields: ["A1.2a", "B1"] });
    const overall = r.split("## Overall")[1].split("\n## ")[0];
    expect(overall).toContain(
      "Fields not judged: A1.2a, B1; their gold rows count as Omission / Correct (NOT_FOUND) and are marked uncertain.",
    );
    expect(
      buildReport(base).split("## Overall")[1].split("\n## ")[0],
    ).not.toContain("Fields not judged");
  });

  it("computes the other fields count and has the matrix header", () => {
    const r = buildReport(base);
    expect(r).toContain("## Other fields (34)");
    expect(r).toContain("Gold status (rows) / model status (columns)");
  });

  it("modelsFromLog reports the models of the used lines", () => {
    const b = { request: null, response: null, attempt: 1 };
    const j = [{}] as never;
    expect(
      modelsFromLog([
        { fieldId: "A", model: "m1", ok: true, judgments: j, ...b },
        { fieldId: "A", model: "m2", ok: true, judgments: j, ...b },
        { fieldId: "B", model: "m3", ok: false, ...b },
      ]),
    ).toEqual(["m2"]);
  });

  it("parseLog skips an unparsable last line but not an earlier one", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const ok = JSON.stringify({ fieldId: "A", ok: true });
    expect(
      parseLog(`${ok}
{"fieldId":`),
    ).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    expect(() =>
      parseLog(`{bad
${ok}
`),
    ).toThrow();
    warn.mockRestore();
  });
});

describe("score-run CLI seed", () => {
  it("exits with an error for a non-integer --seed", async () => {
    const { execFileSync } = await import("node:child_process");
    let stderr = "";
    try {
      execFileSync(
        "npx",
        [
          "tsx",
          "scripts/crva-eval/score-run.ts",
          "--gold",
          "a",
          "--run",
          "b",
          "--city",
          "c",
          "--seed",
          "abc",
        ],
        {
          env: { ...process.env, JUDGE_MODEL: "m" },
          shell: true,
          stdio: "pipe",
        },
      );
    } catch (err) {
      stderr = String((err as { stderr?: Buffer }).stderr);
    }
    expect(stderr).toContain("--seed must be an integer");
  }, 60000);
});
