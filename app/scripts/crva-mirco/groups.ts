/**
 * Wave 2: one Mirco job per field group instead of one job for all 12 fields, so
 * each job has a smaller output and one topic. Builds each group's JSON Schema and
 * user prompt from the wave 1.5 rules and field guide (inputs.ts).
 */
import {
  CRVA_FIELD_LABELS,
  type CrvaFieldId,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import { CRVA_VALUE_RULES } from "@/backend/ingest/plugins/ccra/extract-crva-fields";
import {
  CRVA_DETAIL_RULES,
  CRVA_GRANULARITY_RULES,
  CRVA_ITEM_SCHEMAS,
  CRVA_MIRCO_SHAPES,
  fieldGuideMarkdown,
} from "./inputs";

export interface CrvaGroup {
  id: string;
  fieldIds: CrvaFieldId[];
}

/** B1 and C1 share a job: an impact needs its hazard. */
export const CRVA_GROUPS: CrvaGroup[] = [
  { id: "A1", fieldIds: ["A1.1", "A1.2a"] },
  { id: "A2", fieldIds: ["A2.1a", "A2.1b", "A2.4a", "A2.5a"] },
  { id: "B1C1", fieldIds: ["B1.2a", "C1.1a", "C1.2a"] },
  { id: "D1", fieldIds: ["D1.1a", "D1.2a"] },
  { id: "E1", fieldIds: ["E1.1a"] },
];

/** Extra E1 array: one row per cell of a risk result table. */
export const RISK_ROWS_KEY = "risk_table_rows";

export interface GroupOptions {
  /** Our code extracts the reference list (references.ts), so A1.2a keeps only other sources. */
  referencePass: boolean;
}

const STRING = { type: "string" };
const RISK_ROW_FIELDS = [
  "hazard",
  "receptor",
  "level",
  "scenario",
  "horizon",
  "table",
] as const;
const RISK_ROW_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(RISK_ROW_FIELDS.map((k) => [k, STRING])),
  required: [...RISK_ROW_FIELDS],
  additionalProperties: false,
};

const A12A_SOURCES_ONLY =
  "Only data sources named in the text, tables or figures (datasets, surveys, images, models, institutions' data), not entries of the reference list or bibliography: our code extracts the reference list separately.";

const RISK_ROW_RULES = [
  `- ${RISK_ROWS_KEY}: one row per cell of each risk result table (the tables that give an assessed risk level per hazard and receptor, group or area): hazard, receptor, level (the level and any share or count the cell gives), scenario, horizon (empty when the table has none) and table (number and title).`,
  `- The quote of a row is the table's caption, copied exactly.`,
  `- A level shown only as a map colour is out of scope.`,
  `- Keep returning E1.1a items from the text as well; the rows add the table values.`,
];

export function groupJsonSchema(
  group: CrvaGroup,
  options: GroupOptions,
): Record<string, unknown> {
  const properties: Record<string, unknown> = Object.fromEntries(
    group.fieldIds.map((id) => {
      const sourcesOnly =
        id === "A1.2a" && options.referencePass ? ` ${A12A_SOURCES_ONLY}` : "";
      return [
        id,
        {
          type: "array",
          description: `${CRVA_FIELD_LABELS[id]}. Each item: ${CRVA_MIRCO_SHAPES[id]}${sourcesOnly}`,
          items: CRVA_ITEM_SCHEMAS[id],
        },
      ];
    }),
  );
  if (group.id === "E1") {
    properties[RISK_ROWS_KEY] = {
      type: "array",
      description:
        "Risk result table cells. Each item: {hazard, receptor, level, scenario, horizon, table}.",
      items: RISK_ROW_SCHEMA,
    };
  }
  const required = Object.keys(properties);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function groupUserPrompt(
  defaultUserPrompt: string,
  group: CrvaGroup,
  options: GroupOptions,
): string {
  const scope = [
    `- This job covers only these fields: ${group.fieldIds.join(", ")}. Other jobs cover the rest of the report's fields.`,
    ...(group.fieldIds.includes("A1.2a") && options.referencePass
      ? [`- A1.2a: ${A12A_SOURCES_ONLY}`]
      : []),
    ...(group.id === "E1" ? RISK_ROW_RULES : []),
  ];
  return (
    [
      defaultUserPrompt.trimEnd(),
      `<value_rules>\n${CRVA_VALUE_RULES.join("\n")}\n</value_rules>`,
      `<detail_rules>\n${CRVA_DETAIL_RULES.join("\n")}\n</detail_rules>`,
      `<granularity_rules>\n${CRVA_GRANULARITY_RULES.join("\n")}\n</granularity_rules>`,
      `<job_scope>\n${scope.join("\n")}\n</job_scope>`,
      `<field_guide>\n${fieldGuideMarkdown(group.fieldIds)}\n</field_guide>`,
    ].join("\n\n") + "\n"
  );
}
