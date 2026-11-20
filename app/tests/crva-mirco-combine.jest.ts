import { describe, expect, it } from "@jest/globals";
import type {
  CrvaDraftBundle,
  CrvaDraftValue,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import type { RunStats } from "../scripts/crva-eval/run-adapter";
import { runPlan } from "../scripts/crva-mirco/run-mirco-refs";
import {
  clusterValues,
  combineRuns,
  sameValue,
  unionValues,
  valueKey,
  voteValues,
} from "../scripts/crva-mirco/combine";

const v = (
  fieldId: string,
  value: unknown,
  quote = "una cita del informe",
): CrvaDraftValue =>
  ({
    fieldId,
    value,
    source: { file: "r.pdf", page: 1, quote },
    origin: "ai_draft",
    confirmed: false,
  }) as CrvaDraftValue;

const c12 = (
  hazard: string,
  sector: string,
  description: string,
  quote?: string,
) => v("C1.2a", { hazard, sector, description }, quote);

describe("valueKey", () => {
  it("uses the field's identifying parts", () => {
    expect(
      valueKey(v("A1.2a", { name: "Balay, M. — El Río", year: 1961 })),
    ).toBe("balay m el rio");
    expect(valueKey(c12("Olas de calor", "Energía eléctrica", "Cortes"))).toBe(
      "olas de calor energia electrica",
    );
    expect(
      valueKey(
        v("E1.1a", {
          title: "Olas de calor × Población",
          description: "x",
          hazards: [],
          affected: [],
        }),
      ),
    ).toBe("olas de calor poblacion");
    expect(valueKey(v("A1.1", "Límites administrativos de CABA"))).toBe(
      "limites administrativos de caba",
    );
  });
});

describe("sameValue", () => {
  it("matches the same hazard × sector worded slightly differently", () => {
    expect(
      sameValue(
        c12(
          "Olas de calor",
          "Energía eléctrica y telecomunicaciones",
          "Cortes de energía en 2013",
        ),
        c12(
          "Ola de calor",
          "Energía eléctrica",
          "Cortes en el suministro de energía en 2013",
        ),
      ),
    ).toBe(true);
  });

  it("keeps different sectors of one hazard apart", () => {
    expect(
      sameValue(
        c12("Olas de calor", "Población", "Mortalidad"),
        c12("Olas de calor", "Energía eléctrica", "Cortes"),
      ),
    ).toBe(false);
  });

  it("needs the same year for A1.2a", () => {
    const a = v("A1.2a", { name: "INDEC — Censo Nacional", year: 2010 });
    const b = v("A1.2a", { name: "INDEC — Censo Nacional", year: 2001 });
    expect(sameValue(a, b)).toBe(false);
    expect(
      sameValue(a, v("A1.2a", { name: "INDEC — Censo Nacional", year: 2010 })),
    ).toBe(true);
  });

  it("never matches across fields", () => {
    expect(
      sameValue(v("A1.1", "Límites de CABA"), v("A2.1a", "Límites de CABA")),
    ).toBe(false);
  });
});

describe("clusterValues", () => {
  it("groups matching values across runs, never two from the same run", () => {
    const runs = [
      [
        c12("Olas de calor", "Energía", "Cortes A"),
        c12("Olas de calor", "Energía", "Cortes B"),
      ],
      [c12("Olas de calor", "Energía", "Cortes C")],
      [],
    ];
    const clusters = clusterValues(runs);
    expect(clusters.map((c) => c.runs.sort())).toEqual([[0, 1], [0]]);
  });
});

describe("voteValues", () => {
  const runs = [
    [
      c12("Olas de calor", "Energía", "Cortes", "cita corta aqui"),
      c12("Sequías", "Alimentos", "Precio"),
    ],
    [
      c12(
        "Olas de calor",
        "Energía",
        "Cortes",
        "una cita bastante mas larga del informe",
      ),
    ],
    [c12("Inundaciones", "Vialidad", "Calles")],
  ];

  it("keeps values found in at least 2 runs, with the longest quote", () => {
    const kept = voteValues(runs, 2);
    expect(kept).toHaveLength(1);
    expect(kept[0].source.quote).toBe(
      "una cita bastante mas larga del informe",
    );
  });

  it("unions every value once", () => {
    expect(unionValues(runs)).toHaveLength(3);
  });
});

// Vote 2/3 default (2026-11-20): the runner plans N runs and a combiner.
describe("runPlan", () => {
  it("defaults to 3 runs combined by vote", () => {
    expect(runPlan([])).toEqual({ runs: 3, combine: "vote" });
  });

  it("gives one uncombined run with --runs 1", () => {
    expect(runPlan(["--runs", "1"])).toEqual({ runs: 1, combine: "none" });
  });

  it("allows union of 2 or 3 runs for experiments", () => {
    expect(runPlan(["--runs", "2", "--combine", "union"])).toEqual({
      runs: 2,
      combine: "union",
    });
    expect(runPlan(["--combine", "union"])).toEqual({
      runs: 3,
      combine: "union",
    });
  });

  it("rejects plans that do not make sense", () => {
    expect(() => runPlan(["--runs", "2"])).toThrow(
      /vote needs at least 3 runs/,
    );
    expect(() => runPlan(["--runs", "1", "--combine", "vote"])).toThrow(
      /--runs 1/,
    );
    expect(() => runPlan(["--runs", "0"])).toThrow(/--runs/);
    expect(() => runPlan(["--combine", "majority"])).toThrow(/--combine/);
    expect(() => runPlan(["--groups", "--runs", "3"])).toThrow(/--groups/);
    expect(runPlan(["--groups"])).toEqual({ runs: 1, combine: "none" });
  });
});

describe("combineRuns", () => {
  const bundle = (values: CrvaDraftValue[]) =>
    ({
      file: "r.pdf",
      pageCount: 2,
      ocrModel: "m",
      extractionModel: "x",
      values,
      uncoveredFields: [],
      figures: [],
      dropped: [],
    }) as CrvaDraftBundle;
  const stats = (promptTokens: number, minutes: number) =>
    ({
      run: 1,
      status: "ok",
      minutes,
      parts: 1,
      retries: 0,
      ocrPages: 0,
      promptTokens,
      completionTokens: 10,
      cachedInputTokens: 0,
      llmCalls: 1,
      nonStopFinishes: 0,
      modelTurns: 1,
      valuesKept: 1,
      valuesDropped: 0,
      droppedByReason: {},
      fieldsWithValue: 1,
      figures: 0,
      warnings: 0,
    }) as RunStats;
  const heat = c12("Olas de calor", "Energía", "Cortes");
  const drought = c12("Sequías", "Alimentos", "Precio");

  it("votes 2 of 3 and sums the runs' tokens", () => {
    const out = combineRuns({
      bundles: [bundle([heat, drought]), bundle([heat]), bundle([])],
      stats: [stats(100, 10), stats(200, 12), stats(300, 11)],
      mode: "vote",
    });
    expect(out.bundle.values).toHaveLength(1);
    expect(out.bundle.uncoveredFields).not.toContain("C1.2a");
    expect(out.stats).toMatchObject({
      promptTokens: 600,
      minutes: 12,
      valuesKept: 1,
    });
    expect(out.valuesPerRun).toEqual([2, 1, 0]);
  });

  it("unions every value once", () => {
    const out = combineRuns({
      bundles: [bundle([heat, drought]), bundle([heat])],
      stats: [stats(100, 10), stats(200, 12)],
      mode: "union",
    });
    expect(out.bundle.values).toHaveLength(2);
  });
});
