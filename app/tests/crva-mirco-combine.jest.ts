import { describe, expect, it } from "@jest/globals";
import type { CrvaDraftValue } from "@/backend/ingest/plugins/ccra/draft-schema";
import {
  clusterValues,
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
