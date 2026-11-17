import { describe, expect, it } from "@jest/globals";
import { parse } from "csv-parse/sync";
import type {
  CrvaDraftBundle,
  CrvaDraftValue,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import {
  formatEvidence,
  formatModelValue,
  reviewCsv,
  reviewSample,
  scoreRun,
  sheetCsv,
} from "../scripts/crva-eval/score";
import type {
  GoldRow,
  GoldWorkbook,
  Judgment,
  ScoredRow,
} from "../scripts/crva-eval/types";

function goldRow(partial: Partial<GoldRow>): GoldRow {
  return {
    rowNumber: 2,
    fieldId: "A1.2a",
    itemKey: "Balay (1961)",
    goldValue: "Balay M. 1961",
    pages: [179],
    evidence: "",
    status: "FOUND",
    notes: "gold note",
    trapNote: false,
    ...partial,
  };
}

function sourceValue(name: string, page = 179): CrvaDraftValue {
  return {
    fieldId: "A1.2a",
    value: { name, year: 1961 },
    source: { file: "ba.pdf", page, quote: "2 Balay M. 1961…" },
    origin: "ai_draft",
    confirmed: false,
  };
}

function judgment(overrides: Partial<Judgment>): Judgment {
  return {
    valueIndex: 0,
    itemKey: "Balay (1961)",
    verdict: "Correct",
    modelStatus: "FOUND",
    reason: "Same reference.",
    uncertain: false,
    goldGap: false,
    misattributedTo: null,
    partialReason: null,
    cause: null,
    ...overrides,
  };
}

interface Extra {
  traps?: GoldWorkbook["traps"];
  figures?: CrvaDraftBundle["figures"];
}

function score(
  rows: GoldRow[],
  values: CrvaDraftValue[],
  judgments: Record<string, Judgment[]>,
  extra: Extra = {},
) {
  return scoreRun({
    gold: {
      pdfFileName: "ba.pdf",
      pageCount: 185,
      rows,
      traps: extra.traps ?? [],
    },
    bundle: {
      file: "ba.pdf",
      pageCount: 185,
      ocrModel: "ocr",
      extractionModel: "ext",
      values,
      uncoveredFields: [],
      figures: extra.figures ?? [],
      dropped: [],
    },
    judgments,
  });
}

describe("scoreRun without matches", () => {
  it("gold FOUND with no match is Omission", () => {
    const [row] = score([goldRow({})], [], {});
    expect(row).toMatchObject({
      kind: "gold",
      verdict: "Omission",
      modelStatus: "NOT_FOUND",
      goldStatus: "FOUND",
      isV0Field: true,
    });
  });

  it("gold PARTIAL with no match is Omission", () => {
    const [row] = score([goldRow({ status: "PARTIAL" })], [], {});
    expect(row.verdict).toBe("Omission");
  });

  it("gold NOT_FOUND with no match is Correct (NOT_FOUND)", () => {
    const [row] = score([goldRow({ status: "NOT_FOUND" })], [], {});
    expect(row.verdict).toBe("Correct (NOT_FOUND)");
    expect(row.modelStatus).toBe("NOT_FOUND");
  });

  it("N/A rows have no verdict and a blank status in the CSV", () => {
    const rows = score([goldRow({ status: "N/A" })], [], {});
    expect(rows[0].verdict).toBeNull();
    expect(sheetCsv(rows).split("\n")[1]).toBe("2,A1.2a,Balay (1961),,,,,");
  });

  it("a non-v0 field is scored by rule with no judgment", () => {
    const [row] = score([goldRow({ fieldId: "X.5", itemKey: "k" })], [], {});
    expect(row).toMatchObject({ isV0Field: false, verdict: "Omission" });
    expect(row.uncertain).toBe(false);
  });

  describe("figure-only PARTIAL", () => {
    const figureRow = goldRow({ evidence: "Figura 3. Mapa de riesgo" });
    const captioned = [{ page: 179, imageId: "i", caption: "Mapa" }];

    it("applies with a captioned figure and a figure-like gold row", () => {
      const [row] = score([figureRow], [], {}, { figures: captioned });
      expect(row).toMatchObject({
        verdict: "Omission",
        modelStatus: "PARTIAL",
        notes: "figure listed on p. 179 for review",
      });
    });

    it("matches the Fig. abbreviation", () => {
      const [row] = score(
        [goldRow({ evidence: "Fig. 6 Cuenca del Plata" })],
        [],
        {},
        { figures: captioned },
      );
      expect(row.modelStatus).toBe("PARTIAL");
    });

    it.each(["figuras", "mapas", "gráficos", "figures", "maps", "charts"])(
      "matches the plural %s",
      (word) => {
        const [row] = score(
          [goldRow({ evidence: `ver ${word} 3 y 4` })],
          [],
          {},
          { figures: captioned },
        );
        expect(row.modelStatus).toBe("PARTIAL");
      },
    );

    it("does not apply when the figure has no caption", () => {
      const [row] = score(
        [figureRow],
        [],
        {},
        { figures: [{ page: 179, imageId: "i", caption: null }] },
      );
      expect(row).toMatchObject({
        verdict: "Omission",
        modelStatus: "NOT_FOUND",
      });
      expect(row.notes).toBe("");
    });

    it("does not apply when the gold row does not mention a figure", () => {
      const [row] = score([goldRow({})], [], {}, { figures: captioned });
      expect(row).toMatchObject({
        verdict: "Omission",
        modelStatus: "NOT_FOUND",
      });
    });
  });

  it("a v0 field with values but no judgments is uncertain", () => {
    const [row] = score([goldRow({})], [sourceValue("x")], {});
    expect(row).toMatchObject({
      verdict: "Omission",
      uncertain: true,
      reason: "field not judged",
    });
  });
});

describe("scoreRun with matches", () => {
  it("matched value fills its gold row", () => {
    const [row] = score([goldRow({})], [sourceValue("El Río")], {
      "A1.2a": [judgment({ verdict: "Partial", reason: "close" })],
    });
    expect(row).toMatchObject({
      modelValue: "El Río — 1961",
      modelEvidence: 'p. 179 — "2 Balay M. 1961…"',
      verdict: "Partial",
      modelStatus: "FOUND",
      notes: "close",
    });
  });

  it("second match to the same row is a duplicate; the best verdict fills the row", () => {
    const rows = score(
      [goldRow({})],
      [sourceValue("first"), sourceValue("second")],
      {
        "A1.2a": [
          judgment({ valueIndex: 0, verdict: "Partial" }),
          judgment({ valueIndex: 1, verdict: "Correct" }),
        ],
      },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "gold", verdict: "Correct" });
    expect(rows[0].modelValue).toBe("second — 1961");
    expect(rows[1]).toMatchObject({
      kind: "duplicate",
      rowNumber: null,
      verdict: null,
      notes: "duplicate of Balay (1961)",
    });
  });

  it("duplicate item_key in gold gives one value per row", () => {
    const rows = score(
      [
        goldRow({ rowNumber: 2, itemKey: "K" }),
        goldRow({ rowNumber: 3, itemKey: "K" }),
      ],
      [sourceValue("a"), sourceValue("b")],
      {
        "A1.2a": [
          judgment({ valueIndex: 0, itemKey: "K" }),
          judgment({ valueIndex: 1, itemKey: "K" }),
        ],
      },
    );
    expect(rows.map((r) => r.kind)).toEqual(["gold", "gold"]);
    expect(rows[0].modelValue).toBe("a — 1961");
    expect(rows[1].modelValue).toBe("b — 1961");
  });

  it("a value matched to a NOT_FOUND row fills it as Hallucination", () => {
    const [row] = score(
      [goldRow({ status: "NOT_FOUND" })],
      [sourceValue("x")],
      { "A1.2a": [judgment({ verdict: "Hallucination" })] },
    );
    expect(row).toMatchObject({ kind: "gold", verdict: "Hallucination" });
  });
});

describe("field aliases", () => {
  const a24: CrvaDraftValue = {
    fieldId: "A2.4a",
    value: { name: "Puerto", description: "Port" },
    source: { file: "ba.pdf", page: 10, quote: "El puerto" },
    origin: "ai_draft",
    confirmed: false,
  };

  it("an A2.4a value fills an A2.4 gold row", () => {
    const rows = score(
      [goldRow({ fieldId: "A2.4", itemKey: "Puerto" })],
      [a24],
      { "A2.4a": [judgment({ itemKey: "Puerto" })] },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fieldId: "A2.4",
      isV0Field: true,
      verdict: "Correct",
      modelValue: "Puerto — Port",
    });
  });

  it("an unmatched A2.4a value is filed under A2.4 and names the adapter field", () => {
    const rows = score([], [a24], {
      "A2.4a": [
        judgment({
          itemKey: null,
          verdict: "Hallucination",
          modelStatus: "NOT_FOUND",
          reason: "invented",
        }),
      ],
    });
    expect(rows[0]).toMatchObject({
      kind: "extra",
      fieldId: "A2.4",
      isV0Field: true,
      notes: "invented; adapter field A2.4a",
    });
  });

  it("aliased unjudged and duplicate rows use the gold id too", () => {
    const rows = score(
      [goldRow({ fieldId: "A2.4", itemKey: "Puerto" })],
      [a24, a24, a24],
      {
        "A2.4a": [
          judgment({ valueIndex: 0, itemKey: "Puerto" }),
          judgment({ valueIndex: 1, itemKey: "Puerto" }),
        ],
      },
    );
    expect(rows.map((r) => [r.kind, r.fieldId, r.notes])).toEqual([
      ["gold", "A2.4", "Same reference."],
      ["extra", "A2.4", "not judged; adapter field A2.4a"],
      ["duplicate", "A2.4", "duplicate of Puerto; adapter field A2.4a"],
    ]);
  });

  it("A2.4 rows with no judged values count as v0 and not judged", () => {
    const rows = score([goldRow({ fieldId: "A2.4", itemKey: "P" })], [a24], {});
    expect(rows[0]).toMatchObject({
      isV0Field: true,
      uncertain: true,
      reason: "field not judged",
    });
  });
});

describe("scoreRun extras", () => {
  const unmatched = { itemKey: null, modelStatus: "NOT_FOUND" as const };

  it("unmatched value becomes a Hallucination extra", () => {
    const rows = score([], [sourceValue("x")], {
      "A1.2a": [judgment({ ...unmatched, verdict: "Hallucination" })],
    });
    expect(rows[0]).toMatchObject({
      kind: "extra",
      rowNumber: null,
      verdict: "Hallucination",
    });
  });

  it("Misattribution extra notes where it belongs", () => {
    const rows = score([], [sourceValue("x")], {
      "A1.2a": [
        judgment({
          ...unmatched,
          verdict: "Misattribution",
          misattributedTo: "B1.2a/Heat",
        }),
      ],
    });
    expect(rows[0].notes).toBe("belongs in B1.2a/Heat");
  });

  it("GOLD GAP extra has no verdict", () => {
    const rows = score([], [sourceValue("x")], {
      "A1.2a": [
        judgment({
          ...unmatched,
          verdict: null,
          goldGap: true,
          uncertain: true,
        }),
      ],
    });
    expect(rows[0]).toMatchObject({
      kind: "extra",
      notes: "GOLD GAP",
      verdict: null,
      uncertain: true,
    });
  });
});

describe("partial reason and cause", () => {
  it("a matched value carries the judge's partial reason and cause", () => {
    const [row] = score([goldRow({})], [sourceValue("El Río")], {
      "A1.2a": [
        judgment({
          verdict: "Partial",
          modelStatus: "PARTIAL",
          partialReason: "less_detail",
          cause: "prompt",
        }),
      ],
    });
    expect(row).toMatchObject({
      kind: "gold",
      partialReason: "less_detail",
      cause: "prompt",
    });
  });

  it("an extra carries the judge's cause", () => {
    const [row] = score([], [sourceValue("x")], {
      "A1.2a": [
        judgment({
          itemKey: null,
          modelStatus: "NOT_FOUND",
          verdict: "Hallucination",
          cause: "ocr_text_extraction",
        }),
      ],
    });
    expect(row).toMatchObject({
      kind: "extra",
      partialReason: null,
      cause: "ocr_text_extraction",
    });
  });

  it("non-v0 Omission rows carry field_outside_v0; v0 Omission rows no cause", () => {
    const rows = score(
      [goldRow({}), goldRow({ rowNumber: 3, fieldId: "X.5", itemKey: "k" })],
      [],
      {},
    );
    expect(rows.map((r) => [r.fieldId, r.verdict, r.cause])).toEqual([
      ["A1.2a", "Omission", null],
      ["X.5", "Omission", "field_outside_v0"],
    ]);
  });

  it("rows with no verdict carry neither", () => {
    const rows = score([goldRow({})], [sourceValue("a"), sourceValue("b")], {
      "A1.2a": [
        judgment({ valueIndex: 0 }),
        judgment({ valueIndex: 1, verdict: "Wrong content", cause: "scope" }),
      ],
    });
    expect(rows[1]).toMatchObject({
      kind: "duplicate",
      verdict: null,
      partialReason: null,
      cause: null,
    });
  });
});

describe("trap flag", () => {
  it("is set by trapNote or a Traps page, ignoring 'all'", () => {
    const rows = score(
      [
        goldRow({ rowNumber: 2, itemKey: "a", trapNote: true, pages: [1] }),
        goldRow({ rowNumber: 3, itemKey: "b", pages: [40] }),
        goldRow({ rowNumber: 4, itemKey: "c", pages: [7] }),
      ],
      [],
      {},
      {
        traps: [
          { pages: [40], what: "w", why: "y" },
          { pages: "all", what: "w", why: "y" },
        ],
      },
    );
    expect(rows.map((r) => r.trap)).toEqual([true, true, false]);
  });

  it("flags an extra cited on a trap page", () => {
    const rows = score(
      [],
      [sourceValue("x", 40)],
      {
        "A1.2a": [
          judgment({
            itemKey: null,
            verdict: "Hallucination",
            modelStatus: "NOT_FOUND",
          }),
        ],
      },
      { traps: [{ pages: [40], what: "w", why: "y" }] },
    );
    expect(rows[0].trap).toBe(true);
  });
});

describe("formatters and sheetCsv", () => {
  it("formats values and evidence", () => {
    expect(
      formatModelValue({
        fieldId: "E1.1a",
        value: {
          title: "T",
          description: "D",
          hazards: ["a", "b"],
          affected: ["c"],
        },
        source: { file: "f", page: 1, quote: "q" },
        origin: "ai_draft",
        confirmed: false,
      }),
    ).toBe("T — D — a, b — c");
    expect(formatEvidence({ file: "f", page: 3, quote: "q" })).toBe(
      'p. 3 — "q"',
    );
  });

  it("writes the exact header, gold rows in order, then extras; no gold notes", () => {
    const rows = score(
      [
        goldRow({ rowNumber: 5, itemKey: "b" }),
        goldRow({ rowNumber: 3, itemKey: "a, x" }),
      ],
      [sourceValue("v")],
      {
        "A1.2a": [
          judgment({
            itemKey: null,
            verdict: "Hallucination",
            modelStatus: "NOT_FOUND",
            reason: 'said "no"',
          }),
        ],
      },
    );
    const csv = sheetCsv(rows);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      "gold_row,field_id,item_key,model value,model evidence,model status,verdict,eval notes",
    );
    expect(lines[1].startsWith('3,A1.2a,"a, x",')).toBe(true);
    expect(lines[2].startsWith("5,A1.2a,b,")).toBe(true);
    expect(lines[3].startsWith(",A1.2a,,")).toBe(true);
    expect(lines[3]).toContain('"said ""no"""');
    expect(csv).not.toContain("gold note");
  });
});

describe("gold side of scored rows", () => {
  it("gold and duplicate rows carry the gold answer; extras are empty", () => {
    const rows = score(
      [goldRow({ evidence: "Balay, 1961", pages: [179, 180] })],
      [sourceValue("a"), sourceValue("b"), sourceValue("c")],
      {
        "A1.2a": [
          judgment({ valueIndex: 0 }),
          judgment({ valueIndex: 1 }),
          judgment({
            valueIndex: 2,
            itemKey: null,
            verdict: "Hallucination",
          }),
        ],
      },
    );
    const gold = {
      goldValue: "Balay M. 1961",
      goldEvidence: "Balay, 1961",
      goldPages: [179, 180],
    };
    expect(rows.map((r) => r.kind)).toEqual(["gold", "extra", "duplicate"]);
    expect(rows[0]).toMatchObject(gold);
    expect(rows[2]).toMatchObject(gold);
    expect(rows[1]).toMatchObject({
      goldValue: "",
      goldEvidence: "",
      goldPages: [],
    });
  });

  it("review.csv shows gold and model side by side; scored.csv is unchanged", () => {
    const rows = score(
      [goldRow({ evidence: "Balay, 1961" })],
      [sourceValue("El Río")],
      { "A1.2a": [judgment({ verdict: "Partial", uncertain: true })] },
    );
    const parsed = parse(reviewCsv(rows), { columns: true }) as Record<
      string,
      string
    >[];
    expect(Object.keys(parsed[0])).toEqual([
      "gold_row",
      "field_id",
      "item_key",
      "gold status",
      "gold value",
      "gold evidence",
      "model value",
      "model evidence",
      "model status",
      "verdict",
      "partial reason",
      "cause",
      "uncertain",
      "eval notes",
    ]);
    expect(parsed[0]).toMatchObject({
      gold_row: "2",
      "gold status": "FOUND",
      "gold value": "Balay M. 1961",
      "gold evidence": "Balay, 1961",
      "model value": "El Río — 1961",
      verdict: "Partial",
      uncertain: "yes",
    });
    expect(sheetCsv(rows).split("\n")[0]).toBe(
      "gold_row,field_id,item_key,model value,model evidence,model status,verdict,eval notes",
    );
    expect(sheetCsv(rows)).not.toContain("Balay, 1961");
  });
});

describe("reviewSample", () => {
  const row = (i: number, extra: Partial<ScoredRow> = {}): ScoredRow => ({
    kind: "gold",
    rowNumber: i,
    fieldId: "A1.1",
    itemKey: `k${i}`,
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
    ...extra,
  });

  it("returns uncertain rows plus 30 others, deterministically", () => {
    const rows = [
      ...Array.from({ length: 100 }, (_, i) => row(i)),
      row(200, { uncertain: true }),
      row(201, { verdict: "Omission" }),
    ];
    const a = reviewSample(rows, 7);
    expect(reviewSample(rows, 7)).toEqual(a);
    expect(a[0].rowNumber).toBe(200);
    expect(a).toHaveLength(31);
    expect(new Set(a).size).toBe(a.length);
    expect(a.some((r) => r.verdict === "Omission")).toBe(false);
    expect(reviewSample(rows, 8)).not.toEqual(a);
  });

  it("scales to 10% for large populations", () => {
    const rows = Array.from({ length: 500 }, (_, i) => row(i));
    expect(reviewSample(rows, 1)).toHaveLength(50);
  });
});

describe("no value is ever dropped", () => {
  const halluc = judgment({
    itemKey: null,
    verdict: "Hallucination",
    modelStatus: "NOT_FOUND",
  });

  it("a value with no judgment becomes an uncertain 'not judged' extra", () => {
    const rows = score([], [sourceValue("a"), sourceValue("b")], {
      "A1.2a": [halluc],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      kind: "extra",
      verdict: null,
      uncertain: true,
      notes: "not judged",
      modelValue: "b — 1961",
    });
  });

  it("out-of-range and negative valueIndex are ignored", () => {
    const rows = score([], [sourceValue("a")], {
      "A1.2a": [
        judgment({ ...halluc, valueIndex: 5 }),
        judgment({ ...halluc, valueIndex: -1 }),
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ notes: "not judged", uncertain: true });
  });

  it("an empty judgments array counts as not judged", () => {
    const rows = score([goldRow({})], [sourceValue("a")], { "A1.2a": [] });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      uncertain: true,
      reason: "field not judged",
    });
    expect(rows[1].notes).toBe("not judged");
  });

  it("a not-judged field with values and no gold rows still emits them", () => {
    const rows = score([], [sourceValue("a")], {});
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe("not judged");
  });

  it("NOT_FOUND gold rows of a not-judged field are uncertain too", () => {
    const [row] = score(
      [goldRow({ status: "NOT_FOUND" })],
      [sourceValue("a")],
      {},
    );
    expect(row).toMatchObject({
      verdict: "Correct (NOT_FOUND)",
      uncertain: true,
      reason: "field not judged",
    });
  });

  it("N/A rows are not flagged as not judged", () => {
    const [row] = score([goldRow({ status: "N/A" })], [sourceValue("a")], {});
    expect(row.uncertain).toBe(false);
  });
});

describe("matching edge cases", () => {
  it("equal verdicts: the lower valueIndex fills the row", () => {
    const rows = score([goldRow({})], [sourceValue("a"), sourceValue("b")], {
      "A1.2a": [judgment({ valueIndex: 1 }), judgment({ valueIndex: 0 })],
    });
    expect(rows[0].modelValue).toBe("a — 1961");
    expect(rows[1]).toMatchObject({
      kind: "duplicate",
      modelValue: "b — 1961",
    });
  });

  it("a judgment naming an N/A row or unknown key becomes an extra", () => {
    const rows = score(
      [goldRow({ status: "N/A" })],
      [sourceValue("a"), sourceValue("b")],
      {
        "A1.2a": [
          judgment({ valueIndex: 0 }),
          judgment({ valueIndex: 1, itemKey: "Nope" }),
        ],
      },
    );
    expect(rows.map((r) => r.kind)).toEqual(["gold", "extra", "extra"]);
    expect(rows[0].modelValue).toBe("");
    expect(rows.slice(1).map((r) => [r.verdict, r.uncertain, r.notes])).toEqual(
      [
        [null, true, 'gold row "Balay (1961)" not found (stale judgment?)'],
        [null, true, 'gold row "Nope" not found (stale judgment?)'],
      ],
    );
  });

  it("goldGap with an itemKey never fills a gold row", () => {
    const rows = score([goldRow({})], [sourceValue("a")], {
      "A1.2a": [judgment({ verdict: null, goldGap: true, uncertain: true })],
    });
    expect(rows[0]).toMatchObject({ kind: "gold", verdict: "Omission" });
    expect(rows[1]).toMatchObject({ kind: "extra", notes: "GOLD GAP" });
  });

  it("extras are ordered by field then value index", () => {
    const b: CrvaDraftValue = {
      ...sourceValue("b"),
      fieldId: "A1.1",
      value: "t",
    };
    const rows = score([], [sourceValue("a"), sourceValue("c"), b], {});
    expect(rows.map((r) => r.fieldId)).toEqual(["A1.1", "A1.2a", "A1.2a"]);
    expect(rows.map((r) => r.modelValue)).toEqual([
      "t",
      "a — 1961",
      "c — 1961",
    ]);
  });
});

describe("sheetCsv cells", () => {
  it("round-trips multi-line cells and neutralises formulas", () => {
    const rows = score(
      [],
      [sourceValue("line1\nline2"), sourceValue("=SUM(1)")],
      {},
    );
    const parsed = parse(sheetCsv(rows), { columns: true }) as Record<
      string,
      string
    >[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]["model value"]).toBe("line1\nline2 — 1961");
    expect(parsed[1]["model value"]).toBe("'=SUM(1) — 1961");
    expect(parsed[0]["eval notes"]).toBe("not judged");
  });
});
