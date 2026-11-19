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
} from "../scripts/crva-mirco/groups";
import { CRVA_ITEM_SCHEMAS } from "../scripts/crva-mirco/inputs";
import {
  mergeEnvelopes,
  mergeGroupResults,
  riskRowItems,
} from "../scripts/crva-mirco/convert";

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
    // mircoRunStats counts repairs + 1 turns: 2 jobs with 1 + 0 repairs = 3 turns.
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
