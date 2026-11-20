import { describe, expect, it } from "@jest/globals";
import {
  CRVA_FIELD_IDS,
  type CrvaFieldId,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import {
  CRVA_GROUPS,
  RISK_ROWS_KEY,
  groupJsonSchema,
  groupUserPrompt,
} from "../scripts/crva-agentic-extraction/groups";
import { CRVA_ITEM_SCHEMAS } from "../scripts/crva-agentic-extraction/inputs";
import {
  mergeEnvelopes,
  mergeGroupResults,
  riskRowItems,
  unionReferenceItems,
  withReferenceItems,
} from "../scripts/crva-agentic-extraction/convert";

// Schema JSON is read by path in assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

describe("CRVA_GROUPS", () => {
  it("covers the 12 v0 fields once, in five groups", () => {
    expect(CRVA_GROUPS.map((g) => g.id)).toEqual([
      "A1",
      "A2",
      "B1C1",
      "D1",
      "E1",
    ]);
    const all = CRVA_GROUPS.flatMap((g) => g.fieldIds);
    expect([...all].sort()).toEqual([...CRVA_FIELD_IDS].sort());
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("groupJsonSchema", () => {
  it.each(CRVA_GROUPS.map((g) => [g.id, g] as const))(
    "%s holds only its own fields, all required",
    (_id, group) => {
      const schema = groupJsonSchema(group, {
        referencePass: true,
      }) as JsonObject;
      const extra = group.id === "E1" ? [RISK_ROWS_KEY] : [];
      expect(Object.keys(schema.properties)).toEqual([
        ...group.fieldIds,
        ...extra,
      ]);
      expect(schema.required).toEqual([...group.fieldIds, ...extra]);
      expect(schema.additionalProperties).toBe(false);
      for (const id of group.fieldIds) {
        expect(schema.properties[id].items).toEqual(
          CRVA_ITEM_SCHEMAS[id as CrvaFieldId],
        );
      }
    },
  );

  it("gives E1 risk table rows with the cell coordinates", () => {
    const e1 = CRVA_GROUPS.find((g) => g.id === "E1")!;
    const rows = (groupJsonSchema(e1, { referencePass: true }) as JsonObject)
      .properties[RISK_ROWS_KEY];
    expect(rows.type).toBe("array");
    expect(Object.keys(rows.items.properties)).toEqual([
      "hazard",
      "receptor",
      "level",
      "scenario",
      "horizon",
      "table",
    ]);
  });

  it("limits A1.2a to text, table and figure sources when the reference pass runs", () => {
    const a1 = CRVA_GROUPS.find((g) => g.id === "A1")!;
    const on = (groupJsonSchema(a1, { referencePass: true }) as JsonObject)
      .properties["A1.2a"].description;
    const off = (groupJsonSchema(a1, { referencePass: false }) as JsonObject)
      .properties["A1.2a"].description;
    expect(on).toMatch(/not .*reference list/i);
    expect(off).not.toMatch(/not .*reference list/i);
  });
});

describe("groupUserPrompt", () => {
  it.each(CRVA_GROUPS.map((g) => [g.id, g] as const))(
    "%s keeps the rules and only its own field guide entries",
    (_id, group) => {
      const prompt = groupUserPrompt("<role>Default</role>", group, {
        referencePass: true,
      });
      expect(prompt.startsWith("<role>Default</role>")).toBe(true);
      for (const tag of [
        "<value_rules>",
        "<detail_rules>",
        "<granularity_rules>",
      ]) {
        expect(prompt).toContain(tag);
      }
      for (const id of CRVA_FIELD_IDS) {
        const inGroup = group.fieldIds.includes(id as CrvaFieldId);
        expect(prompt.includes(`### ${id} `)).toBe(inGroup);
      }
    },
  );

  it("asks E1 for one row per table cell, quoting the caption", () => {
    const e1 = CRVA_GROUPS.find((g) => g.id === "E1")!;
    const prompt = groupUserPrompt("x", e1, { referencePass: true });
    expect(prompt).toContain(RISK_ROWS_KEY);
    expect(prompt).toMatch(/caption/i);
    expect(prompt).toMatch(/map colou?r/i);
  });

  it("tells A1 that the reference list is handled elsewhere", () => {
    const a1 = CRVA_GROUPS.find((g) => g.id === "A1")!;
    expect(groupUserPrompt("x", a1, { referencePass: true })).toMatch(
      /reference list/i,
    );
  });
});

function found(pointer: string, quotes: [number, string][]) {
  return {
    field_id: pointer,
    status: "found",
    observations: [
      {
        evidence: quotes.map(([pdf_page, quote]) => ({ pdf_page, quote })),
      },
    ],
  };
}

const CAPTION = "Tabla 35. Resultados del análisis de riesgo";
const row = (scenario: string, level: string, receptor = "Población") => ({
  hazard: "Olas de calor",
  receptor,
  level,
  scenario,
  horizon: "2041-2060",
  table: "Tabla 35",
});

describe("riskRowItems", () => {
  const rows = [
    row("RCP4.5", "Alto 44%"),
    row("RCP8.5", "Muy Alto 44%"),
    row("RCP8.5", "Alto 47%", "Hábitat urbano"),
  ];
  const fields = rows.flatMap((_r, i) => [
    found(`/${RISK_ROWS_KEY}/${i}/level`, [[146, CAPTION]]),
    found(`/${RISK_ROWS_KEY}/${i}/hazard`, [[146, CAPTION]]),
  ]);

  it("groups table cells into one E1.1a item per hazard × receptor", () => {
    const items = riskRowItems({ rows, fields, textItems: [] });
    expect(items).toEqual([
      {
        fieldId: "E1.1a",
        index: 0,
        value: {
          title: "Olas de calor × Población",
          description:
            "RCP4.5 2041-2060: Alto 44%; RCP8.5 2041-2060: Muy Alto 44% (Tabla 35)",
          hazards: ["Olas de calor"],
          affected: ["Población"],
        },
        evidence: [{ page: 146, quote: CAPTION }],
      },
      {
        fieldId: "E1.1a",
        index: 1,
        value: {
          title: "Olas de calor × Hábitat urbano",
          description: "RCP8.5 2041-2060: Alto 47% (Tabla 35)",
          hazards: ["Olas de calor"],
          affected: ["Hábitat urbano"],
        },
        evidence: [{ page: 146, quote: CAPTION }],
      },
    ]);
  });

  it("appends the table levels to a text item with the same hazard × receptor", () => {
    const text = {
      fieldId: "E1.1a",
      index: 0,
      value: {
        title: "Olas de calor × población",
        description: "Riesgo creciente con el horizonte",
        hazards: ["Olas de calor"],
        affected: ["Población"],
      },
      evidence: [{ page: 145, quote: "En general, los niveles de riesgo" }],
    };
    const items = riskRowItems({ rows, fields, textItems: [text] });
    expect(items).toHaveLength(1);
    expect(text.value.description).toBe(
      "Riesgo creciente con el horizonte; RCP4.5 2041-2060: Alto 44%; RCP8.5 2041-2060: Muy Alto 44% (Tabla 35)",
    );
    expect(text.evidence).toEqual([
      { page: 145, quote: "En general, los niveles de riesgo" },
      { page: 146, quote: CAPTION },
    ]);
    expect(items[0].index).toBe(1);
  });
});

describe("mergeGroupResults", () => {
  const a1 = {
    data: { "A1.1": ["Límites"], "A1.2a": [] },
    fields: [found("/A1.1/0", [[1, "límites administrativos"]])],
  };
  const e1 = {
    data: { "E1.1a": [], [RISK_ROWS_KEY]: [row("RCP4.5", "Alto")] },
    fields: [found(`/${RISK_ROWS_KEY}/0/level`, [[146, CAPTION]])],
  };

  it("joins the groups' items and turns risk rows into E1.1a items without bad pointers", () => {
    const merged = mergeGroupResults([
      { groupId: "A1", result: a1 },
      { groupId: "E1", result: e1 },
    ]);
    expect(merged.badPointers).toBe(0);
    expect(merged.items.map((i) => i.fieldId)).toEqual(["A1.1", "E1.1a"]);
  });

  it("skips a failed group", () => {
    const merged = mergeGroupResults([
      { groupId: "A1", result: a1 },
      { groupId: "E1", result: null },
    ]);
    expect(merged.items.map((i) => i.fieldId)).toEqual(["A1.1"]);
  });
});

describe("mergeEnvelopes", () => {
  it("sums usage and repairs so run stats count every job's turns", () => {
    const env = mergeEnvelopes([
      {
        execution_status: "completed",
        repair: { repairs: 1 },
        usage: {
          input_tokens: 10,
          output_tokens: 2,
          input_tokens_details: { cached_tokens: 8 },
          output_tokens_details: { reasoning_tokens: 1 },
        },
      },
      {
        execution_status: "completed",
        repair: { repairs: 0 },
        usage: { input_tokens: 5, output_tokens: 1 },
      },
    ]);
    expect(env.usage).toEqual({
      input_tokens: 15,
      output_tokens: 3,
      input_tokens_details: { cached_tokens: 8 },
      output_tokens_details: { reasoning_tokens: 1 },
    });
    // agenticRunStats counts repairs + 1 turns: 2 jobs with 1 + 0 repairs = 3 turns.
    expect(env.repair.repairs).toBe(2);
    expect(env.execution_status).toBe("completed");
  });

  it("reports a failed job", () => {
    const env = mergeEnvelopes([
      { execution_status: "completed", usage: {} },
      { execution_status: "repair_error", usage: {} },
    ]);
    expect(env.execution_status).toBe("partial: repair_error");
  });
});

// Final review fixes (wave 2).
describe("wave 2 review fixes", () => {
  it("marks a run with a failed group as failed", () => {
    const env = mergeEnvelopes([
      {
        result: { data: {}, fields: [] },
        execution_status: "completed",
        usage: {},
      },
      { result: null, execution_status: "failed", usage: {} },
    ]);
    expect(env.result).toBeNull();
    expect(env.execution_status).toBe("partial: failed");
  });

  it("counts risk rows it cannot use as bad pointers", () => {
    const merged = mergeGroupResults([
      {
        groupId: "E1",
        result: {
          data: {
            "E1.1a": [],
            [RISK_ROWS_KEY]: [
              { ...row("RCP4.5", "Alto"), hazard: "" },
              row("RCP8.5", "Alto"),
            ],
          },
          fields: [
            found(`/${RISK_ROWS_KEY}/0/level`, [[146, CAPTION]]),
            found(`/${RISK_ROWS_KEY}/9/level`, [[146, CAPTION]]),
          ],
        },
      },
    ]);
    // Row 0 has an empty hazard, row 1 has no evidence, index 9 does not exist.
    expect(merged.items).toEqual([]);
    expect(merged.badPointers).toBe(3);
  });

  it("does not throw on a text E1.1a item without title or hazards", () => {
    const text = {
      fieldId: "E1.1a",
      index: 0,
      value: null,
      evidence: [{ page: 1, quote: "una cita larga" }],
    };
    const rows = [row("RCP4.5", "Alto")];
    const fields = [found(`/${RISK_ROWS_KEY}/0/level`, [[146, CAPTION]])];
    expect(riskRowItems({ rows, fields, textItems: [text] })).toHaveLength(1);
  });
});

// Wave 2.5: the single job's A1.2a items are replaced by the reference pass.
describe("withReferenceItems", () => {
  const job = [
    { fieldId: "A1.1", index: 0, value: "x", evidence: [] },
    { fieldId: "A1.2a", index: 0, value: { author: "CCSM4" }, evidence: [] },
    { fieldId: "A1.2a", index: 1, value: { author: "IPCC" }, evidence: [] },
  ];
  const refs = [
    { fieldId: "A1.2a", index: 0, value: { author: "Balay" }, evidence: [] },
  ];

  it("drops the job's A1.2a items and adds the reference items", () => {
    expect(withReferenceItems(job, refs)).toEqual([job[0], refs[0]]);
  });

  it("keeps the job's A1.2a items when no reference list was found", () => {
    expect(withReferenceItems(job, null)).toEqual(job);
  });
});

// Wave 2.6: union of the reference pass and the job's non-duplicate A1.2a items.
describe("unionReferenceItems", () => {
  const ref = (author: string, title: string, year: number | null) => ({
    fieldId: "A1.2a",
    index: 0,
    value: { author, title, year, used_for: null },
    evidence: [],
  });
  const refs = [
    ref("Balay, M.", "El Río de la Plata entre la atmósfera y el mar", 1961),
    ref("INDEC-Censo 2010", "", 2010),
  ];

  it("keeps every reference item and only the job items they do not cover", () => {
    const job = [
      { fieldId: "A1.1", index: 0, value: "x", evidence: [] },
      ref("Balay M.", "El Rio de la Plata entre la atmosfera y el mar.", 1961),
      ref("INDEC", "Censo Nacional 2010", 2010),
      ref("SMN", "Registros de la estación OCBA", null),
      ref("Balay, M.", "Otro trabajo distinto", 1961),
    ];
    const out = unionReferenceItems(job, refs);
    expect(
      out.map((i) => (i.value as { author?: string }).author ?? i.value),
    ).toEqual(["x", "SMN", "Balay, M.", "Balay, M.", "INDEC-Censo 2010"]);
    expect(out.filter((i) => i.fieldId === "A1.2a")).toHaveLength(4);
  });

  it("keeps the job's items when no reference list was found", () => {
    const job = [ref("SMN", "OCBA", null)];
    expect(unionReferenceItems(job, null)).toEqual(job);
  });
});
