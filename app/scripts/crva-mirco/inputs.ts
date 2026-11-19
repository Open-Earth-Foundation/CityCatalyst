/**
 * Builds the CRVA JSON Schema and user prompt for Mirco's pdf-extraction pipeline
 * from the adapter v0 constants, so both extractors get the same field definitions.
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

/** JSON Schema of one value per field, mirroring CRVA_VALUE_SHAPES (pinned by test). */
export const CRVA_ITEM_SCHEMAS: Record<CrvaFieldId, object> = {
  "A1.1": STRING,
  "A1.2a": objectOf({ name: STRING, year: { type: ["integer", "null"] } }),
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

/** The v0 A1.2a shape asks for the report itself; this run leaves that out. */
const REPORT_ITSELF = /\s*Include the report itself\./;

export function crvaJsonSchema(): Record<string, unknown> {
  const ids = CRVA_FIELD_IDS as CrvaFieldId[];
  const properties = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        type: "array",
        description: `${CRVA_FIELD_LABELS[id]}. Each item: ${CRVA_VALUE_SHAPES[id].replace(REPORT_ITSELF, "")}`,
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

/** Mirco's default user prompt plus the v0 value rules, so the v0 quote check is fair. */
export function crvaUserPrompt(defaultUserPrompt: string): string {
  return `${defaultUserPrompt.trimEnd()}\n\n<value_rules>\n${CRVA_VALUE_RULES.join("\n")}\n</value_rules>\n`;
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
