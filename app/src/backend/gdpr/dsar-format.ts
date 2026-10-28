import createHttpError from "http-errors";
import { PRIVACY_POLICY_VERSION, REDACTED } from "@/util/gdpr/constants";
import type { PersonalDataDataset } from "@/util/gdpr/personal-data-inventory";

const FIELD_ALIASES: Record<string, string[]> = {
  lastUpdated: ["last_updated", "updatedAt"],
  created: ["createdAt"],
};

export interface DsarExportDocument {
  exportedAt: string;
  privacyPolicyVersion: string;
  subject: { userId: string };
  inventory: PersonalDataDataset[];
  truncation: Record<string, true>;
  data: Record<string, Record<string, unknown>[]>;
}

export interface DsarDatasetRows {
  dataset: PersonalDataDataset;
  rows: Record<string, unknown>[];
  truncated: boolean;
}

export interface DsarExportResult {
  document: DsarExportDocument;
  csv: string;
}

export function parseDsarFormat(value: string | undefined): "json" | "csv" {
  if (value == null || value === "" || value === "json") return "json";
  if (value === "csv") return "csv";
  throw new createHttpError.BadRequest("format must be json or csv");
}

export function readField(
  row: Record<string, unknown>,
  field: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  for (const alias of FIELD_ALIASES[field] ?? []) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  return null;
}

export function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return "[omitted]";
  }
  return value;
}

function isPresent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string" && value.length === 0) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/** Copy inventoried fields and replace secrets with a present/absent marker. */
export function shapeDataset(
  dataset: PersonalDataDataset,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const shaped: Record<string, unknown> = {};
    for (const field of dataset.fields) {
      shaped[field] = normalizeValue(readField(row, field));
    }
    for (const field of dataset.redactedFields ?? []) {
      shaped[field] = isPresent(readField(row, field)) ? REDACTED : null;
    }
    return shaped;
  });
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text =
    typeof value === "string" ? value : JSON.stringify(normalizeValue(value));
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toDsarCsv(
  datasets: Array<{
    dataset: PersonalDataDataset;
    rows: Record<string, unknown>[];
  }>,
): string {
  const lines = ["dataset,record_id,field,value"];
  for (const { dataset, rows } of datasets) {
    for (const row of rows) {
      const recordId = dataset.idFields
        .map((field) => String(row[field] ?? ""))
        .join(":");
      for (const [field, value] of Object.entries(row)) {
        lines.push(
          [dataset.table, recordId, field, csvEscape(value)].join(","),
        );
      }
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function buildDsarExport(input: {
  userId: string;
  exportedAt: Date;
  datasets: DsarDatasetRows[];
}): DsarExportResult {
  const data: Record<string, Record<string, unknown>[]> = {};
  const truncation: Record<string, true> = {};
  const shapedSets: Array<{
    dataset: PersonalDataDataset;
    rows: Record<string, unknown>[];
  }> = [];

  for (const entry of input.datasets) {
    const rows = shapeDataset(entry.dataset, entry.rows);
    data[entry.dataset.table] = rows;
    shapedSets.push({ dataset: entry.dataset, rows });
    if (entry.truncated) truncation[entry.dataset.table] = true;
  }

  const document: DsarExportDocument = {
    exportedAt: input.exportedAt.toISOString(),
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    subject: { userId: input.userId },
    inventory: input.datasets.map((entry) => entry.dataset),
    truncation,
    data,
  };

  return { document, csv: toDsarCsv(shapedSets) };
}
