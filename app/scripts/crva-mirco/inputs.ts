/**
 * Builds the CRVA JSON Schema and user prompt for Mirco's pdf-extraction pipeline
 * from the adapter v0 constants (A1.2a also asks for the title), plus detail and
 * granularity rules and a field guide with Buenos Aires examples.
 *
 *   npx tsx scripts/crva-mirco/inputs.ts --mirco-dir <path to pdf-extraction>
 *
 * Output: app/reports/crva-eval/mirco-inputs/crva-v0.schema.json and crva-user-prompt.md.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CRVA_CAPACITY_CATEGORIES,
  CRVA_FIELD_IDS,
  CRVA_FIELD_LABELS,
  type CrvaFieldId,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import {
  CRVA_VALUE_RULES,
  CRVA_VALUE_SHAPES,
} from "@/backend/ingest/plugins/ccra/extract-crva-fields";
import { APP_DIR } from "../crva-eval/run-adapter";

const STRING = { type: "string" };
const STRING_LIST = { type: "array", items: STRING };

function objectOf(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const NAMED_ITEM = objectOf({ name: STRING, description: STRING });
const CAPACITY_FACTOR = objectOf({
  category: { type: "string", enum: [...CRVA_CAPACITY_CATEGORIES] },
  factor: STRING,
  description: STRING,
});

/**
 * Value shapes this pipeline asks for: the v0 shapes, except A1.2a, which also asks
 * for the title (the gold keeps it; v0's `name` lost it). convert.ts maps A1.2a back.
 */
export const CRVA_MIRCO_SHAPES: Record<CrvaFieldId, string> = {
  ...CRVA_VALUE_SHAPES,
  "A1.2a": `{"author": string, "title": string, "year": integer or null, "used_for": string or null}. One item per entry of the reference list or data sources.`,
};

/** JSON Schema of one value per field, mirroring CRVA_MIRCO_SHAPES (pinned by test). */
export const CRVA_ITEM_SCHEMAS: Record<CrvaFieldId, object> = {
  "A1.1": STRING,
  "A1.2a": objectOf({
    author: STRING,
    title: STRING,
    year: { type: ["integer", "null"] },
    used_for: { type: ["string", "null"] },
  }),
  "A2.1a": STRING,
  "A2.1b": NAMED_ITEM,
  "A2.4a": NAMED_ITEM,
  "A2.5a": NAMED_ITEM,
  "B1.2a": NAMED_ITEM,
  "C1.1a": objectOf({ hazard: STRING, group: STRING, description: STRING }),
  "C1.2a": objectOf({ hazard: STRING, sector: STRING, description: STRING }),
  "D1.1a": CAPACITY_FACTOR,
  "D1.2a": CAPACITY_FACTOR,
  "E1.1a": objectOf({
    title: STRING,
    description: STRING,
    hazards: STRING_LIST,
    affected: STRING_LIST,
  }),
};

export function crvaJsonSchema(): Record<string, unknown> {
  const ids = CRVA_FIELD_IDS as CrvaFieldId[];
  const properties = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        type: "array",
        description: `${CRVA_FIELD_LABELS[id]}. Each item: ${CRVA_MIRCO_SHAPES[id]}`,
        items: CRVA_ITEM_SCHEMAS[id],
      },
    ]),
  );
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties,
    required: ids,
    additionalProperties: false,
  };
}

/** Round 2 lost most Partial rows to values cut down to a name. */
export const CRVA_DETAIL_RULES: string[] = [
  `- A value keeps every number, date, period, threshold, percentage, cause and figure or table reference that its quote supports.`,
  `- Never shorten a value to a name only. Write the name, then what the report says about it.`,
  `- Citing a figure or table by its number and title ("Figura 6. Encuadre geográfico") is required where the report points to one; describing what the figure shows is not.`,
  `- Copy risk levels, scores and categories the report assigns. Do not assign your own.`,
  `- Return every item of the report's real lists: references, receptors, vulnerable groups, hazards, capacity factors and limits. For long lists, such as the reference list, keep going until the last entry.`,
  // Wave 1: quotes that joined a table's name cell and description cell failed the quote check.
  `- In a table, the quote is the text of one cell. Put the row's name in the value, not in the quote.`,
];

/**
 * Round 2 merged items that the gold keeps apart; wave 1 then over-split them
 * (one item per scenario, caption-only rows, a system split into its units).
 */
export const CRVA_GRANULARITY_RULES: string[] = [
  `- An item is one hazard × group, hazard × sector or hazard × area combination. Do not merge different combinations into one item.`,
  `- Scenarios, time horizons and the levels per scenario go inside that item's text, never as separate items.`,
  `- Keep the grouping the report uses: hazards, groups or sectors the report treats as one (one heading, one section, one table row) are one item.`,
  `- An item is the unit the report presents. A system, plan or programme described through its components is one item, with the components listed in its text.`,
  `- A table row, caption or heading with no content of its own is not an item. A table summarised by the report is one fact, citing the table.`,
  `- One item per reference, receptor, capacity factor or limit. Do not merge list entries.`,
];

export interface CrvaFieldGuide {
  definition: string;
  notThis: string;
  /** One item in this pipeline's shape, from the Buenos Aires gold (Seattle is the hold-out). */
  example: unknown;
}

/** What belongs in each field, what does not, and one example; round 2 confused C1/D1/E1. */
export const CRVA_FIELD_GUIDE: Record<CrvaFieldId, CrvaFieldGuide> = {
  "A1.1": {
    definition:
      "The area the assessment covers, as the report defines it, with the section that defines it and the number and title of the boundary or location map.",
    notThis:
      "A general description of the city's neighbours or geography (that is A2.1a or A2.1b).",
    example:
      "Límites administrativos de la Ciudad Autónoma de Buenos Aires, definidos en el epígrafe 3.1; mapa: Figura 6 (Encuadre geográfico)",
  },
  "A1.2a": {
    definition:
      "Each entry of the report's reference list, bibliography or data sources: author or institution, full title and year (null when the entry has no date).",
    notThis:
      "The report itself, or a source named only in passing without a reference entry.",
    example: {
      author: "Balay, M.",
      title: "El Río de la Plata entre la atmósfera y el mar",
      year: 1961,
      used_for: null,
    },
  },
  "A2.1a": {
    definition:
      "The city's location and context: status (capital), region, boundaries, administrative divisions, and the number and title of the location map.",
    notThis:
      "Physical features such as rivers or relief (A2.1b), or the assessment boundary (A1.1).",
    example:
      "Capital de la República Argentina; región centro-este del país, sobre la orilla occidental del Río de la Plata; limita al norte, sur y oeste con la provincia de Buenos Aires y al este con el Río de la Plata; 15 comunas y 48 barrios. Mapa: Figura 6",
  },
  "A2.1b": {
    definition:
      "Physical geography features (rivers, coast, relief, soils) with the figures the report gives and their effect on risk.",
    notThis: "Administrative location (A2.1a) or the hazard itself (B1.2a).",
    example: {
      name: "Río de la Plata",
      description:
        "Límite este de la ciudad; las sudestadas elevan su nivel y producen inundaciones costeras; su nivel medio subió 17 cm en el último siglo",
    },
  },
  "A2.4a": {
    definition:
      "Each sensitive receptor or sector the assessment analyses, with how the report describes or measures it.",
    notThis:
      "Vulnerable population groups (A2.5a) or impacts on the sector (C1.2a).",
    example: {
      name: "Población",
      description:
        "Personas que habitan en CABA, analizado a través de indicadores sobre su densidad y rango de edad",
    },
  },
  "A2.5a": {
    definition:
      "Each vulnerable group of people, with why the report says it is vulnerable and the numbers it gives (share, people, rate).",
    notThis:
      "A sector or receptor (A2.4a), or an observed impact on the group (C1.1a).",
    example: {
      name: "Población con IVSD alto y muy alto",
      description:
        "10% de la población (más de 270.000 personas) en situación de vulnerabilidad alta o muy alta ante desastres (IVSD); Tabla 8: Muy Alta 54.723 habitantes (2%), Alta 218.990 (8%)",
    },
  },
  "B1.2a": {
    definition:
      "Each hazard the report describes, including secondary hazards it mentions but does not assess in depth, with its definition, thresholds, season or period, and causes as the report states them.",
    notThis: "Impacts of the hazard (C1) or its assessed risk level (E1.1a).",
    example: {
      name: "Olas de calor e isla de calor urbana",
      description:
        "Ola de calor estival (octubre-marzo): mínimas por encima de 22 °C y máximas por encima de 32.3 °C durante al menos 3 días (definición del SMN); isla de calor analizada con imágenes satelitales",
    },
  },
  "C1.1a": {
    definition:
      "An observed (past) impact of a hazard on a vulnerable group of people (age, gender, income, health), with the event, date and figures.",
    notThis:
      "An impact on a sector, service or the population as a whole (C1.2a), or a projected risk (E1.1a).",
    example: {
      hazard: "Olas de calor",
      group: "Adultos mayores y mujeres",
      description:
        "Ola de calor de 2013-2014: mayor mortalidad, creciente con la edad y superior en mujeres (Chesini et al., 2019)",
    },
  },
  "C1.2a": {
    definition:
      "An observed (past) impact of a hazard on a sector or receptor (population as a whole, energy, transport, housing, economy), with the event, date and figures.",
    notThis:
      "An impact on a specific vulnerable group (C1.1a), or a projected risk level (E1.1a).",
    example: {
      hazard: "Olas de calor",
      sector: "Energía eléctrica y telecomunicaciones",
      description:
        "Ola de calor de 2013-2014: cortes en el suministro de energía por demanda excesiva",
    },
  },
  "D1.1a": {
    definition:
      "Existing adaptive capacity, as the report's adaptive capacity analysis presents it: institutions, plans, systems, works or resources that help the city respond to hazards.",
    notThis:
      "A weakness or gap (D1.2a), a future measure the report only recommends, or a baseline description of services or infrastructure that the report does not present as adaptive capacity.",
    example: {
      category: "governmental",
      factor: "Centro Único de Coordinación y Control (CUCC)",
      description:
        "Centro de coordinación multiagencial de emergencias, referente en América Latina",
    },
  },
  "D1.2a": {
    definition:
      "Limits to adaptive capacity, as the report's adaptive capacity analysis presents them: what reduces the city's or a group's ability to cope or adapt (social gaps, strained infrastructure, missing data or resources).",
    notThis:
      "Causes of the hazard (rain, wind, sea level, temperature), the hazard's impacts, or a baseline description of the city that the report does not present as a limit to adaptive capacity.",
    example: {
      category: "socio_economic",
      factor: "Brecha social",
      description:
        "Las poblaciones más vulnerables (menores rentas, peor calidad constructiva) viven en las áreas más susceptibles, en villas y barrios carenciados",
    },
  },
  "E1.1a": {
    definition:
      "The assessed risk level per hazard × receptor, group or area, from the risk results (tables, maps, text): the level, scenario, time horizon and share of area or elements as the report gives them.",
    notThis:
      "Impact sentences, past events or vulnerability descriptions without an assessed risk level.",
    example: {
      title: "Olas de calor × Población",
      description:
        "Riesgo creciente con el horizonte: corto plazo entre Muy Bajo y Moderado; medio plazo RCP 4.5 entre Bajo y Alto, RCP 8.5 entre Alto y Muy Alto; con RCP 8.5 2041-2060 Alto 47% y Muy Alto 44% de la superficie",
      hazards: ["Olas de calor"],
      affected: ["Población"],
    },
  },
};

function fieldGuideMarkdown(): string {
  return (CRVA_FIELD_IDS as CrvaFieldId[])
    .map((id) => {
      const guide = CRVA_FIELD_GUIDE[id];
      return [
        `### ${id} (${CRVA_FIELD_LABELS[id]})`,
        `Belongs: ${guide.definition}`,
        `Does not belong: ${guide.notThis}`,
        `Example item (from another report): ${JSON.stringify(guide.example)}`,
      ].join("\n");
    })
    .join("\n\n");
}

/**
 * Mirco's default user prompt plus the v0 value rules (so the v0 quote check is
 * fair), the detail and granularity rules, and the field guide.
 */
export function crvaUserPrompt(defaultUserPrompt: string): string {
  return (
    [
      defaultUserPrompt.trimEnd(),
      `<value_rules>\n${CRVA_VALUE_RULES.join("\n")}\n</value_rules>`,
      `<detail_rules>\n${CRVA_DETAIL_RULES.join("\n")}\n</detail_rules>`,
      `<granularity_rules>\n${CRVA_GRANULARITY_RULES.join("\n")}\n</granularity_rules>`,
      `<field_guide>\n${fieldGuideMarkdown()}\n</field_guide>`,
    ].join("\n\n") + "\n"
  );
}

async function main() {
  const i = process.argv.indexOf("--mirco-dir");
  const mircoDir = i >= 0 ? process.argv[i + 1] : undefined;
  if (!mircoDir) throw new Error("Missing --mirco-dir");
  const defaultUserPrompt = await readFile(
    path.join(mircoDir, "extractor", "prompts", "user.md"),
    "utf8",
  );
  const outDir = path.join(APP_DIR, "reports", "crva-eval", "mirco-inputs");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "crva-v0.schema.json"),
    JSON.stringify(crvaJsonSchema(), null, 2),
  );
  await writeFile(
    path.join(outDir, "crva-user-prompt.md"),
    crvaUserPrompt(defaultUserPrompt),
  );
  console.log(`Wrote ${outDir}`);
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exitCode = 1;
  });
}
