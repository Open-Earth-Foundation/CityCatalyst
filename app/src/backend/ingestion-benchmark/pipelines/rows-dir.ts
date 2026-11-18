/**
 * Reads a folder of precomputed extraction envelopes (manifest.json plus one
 * result file per case/attempt) and verifies each file against its sha256.
 *
 * Envelopes also carry answer-key material (`benchmark`) and repair output.
 * Only a fixed allow-list of fields is ever picked from the parsed envelope,
 * and error messages name the case, attempt, file and code but never values.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PipelineInfo } from "@/backend/ingestion-benchmark/report";

export type EnvelopeRow = {
  source_label: string;
  gpc_ref: string | null;
  scope: 1 | 2 | 3 | null;
  emissions_tco2e: number | null;
  notation_key: string | null;
  row_role: string;
  total_inclusion: string;
  scope_basis: string;
};

export type EnvelopeData = {
  reporting_year: number | null;
  reported_total_tco2e: number | null;
  total_basis: string | null;
  reported_gross_total_tco2e: number | null;
  reported_net_total_tco2e: number | null;
  reported_removals_tco2e: number | null;
  total_kind: string | null;
  reconciliation_tolerance_tco2e: number | null;
  rows: EnvelopeRow[];
};

export type ReadEnvelope = {
  data: EnvelopeData;
  usage: Record<string, number>;
  executionStatus: string;
  info: PipelineInfo;
  costUsd: number | null;
};

export type RowsDirErrorCode =
  | "missing_entry"
  | "duplicate_entry"
  | "missing_file"
  | "hash_mismatch"
  | "invalid_envelope";

export class RowsDirError extends Error {
  constructor(
    readonly code: RowsDirErrorCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "RowsDirError";
  }
}

export type RowsDir = {
  /** Study and stage from manifest.json, known even when no envelope can be read. */
  info: { study: string | null; stage: string | null };
  get(caseId: string, attempt: number): ReadEnvelope;
};

type ManifestEntry = {
  case_id: string;
  attempt: number;
  file: string;
  sha256: string;
};

const DEFAULT_SCHEMA_PATH = path.join(
  process.cwd(),
  "benchmarks/pdf/schemas/ghgi-envelope.schema.json",
);

type Enums = {
  scope: unknown[];
  row_role: string[];
  total_inclusion: string[];
  scope_basis: string[];
  gpc_ref: unknown[];
  total_kind: string[];
};

/** Enums come from the copied schema at runtime so they cannot drift. */
function loadEnums(schemaPath: string): Enums {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const rowProps = schema.properties.rows.items.properties;
  return {
    scope: rowProps.scope.enum,
    row_role: rowProps.row_role.enum,
    total_inclusion: rowProps.total_inclusion.enum,
    scope_basis: rowProps.scope_basis.enum,
    gpc_ref: rowProps.gpc_ref.enum,
    total_kind: schema.properties.total_kind.enum,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);
const isStrOrNull = (v: unknown) => v === null || typeof v === "string";

/** Returns the name of the first invalid field, or null when valid. */
function firstInvalidField(data: unknown, e: Enums): string | null {
  if (!isObj(data)) return "data";
  const d = data;
  if (!(d.reporting_year === null || Number.isInteger(d.reporting_year)))
    return "reporting_year";
  for (const k of [
    "reported_total_tco2e",
    "reported_gross_total_tco2e",
    "reported_removals_tco2e",
    "reported_net_total_tco2e",
  ])
    if (!isNumOrNull(d[k])) return k;
  const tol = d.reconciliation_tolerance_tco2e;
  if (!(tol === null || (isNum(tol) && (tol as number) >= 0)))
    return "reconciliation_tolerance_tco2e";
  if (!isStrOrNull(d.total_basis)) return "total_basis";
  if (typeof d.total_kind !== "string" || !e.total_kind.includes(d.total_kind))
    return "total_kind";
  if (!Array.isArray(d.rows)) return "rows";
  for (let i = 0; i < d.rows.length; i++) {
    const r = d.rows[i];
    if (!isObj(r)) return `rows[${i}]`;
    if (typeof r.source_label !== "string" || r.source_label.length === 0)
      return `rows[${i}].source_label`;
    if (!e.gpc_ref.includes(r.gpc_ref)) return `rows[${i}].gpc_ref`;
    if (!e.scope.includes(r.scope)) return `rows[${i}].scope`;
    if (!isNumOrNull(r.emissions_tco2e)) return `rows[${i}].emissions_tco2e`;
    if (!isStrOrNull(r.notation_key)) return `rows[${i}].notation_key`;
    for (const k of ["row_role", "total_inclusion", "scope_basis"] as const)
      if (typeof r[k] !== "string" || !e[k].includes(r[k] as string))
        return `rows[${i}].${k}`;
  }
  return null;
}

const DATA_KEYS = [
  "reporting_year",
  "reported_total_tco2e",
  "total_basis",
  "reported_gross_total_tco2e",
  "reported_net_total_tco2e",
  "reported_removals_tco2e",
  "total_kind",
  "reconciliation_tolerance_tco2e",
] as const;
const ROW_KEYS = [
  "source_label",
  "gpc_ref",
  "scope",
  "emissions_tco2e",
  "notation_key",
  "row_role",
  "total_inclusion",
  "scope_basis",
] as const;

/** Copies only the known keys so unknown ones never flow on. */
function pickKnown(
  src: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, src[k]]));
}

/** Numeric usage counts, plus numeric children of nested objects as parent.child. */
function flattenUsage(usage: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(usage)) return out;
  for (const [k, v] of Object.entries(usage)) {
    if (isNum(v)) out[k] = v as number;
    else if (isObj(v))
      for (const [ck, cv] of Object.entries(v))
        if (isNum(cv)) out[`${k}.${ck}`] = cv as number;
  }
  return out;
}

const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);

export function readRowsDir(
  dir: string,
  options: { schemaPath?: string } = {},
): RowsDir {
  const e = loadEnums(options.schemaPath ?? DEFAULT_SCHEMA_PATH);
  // A fixed message: manifest text must never be echoed.
  const invalidManifest = () => new Error(`invalid manifest.json in ${dir}`);
  let manifest: Record<string, unknown>;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
    );
    if (!isObj(parsed) || !Array.isArray(parsed.entries))
      throw invalidManifest();
    manifest = parsed;
  } catch {
    throw invalidManifest();
  }
  const entries = manifest.entries as ManifestEntry[];
  const study = strOrNull(manifest.study);
  const stage = strOrNull(manifest.stage);

  return {
    info: { study, stage },
    get(caseId, attempt) {
      const where = `case ${caseId} attempt ${attempt}`;
      const matches = entries.filter(
        (m) => m?.case_id === caseId && m?.attempt === attempt,
      );
      if (matches.length === 0) throw new RowsDirError("missing_entry", where);
      if (matches.length > 1) throw new RowsDirError("duplicate_entry", where);
      const entry = matches[0];
      const file = path.resolve(dir, entry.file);
      const rel = path.relative(path.resolve(dir), file);
      const inside =
        rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
      if (!inside || !fs.existsSync(file))
        throw new RowsDirError("missing_file", `${where}, file ${entry.file}`);
      const bytes = fs.readFileSync(file);
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== entry.sha256)
        throw new RowsDirError("hash_mismatch", `${where}, file ${entry.file}`);

      let parsed: unknown;
      try {
        parsed = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new RowsDirError(
          "invalid_envelope",
          `${where}, file ${entry.file}, not valid JSON`,
        );
      }
      if (!isObj(parsed))
        throw new RowsDirError("invalid_envelope", `${where}, not an object`);

      // Pick only the allow-listed fields; the rest is never touched again.
      const data = isObj(parsed.result) ? parsed.result.data : undefined;
      const bad = firstInvalidField(data, e);
      if (bad)
        throw new RowsDirError(
          "invalid_envelope",
          `${where}, file ${entry.file}, invalid field ${bad}`,
        );
      if (typeof parsed.execution_status !== "string")
        throw new RowsDirError(
          "invalid_envelope",
          `${where}, file ${entry.file}, invalid field execution_status`,
        );
      const raw = data as Record<string, unknown>;
      const picked = pickKnown(raw, DATA_KEYS);
      picked.rows = (raw.rows as Record<string, unknown>[]).map((r) =>
        pickKnown(r, ROW_KEYS),
      );

      return {
        data: picked as EnvelopeData,
        usage: flattenUsage(parsed.usage),
        executionStatus: parsed.execution_status,
        costUsd: isNum(parsed.cost_usd) ? (parsed.cost_usd as number) : null,
        info: {
          id: "precomputed",
          study,
          stage,
          mode: strOrNull(parsed.mode),
          version: strOrNull(parsed.version),
        },
      };
    },
  };
}
