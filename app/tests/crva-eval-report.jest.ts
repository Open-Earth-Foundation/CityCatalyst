import { describe, expect, it, jest } from "@jest/globals";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  buildReport,
  summarize,
  type ReportRunStats,
} from "../scripts/crva-eval/report";
import {
  backupJudgeLog,
  checkGoldMatchesRun,
  judgeAdapterField,
  judgmentsFromLog,
  modelsFromLog,
  parseLog,
  recoverPartRanges,
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
    goldValue: "",
    goldEvidence: "",
    goldPages: [],
    isV0Field: true,
    trap: false,
    modelValue: "",
    modelEvidence: "",
    modelStatus: "FOUND",
    verdict: "Correct",
    notes: "",
    reason: "",
    uncertain: false,
    partialReason: null,
    cause: null,
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

describe("field aliases", () => {
  it("lists the aliases and labels the A2.4a row with its gold id", () => {
    const report = buildReport({
      city: "x",
      rows: [row({ fieldId: "A2.4", isV0Field: true, verdict: "Correct" })],
      gold,
      stats,
    });
    expect(report).toContain("Field aliases: A2.4a -> A2.4");
    expect(report).toMatch(/^\| A2\.4a \(gold A2\.4\) \| 1 \|/m);
  });

  it("does not count A2.4 gold rows among other fields", () => {
    const withA24: GoldWorkbook = {
      ...gold,
      rows: [...gold.rows, { ...gold.rows[0], fieldId: "A2.4" }],
    };
    const report = buildReport({ city: "x", rows: [], gold: withA24, stats });
    expect(report).toContain("## Other fields (34)");
  });

  it("the judge call receives the gold field id", async () => {
    const client = {
      getConfig: () => ({ models: { crva_extraction: { name: "j" } } }),
      complete: async () => ({
        content: JSON.stringify({
          judgments: [
            {
              valueIndex: 0,
              itemKey: "Puerto",
              verdict: "Correct",
              modelStatus: "FOUND",
              reason: "ok",
              uncertain: false,
              goldGap: false,
              misattributedTo: null,
            },
          ],
        }),
        finishReason: "stop",
      }),
    };
    const result = await judgeAdapterField({
      client: client as never,
      model: "j",
      adapterFieldId: "A2.4a",
      goldRows: [
        {
          rowNumber: 2,
          fieldId: "A2.4",
          itemKey: "Puerto",
          goldValue: "Port",
          pages: [10],
          evidence: "",
          status: "FOUND",
          notes: "",
          trapNote: false,
        },
      ],
      values: [
        {
          fieldId: "A2.4a",
          value: { name: "Puerto", description: "Port" },
          source: { file: "f", page: 10, quote: "El puerto" },
          origin: "ai_draft",
          confirmed: false,
        },
      ],
      figures: [],
    });
    expect((result.request as { fieldId: string }).fieldId).toBe("A2.4");
    expect(result.judgments[0].itemKey).toBe("Puerto");
  });
});

describe("traps per entry", () => {
  const trapGold: GoldWorkbook = {
    ...gold,
    rows: [
      {
        ...gold.rows[0],
        rowNumber: 50,
        notes: "TRAP: summary table",
        trapNote: true,
      },
    ],
    traps: [
      { pages: [40, 41], what: "Annex table", why: "Old year" },
      { pages: "all", what: "Footer", why: "Repeats" },
      { pages: [90], what: "Empty page", why: "Nothing" },
    ],
  };
  const rows = [
    row({ rowNumber: 33, goldPages: [40], verdict: "Correct" }),
    row({ rowNumber: 35, goldPages: [12, 41], verdict: "Omission" }),
    row({ rowNumber: 36, goldPages: [12], verdict: "Correct" }),
    row({
      rowNumber: 50,
      goldPages: [12],
      verdict: "Partial",
      trap: true,
    }),
    row({
      kind: "extra",
      rowNumber: null,
      modelValue: "v",
      modelEvidence: 'p. 41 — "q"',
      verdict: "Hallucination",
    }),
    row({ modelValue: "w", modelEvidence: 'p. 40 — "q"', rowNumber: 33 }),
  ];
  const traps = buildReport({ city: "x", rows, gold: trapGold, stats })
    .split("## Traps")[1]
    .split("\n## ")[0];

  it("lists gold rows on the entry's pages with verdicts and citing values", () => {
    expect(traps).toContain(
      "- p. 40, 41: Annex table (Old year): rows 33 Correct, 35 Omission; 2 model values cite these pages",
    );
    expect(traps).toContain(
      "- p. 90: Empty page (Nothing): no gold rows on these pages; 0 model values cite these pages",
    );
  });

  it("entries for all pages have no row list", () => {
    expect(traps).toContain(
      "- all pages: Footer (Repeats): applies to all pages",
    );
  });

  it("lists rows with a TRAP: note and says traps are keyed by page", () => {
    expect(traps).toContain("Rows with a TRAP: note: rows 50 Partial");
    expect(traps).toMatch(/keyed by page, not by item_key/);
    expect(traps).toMatch(/Rows on trap pages: 1/);
  });
});

describe("thresholds and measures", () => {
  const rows = [
    ...rowsOf("Correct", 8),
    ...rowsOf("Omission", 2),
    ...rowsOf("Omission", 10, { isV0Field: false }),
  ];
  const report = buildReport({ city: "x", rows, gold, stats });

  it("evaluates 80% correct on v0 and shows overall beside it", () => {
    const t = report.split("## Thresholds")[1].split("\n## ")[0];
    expect(t).toContain(
      "| At least 80% correct (v0 fields) | 80.0% v0; overall 40.0% | pass |",
    );
  });

  describe("coverage, precision and reason tables", () => {
    const extra = (o: Partial<ScoredRow>) =>
      row({ kind: "extra", rowNumber: null, goldStatus: null, ...o });
    const fixture = [
      row({ modelValue: "a", verdict: "Correct" }),
      row({
        goldStatus: "NOT_FOUND",
        modelStatus: "NOT_FOUND",
        verdict: "Correct (NOT_FOUND)",
      }),
      row({
        modelValue: "b",
        verdict: "Partial",
        partialReason: "less_detail",
        cause: null,
      }),
      row({
        modelValue: "c",
        verdict: "Partial",
        partialReason: "incomplete_list",
        cause: "prompt",
      }),
      row({ modelValue: "d", verdict: "Wrong content", cause: "chunking" }),
      row({ verdict: "Omission", cause: "ocr_text_extraction" }),
      row({ goldStatus: "N/A", modelValue: "e", verdict: "Correct" }),
      // Old judge log: the new fields are missing.
      row({
        modelValue: "k",
        verdict: "Partial",
        partialReason: undefined as never,
        cause: undefined as never,
      }),
      row({ isV0Field: false, modelValue: "f", verdict: "Normalisation" }),
      row({
        isV0Field: false,
        verdict: "Omission",
        cause: "field_outside_v0",
      }),
      extra({ modelValue: "g", verdict: "Hallucination", cause: "prompt" }),
      extra({ modelValue: "h", verdict: null, notes: "GOLD GAP" }),
      extra({ modelValue: "i", verdict: null, notes: "not judged" }),
      row({
        kind: "duplicate",
        rowNumber: null,
        modelValue: "j",
        verdict: null,
        notes: "duplicate of k",
      }),
    ];
    const r = buildReport({ city: "x", rows: fixture, gold, stats });
    const section = (name: string) =>
      r.split(`## ${name}`)[1].split("\n## ")[0];
    const overall = section("Overall");
    const v0 = section("v0 fields (12)");
    const T = "tolerant view, not the official rule (pending Magdalena)";

    it("explains the two measures in the header", () => {
      expect(r).toContain(
        "Coverage = gold rows found; precision = model values that are right.",
      );
    });

    it("coverage: gold rows with a gold status, N/A excluded", () => {
      expect(overall).toContain("Coverage, strict: 2 of 9 (22.2%)");
      expect(overall).toContain(`Coverage, tolerant (${T}): 3 of 9 (33.3%)`);
      expect(v0).toContain("Coverage, strict: 2 of 7 (28.6%)");
      expect(v0).toContain(`Coverage, tolerant (${T}): 3 of 7 (42.9%)`);
    });

    it("precision: every bundle value, including extras, duplicates and not judged", () => {
      expect(overall).toContain(
        "Precision, strict: 3 of 11 (27.3%) model values right (Correct or Normalisation); comparable to the Madrid hand review (71%)",
      );
      expect(overall).toContain(`Precision, tolerant (${T}): 4 of 11 (36.4%)`);
      expect(v0).toContain("Precision, strict: 2 of 10 (20.0%)");
      expect(v0).toContain(`Precision, tolerant (${T}): 3 of 10 (30.0%)`);
    });

    it("keeps the ticket formula as the DoD measure", () => {
      expect(overall).toContain(
        "Share correct (ticket formula, the DoD measure)",
      );
      expect(v0).toContain("Share correct (ticket formula, the DoD measure)");
    });

    it("partial reasons count Partial rows, with none and not recorded", () => {
      for (const block of [overall, v0]) {
        expect(block).toContain(
          [
            "| Partial reason | Rows |",
            "| --- | --- |",
            "| less_detail | 1 |",
            "| incomplete_list | 1 |",
            "| merged_items | 0 |",
            "| (none) | 0 |",
            "| (not recorded) | 1 |",
          ].join("\n"),
        );
      }
    });

    it("causes count error verdicts only", () => {
      const table = (prompt: number, fov: number) =>
        [
          "| Cause (error verdicts) | Rows |",
          "| --- | --- |",
          "| ocr_text_extraction | 1 |",
          "| chunking | 1 |",
          `| prompt | ${prompt} |`,
          "| figure_or_map | 0 |",
          `| field_outside_v0 | ${fov} |`,
          "| scope | 0 |",
          "| gold_issue | 0 |",
          "| (none) | 1 |",
          "| (not recorded) | 1 |",
        ].join("\n");
      expect(overall).toContain(table(2, 1));
      expect(v0).toContain(table(2, 0));
    });
  });

  it("counts not-judged rows by prefix, so aliased ones count too", () => {
    const r = buildReport({
      city: "x",
      rows: [
        row({
          kind: "extra",
          rowNumber: null,
          verdict: null,
          notes: "not judged; adapter field A2.4a",
        }),
        row({
          kind: "extra",
          rowNumber: null,
          verdict: null,
          notes: "GOLD GAP; adapter field A2.4a",
        }),
      ],
      gold,
      stats,
    });
    expect(r).toMatch(/Not judged rows: 1/);
    expect(r).toMatch(/GOLD GAP rows: 1/);
  });
});

describe("part pages in the Run section", () => {
  it("prints the part page ranges", () => {
    const r = buildReport({
      city: "x",
      rows: [],
      gold,
      stats: {
        ...stats,
        partRanges: [
          { startPage: 1, pageCount: 62, bytes: 1 },
          { startPage: 63, pageCount: 59, bytes: 1 },
          { startPage: 122, pageCount: 64, bytes: 1 },
        ],
      },
    });
    expect(r).toContain("- Part pages: 1–62, 63–121, 122–185");
  });

  it("says when an older run file has no part pages", () => {
    const r = buildReport({ city: "x", rows: [], gold, stats });
    expect(r).toContain("- Part pages: part pages not recorded");
  });

  it("labels part pages recomputed from the PDF", () => {
    const r = buildReport({
      city: "x",
      rows: [],
      gold,
      stats: {
        ...stats,
        partRanges: [{ startPage: 1, pageCount: 185, bytes: 1 }],
      },
      partRangesRecomputed: true,
    });
    expect(r).toContain("- Part pages: 1–185 (recomputed from the PDF)");
  });
});

describe("recoverPartRanges", () => {
  async function pdf(pages: number): Promise<Buffer> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
    return Buffer.from(await doc.save());
  }

  it("recomputes the ranges when the part count matches", async () => {
    const buffer = await pdf(6);
    const result = await recoverPartRanges({
      pdf: buffer,
      maxPartBytes: 15 * 1024 * 1024,
      parts: 1,
      pageCount: 6,
    });
    expect(result.warning).toBeUndefined();
    expect(result.ranges).toEqual([
      { startPage: 1, pageCount: 6, bytes: buffer.length },
    ]);
  });

  it("warns and records nothing when the part count differs", async () => {
    const result = await recoverPartRanges({
      pdf: await pdf(6),
      maxPartBytes: 15 * 1024 * 1024,
      parts: 3,
      pageCount: 6,
    });
    expect(result.ranges).toBeUndefined();
    expect(result.warning).toMatch(/1 part.*3/);
  });

  it("warns when the PDF page count differs from the run's", async () => {
    const result = await recoverPartRanges({
      pdf: await pdf(5),
      maxPartBytes: 15 * 1024 * 1024,
      parts: 1,
      pageCount: 6,
    });
    expect(result.ranges).toBeUndefined();
    expect(result.warning).toMatch(/5 pages.*6/);
  });
});

describe("score-run input checks", () => {
  const goldWb = { ...gold, pdfFileName: "Analisis_CABA_2020.pdf" };

  it("refuses a gold file with another page count", () => {
    expect(
      checkGoldMatchesRun(goldWb, { file: "x.pdf", pageCount: 137 }),
    ).toEqual({
      error: "gold has 185 pages, run has 137: wrong gold file?",
    });
  });

  it("ignores case and an _escaneado suffix in the PDF name", () => {
    expect(
      checkGoldMatchesRun(goldWb, {
        file: "analisis_caba_2020_ESCANEADO.pdf",
        pageCount: 185,
      }),
    ).toEqual({});
  });

  it("warns, without failing, when the PDF names differ", () => {
    expect(
      checkGoldMatchesRun(goldWb, { file: "seattle.pdf", pageCount: 185 }),
    ).toEqual({
      warning: 'gold is for "Analisis_CABA_2020.pdf", run is for "seattle.pdf"',
    });
  });
});

describe("--rejudge keeps the old judge log", () => {
  it("renames judge.jsonl to a timestamped backup", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "crva-judge-"));
    const log = path.join(dir, "judge.jsonl");
    writeFileSync(log, "old line");
    const backup = await backupJudgeLog(
      log,
      new Date("2026-11-17T10:20:30.400Z"),
    );
    expect(path.basename(backup!)).toBe("judge.2026-11-17T10-20-30-400Z.jsonl");
    expect(readdirSync(dir)).toEqual(["judge.2026-11-17T10-20-30-400Z.jsonl"]);
    expect(readFileSync(backup!, "utf8")).toBe("old line");
  });

  it("does nothing when there is no log yet", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "crva-judge-"));
    expect(await backupJudgeLog(path.join(dir, "judge.jsonl"))).toBeNull();
  });
});
