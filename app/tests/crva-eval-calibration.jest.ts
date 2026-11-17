import { describe, expect, it } from "@jest/globals";
import { parse } from "csv-parse/sync";
import {
  agreement,
  calibrationMarkdown,
  calibrationSample,
  joinReviewer,
  reviewerCsv,
  rowIds,
  sampleCsv,
} from "../scripts/crva-eval/calibration";
import type { ScoredRow, Verdict } from "../scripts/crva-eval/types";

function row(partial: Partial<ScoredRow>): ScoredRow {
  return {
    kind: "gold",
    rowNumber: 2,
    fieldId: "A1.2a",
    itemKey: "k",
    goldStatus: "FOUND",
    goldValue: 'gold, "quoted"\nline',
    goldEvidence: "ev",
    goldPages: [1, 2],
    isV0Field: true,
    trap: false,
    modelValue: "m",
    modelEvidence: "me",
    modelStatus: "FOUND",
    verdict: "Correct",
    notes: "",
    reason: "r",
    uncertain: false,
    partialReason: null,
    cause: null,
    judgeVerdict: null,
    ...partial,
  };
}

function dataset(): ScoredRow[] {
  const rows: ScoredRow[] = [];
  const verdicts: Verdict[] = [
    "Correct",
    "Partial",
    "Omission",
    "Hallucination",
  ];
  let n = 2;
  for (const v of verdicts)
    for (let i = 0; i < 12; i++)
      rows.push(row({ rowNumber: n++, verdict: v, uncertain: i < 4 }));
  for (let i = 0; i < 5; i++)
    rows.push(
      row({
        kind: "extra",
        rowNumber: null,
        goldStatus: null,
        verdict: null,
        notes: "GOLD GAP: in the PDF",
      }),
    );
  for (let i = 0; i < 4; i++)
    rows.push(row({ kind: "duplicate", rowNumber: null, verdict: null }));
  rows.push(row({ rowNumber: 900, goldStatus: "N/A", verdict: "Correct" }));
  rows.push(row({ rowNumber: 901, verdict: null }));
  return rows;
}

describe("duplicates in the calibration sample", () => {
  it("show the judge's own verdict when it is known", () => {
    const rows = [
      row({}),
      row({
        kind: "duplicate",
        rowNumber: null,
        verdict: null,
        judgeVerdict: "Partial",
      }),
      row({ kind: "duplicate", rowNumber: null, verdict: null }),
    ];
    const records = parse(sampleCsv(rows, rows), {
      columns: true,
    }) as Record<string, string>[];
    expect(records.map((r) => [r["row id"], r["judge verdict"]])).toEqual([
      ["g2", "Correct"],
      ["d1", "Partial"],
      ["d2", "duplicate"],
    ]);
    const a = agreement(
      records.map((r) => ({ ...r, "reviewer verdict": "Partial" })),
    );
    expect(
      a.disagreements.filter((d) => d.field === "verdict").map((d) => d.rowId),
    ).toEqual(["g2", "d2"]);
  });

  it("reads a scored.json written before judgeVerdict existed", () => {
    const old = row({ kind: "duplicate", rowNumber: null, verdict: null });
    delete (old as Partial<ScoredRow>).judgeVerdict;
    const [record] = parse(sampleCsv([old], [old]), {
      columns: true,
    }) as Record<string, string>[];
    expect(record["judge verdict"]).toBe("duplicate");
  });
});

describe("calibrationSample", () => {
  const rows = dataset();

  it("covers every verdict, uncertain, GOLD GAP and duplicate rows", () => {
    const s = calibrationSample(rows, 1, 30);
    for (const v of ["Correct", "Partial", "Omission", "Hallucination"])
      expect(
        s.filter((r) => r.kind === "gold" && r.verdict === v).length,
      ).toBeGreaterThanOrEqual(3);
    expect(s.filter((r) => r.uncertain).length).toBeGreaterThanOrEqual(10);
    expect(s.filter((r) => r.kind === "extra").length).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      s.filter((r) => r.kind === "duplicate").length,
    ).toBeGreaterThanOrEqual(3);
    expect(s).toHaveLength(30);
  });

  it("never includes N/A or not-judged gold rows, nor repeats a row", () => {
    const s = calibrationSample(rows, 3, 60);
    expect(s.some((r) => r.rowNumber === 900 || r.rowNumber === 901)).toBe(
      false,
    );
    expect(new Set(s).size).toBe(s.length);
  });

  it("is deterministic per seed and varies across seeds", () => {
    const a = calibrationSample(rows, 7, 30);
    expect(calibrationSample(rows, 7, 30)).toEqual(a);
    expect(calibrationSample(rows, 8, 30)).not.toEqual(a);
  });

  it("takes what exists when a category is short", () => {
    const few = [row({ rowNumber: 2, verdict: "Partial" })];
    expect(calibrationSample(few, 1, 40)).toHaveLength(1);
  });
});

describe("sample CSV", () => {
  it("round trips with ids and blank reviewer columns", () => {
    const rows = dataset();
    const s = calibrationSample(rows, 1, 30);
    const records = parse(sampleCsv(rows, s), {
      columns: true,
    }) as Record<string, string>[];
    expect(records).toHaveLength(30);
    const ids = rowIds(rows);
    expect(records.map((r) => r["row id"])).toEqual(
      s.map((r) => ids[rows.indexOf(r)]),
    );
    expect(records[0]["gold value"]).toBe(s[0].goldValue);
    expect(records.every((r) => r["reviewer verdict"] === "")).toBe(true);
    expect(
      records.find((r) => r["judge verdict"] === "GOLD GAP")?.["row id"],
    ).toMatch(/^e\d+$/);
    expect(
      records.find((r) => r["judge verdict"] === "duplicate")?.["row id"],
    ).toMatch(/^d\d+$/);
    expect(
      records.find((r) => r["judge verdict"] === "Correct")?.["row id"],
    ).toMatch(/^g\d+$/);
  });
});

describe("agreement", () => {
  const rec = (o: Record<string, string>) => ({
    "row id": "g2",
    "judge verdict": "Correct",
    "judge partial reason": "",
    "judge cause": "",
    "reviewer verdict": "",
    "reviewer partial reason": "",
    "reviewer cause": "",
    "reviewer note": "",
    ...o,
  });

  it("counts only rows the reviewer filled and lists disagreements", () => {
    const a = agreement([
      rec({ "reviewer verdict": "Correct" }),
      rec({
        "row id": "g3",
        "judge verdict": "Partial",
        "judge partial reason": "trimmed_wording",
        "reviewer verdict": "Partial",
        "reviewer partial reason": "incomplete_list",
        "reviewer note": "list",
      }),
      rec({
        "row id": "g4",
        "judge verdict": "Omission",
        "judge cause": "prompt",
        "reviewer verdict": "Hallucination",
        "reviewer cause": "chunking",
        "reviewer note": "n",
      }),
      rec({
        "row id": "e5",
        "judge verdict": "GOLD GAP",
        "reviewer verdict": "GOLD GAP",
      }),
      rec({
        "row id": "d6",
        "judge verdict": "duplicate",
        "reviewer verdict": "Correct",
      }),
      rec({ "row id": "g7" }),
    ]);
    expect(a.reviewed).toBe(5);
    expect(a.agreed).toBe(3);
    expect(a.rate).toBeCloseTo(0.6);
    expect(a.perVerdict.Omission).toEqual({ reviewed: 1, agreed: 0 });
    expect(a.confusion.Omission.Hallucination).toBe(1);
    expect(a.partial).toEqual({ both: 1, agreed: 0 });
    expect(a.cause).toEqual({ both: 1, agreed: 0 });
    expect(a.disagreements.map((d) => `${d.rowId}:${d.field}`)).toEqual([
      "g3:partial reason",
      "g4:verdict",
      "g4:cause",
      "d6:verdict",
    ]);
  });

  it("states the LLM caveat and pass or fail against 85%", () => {
    const pass = calibrationMarkdown(
      agreement(
        Array.from({ length: 20 }, (_, i) =>
          rec({
            "row id": `g${i}`,
            "reviewer verdict": i < 18 ? "Correct" : "Omission",
          }),
        ),
      ),
    );
    expect(pass).toContain(
      "The reviewer is also an LLM (Claude); this measures agreement between models, not human truth.",
    );
    expect(pass).toContain("**PASS**");
    expect(
      calibrationMarkdown(agreement([rec({ "reviewer verdict": "Omission" })])),
    ).toContain("**FAIL**");
    expect(calibrationMarkdown(agreement([]))).toContain("**FAIL**");
  });
});

describe("blind reviewer copy", () => {
  const rows = dataset();
  const s = calibrationSample(rows, 1, 30);
  const parseCsv = (csv: string) =>
    parse(csv, { columns: true }) as Record<string, string>[];

  it("has the same rows and order, opaque ids and no judge columns", () => {
    const key = parseCsv(sampleCsv(rows, s));
    const blind = parseCsv(reviewerCsv(rows, s));
    expect(blind.map((r) => r["blind id"])).toEqual(
      key.map((r) => r["blind id"]),
    );
    expect(blind.map((r) => r["blind id"])).toEqual(
      s.map((_, i) => `r${i + 1}`),
    );
    const columns = Object.keys(blind[0]);
    expect(columns.some((c) => c.startsWith("judge"))).toBe(false);
    expect(columns).not.toContain("row id");
    expect(columns).not.toContain("gold_row");
    expect(columns).toEqual(
      expect.arrayContaining([
        "blind id",
        "gold value",
        "model value",
        "reviewer verdict",
        "reviewer note",
      ]),
    );
    // No g/e/d ids anywhere in the blind file.
    expect(reviewerCsv(rows, s)).not.toMatch(/(^|,)[ged]\d+(,|$)/m);
  });

  it("joins the filled reviewer columns onto the key by blind id", () => {
    const key = parseCsv(sampleCsv(rows, s));
    const blind = parseCsv(reviewerCsv(rows, s)).reverse();
    blind[0]["reviewer verdict"] = "Omission";
    blind[0]["reviewer note"] = "n";
    const joined = joinReviewer(key, blind);
    const last = joined[joined.length - 1];
    expect(last["reviewer verdict"]).toBe("Omission");
    expect(last["reviewer note"]).toBe("n");
    expect(last["row id"]).toBe(key[key.length - 1]["row id"]);
    expect(last["judge verdict"]).toBe(key[key.length - 1]["judge verdict"]);
  });

  it("errors on unknown, missing or duplicate ids", () => {
    const key = parseCsv(sampleCsv(rows, s));
    const blind = parseCsv(reviewerCsv(rows, s));
    expect(() =>
      joinReviewer(key, [...blind, { ...blind[0], "blind id": "zzz" }]),
    ).toThrow(/zzz/);
    expect(() => joinReviewer(key, blind.slice(1))).toThrow(
      /missing from reviewer file: r1$/,
    );
    expect(() => joinReviewer(key, [...blind, blind[2]])).toThrow(
      /Duplicate ids.*r3/,
    );
  });
});

describe("reviewer value normalisation", () => {
  const rec = (o: Record<string, string>) => ({
    "row id": "g2",
    "judge verdict": "Wrong content",
    "judge partial reason": "",
    "judge cause": "prompt",
    "reviewer verdict": "",
    "reviewer partial reason": "",
    "reviewer cause": "",
    "reviewer note": "",
    ...o,
  });

  it("matches case-insensitively and reports canonical casing", () => {
    const a = agreement([
      rec({
        "reviewer verdict": " wrong CONTENT ",
        "reviewer cause": "PROMPT",
      }),
      rec({
        "row id": "e3",
        "judge verdict": "GOLD GAP",
        "reviewer verdict": "gold gap",
      }),
    ]);
    expect(a.agreed).toBe(2);
    expect(a.cause).toEqual({ both: 1, agreed: 1 });
    expect(a.confusion["Wrong content"]["Wrong content"]).toBe(1);
    expect(a.unrecognised).toEqual([]);
  });

  it("lists unrecognised values and counts them as disagreements", () => {
    const a = agreement([
      rec({ "reviewer verdict": "Totally wrong", "reviewer cause": "vibes" }),
    ]);
    expect(a.agreed).toBe(0);
    expect(a.unrecognised).toEqual([
      { rowId: "g2", field: "verdict", value: "Totally wrong" },
      { rowId: "g2", field: "cause", value: "vibes" },
    ]);
    const md = calibrationMarkdown(a, true);
    expect(md).toContain("Totally wrong");
    expect(md).toContain("vibes");
    expect(md).toContain("Review mode: verdict-blind");
    expect(calibrationMarkdown(a)).toContain("Review mode: not blind");
  });
});
