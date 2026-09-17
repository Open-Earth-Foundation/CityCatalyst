import { parse } from "csv-parse/sync";
import { INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES } from "@/backend/inventory-import-file-limits";
import { BulkInventoryImportMatchError } from "@/util/enums";

const ALLOWED_EXTENSIONS = new Set(["xlsx", "csv"]);

const CRF_FORMAT_STEM = /^(.+)_CRFFormat_(\d{4})_(\d{8})$/i;
const INE_STEM = /^([A-Za-z]{2}\d{4,6})[-_](\d{4})$/;
const LOCODE_STEM = /^([A-Za-z]{2})[-_\s]?([A-Za-z]{3})[-_](\d{4})$/;

export type BulkInventoryImportMatchWarning = "year_mismatch";

export interface MatchableCity {
  cityId: string;
  name?: string | null;
  locode?: string | null;
}

export interface ManifestRow {
  filename: string;
  locode?: string | null;
  ineCode?: string | null;
  cityName?: string | null;
  year?: number | null;
}

export interface ParsedFilename {
  cityName?: string;
  locode?: string;
  ineCode?: string;
  year?: number;
  exportDate?: string;
}

export interface BulkInventoryImportMatchInput {
  originalFileName: string;
  fileSizeBytes?: number;
}

export interface BulkInventoryImportMatchResult {
  originalFileName: string;
  parsed: ParsedFilename;
  year: number | null;
  cityId: string | null;
  locode: string | null;
  error?: BulkInventoryImportMatchError;
  warnings: BulkInventoryImportMatchWarning[];
}

export interface MatchFilesOptions {
  cities: MatchableCity[];
  jobDefaultYear?: number | null;
  manifestCsv?: string | null;
  maxFileSizeBytes?: number;
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? filePath;
}

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

function stemOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(0, i) : filename;
}

/** NFKD + strip combining marks so Concón matches Concon. */
export function normalizeCityName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Uppercase and drop separators so "CL IQQ", "CL-IQQ", "CLIQQ" match. */
export function normalizeLocode(locode: string): string {
  return locode
    .toUpperCase()
    .replace(/[-_\s]+/g, "")
    .trim();
}

/**
 * Persist UN/LOCODE as "CC CCC". INE-style keys (digits) stay compact.
 */
export function formatStoredLocode(locode: string): string {
  const compact = normalizeLocode(locode);
  if (/^[A-Z]{2}[A-Z]{3}$/.test(compact)) {
    return `${compact.slice(0, 2)} ${compact.slice(2)}`;
  }
  return compact;
}

/** Values to try when looking up City.locode (space, compact, original). */
export function locodeLookupValues(locode: string): string[] {
  const formatted = formatStoredLocode(locode);
  const compact = normalizeLocode(locode);
  return [...new Set([formatted, compact, locode.trim()].filter(Boolean))];
}

export function normalizeFilenameKey(filename: string): string {
  return normalizeCityName(basename(filename));
}

export function parseFilename(originalFileName: string): ParsedFilename {
  const name = basename(originalFileName);
  const stem = stemOf(name);

  const crf = stem.match(CRF_FORMAT_STEM);
  if (crf) {
    return {
      cityName: crf[1].trim(),
      year: Number(crf[2]),
      exportDate: crf[3],
    };
  }

  const ine = stem.match(INE_STEM);
  if (ine) {
    return {
      ineCode: ine[1].toUpperCase(),
      locode: ine[1].toUpperCase(),
      year: Number(ine[2]),
    };
  }

  const locode = stem.match(LOCODE_STEM);
  if (locode) {
    const formatted = `${locode[1].toUpperCase()} ${locode[2].toUpperCase()}`;
    return {
      locode: formatted,
      year: Number(locode[3]),
    };
  }

  return {};
}

function parseYear(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1000 || n > 9999) return null;
  return n;
}

function cell(row: Record<string, unknown>, ...keys: string[]): string | null {
  const lookup = new Map(
    Object.keys(row).map((k) => [normalizeCityName(k), k]),
  );
  for (const key of keys) {
    const actual = lookup.get(normalizeCityName(key));
    if (!actual) continue;
    const value = row[actual];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

export function parseManifestCsv(csv: string): Map<string, ManifestRow> {
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  const byFilename = new Map<string, ManifestRow>();
  for (const row of rows) {
    const filename = cell(row, "filename", "file_name", "file");
    if (!filename) continue;
    const locode = cell(row, "locode");
    const ineCode = cell(row, "ine_code", "ineCode", "ine");
    const cityName = cell(row, "city_name", "cityName", "city");
    const year = parseYear(cell(row, "year"));
    byFilename.set(normalizeFilenameKey(filename), {
      filename: basename(filename),
      locode,
      ineCode,
      cityName,
      year,
    });
  }
  return byFilename;
}

function findCitiesByLocode(
  cities: MatchableCity[],
  locode: string,
): MatchableCity[] {
  const key = normalizeLocode(locode);
  return cities.filter(
    (city) => city.locode != null && normalizeLocode(city.locode) === key,
  );
}

function findCitiesByName(
  cities: MatchableCity[],
  name: string,
): MatchableCity[] {
  const key = normalizeCityName(name);
  return cities.filter(
    (city) => city.name != null && normalizeCityName(city.name) === key,
  );
}

function resolveCity(
  cities: MatchableCity[],
  parsed: ParsedFilename,
): { matches: MatchableCity[]; locode: string | null } {
  if (parsed.locode) {
    const matches = findCitiesByLocode(cities, parsed.locode);
    return { matches, locode: parsed.locode };
  }
  if (parsed.ineCode) {
    const matches = findCitiesByLocode(cities, parsed.ineCode);
    return { matches, locode: parsed.ineCode };
  }
  if (parsed.cityName) {
    const matches = findCitiesByName(cities, parsed.cityName);
    const locode = matches.length === 1 ? (matches[0].locode ?? null) : null;
    return { matches, locode };
  }
  return { matches: [], locode: null };
}

/**
 * Match one zip entry to an existing city in the target project.
 * Manifest values win over the filename. Year: manifest → filename → job default.
 * File-inferred year is kept (do not force the job year); warn if they differ.
 */
export function matchFile(
  input: BulkInventoryImportMatchInput,
  options: MatchFilesOptions,
): BulkInventoryImportMatchResult {
  const originalFileName = basename(input.originalFileName);
  const parsedFromName = parseFilename(originalFileName);
  const warnings: BulkInventoryImportMatchWarning[] = [];
  const maxBytes =
    options.maxFileSizeBytes ?? INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES;

  const ext = extensionOf(originalFileName);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      originalFileName,
      parsed: parsedFromName,
      year: null,
      cityId: null,
      locode: null,
      error: BulkInventoryImportMatchError.UNSUPPORTED_EXTENSION,
      warnings,
    };
  }

  if (input.fileSizeBytes != null && input.fileSizeBytes > maxBytes) {
    return {
      originalFileName,
      parsed: parsedFromName,
      year: null,
      cityId: null,
      locode: null,
      error: BulkInventoryImportMatchError.FILE_TOO_LARGE,
      warnings,
    };
  }

  const manifest = options.manifestCsv
    ? parseManifestCsv(options.manifestCsv).get(
        normalizeFilenameKey(originalFileName),
      )
    : undefined;

  const parsed: ParsedFilename = {
    ...parsedFromName,
    ...(manifest?.cityName ? { cityName: manifest.cityName } : {}),
    ...(manifest?.locode ? { locode: manifest.locode } : {}),
    ...(manifest?.ineCode
      ? {
          ineCode: manifest.ineCode,
          locode: manifest.locode ?? manifest.ineCode,
        }
      : {}),
    ...(manifest?.year != null ? { year: manifest.year } : {}),
  };
  // Manifest locode/INE wins over a name parsed from the filename.
  if (manifest?.locode || manifest?.ineCode) {
    parsed.cityName = manifest.cityName ?? parsed.cityName;
  }

  const fileInferredYear = manifest?.year ?? parsedFromName.year ?? null;
  const year = fileInferredYear ?? options.jobDefaultYear ?? null;

  if (
    fileInferredYear != null &&
    options.jobDefaultYear != null &&
    fileInferredYear !== options.jobDefaultYear
  ) {
    warnings.push("year_mismatch");
  }

  if (year == null) {
    return {
      originalFileName,
      parsed,
      year: null,
      cityId: null,
      locode: parsed.locode ?? parsed.ineCode ?? null,
      error: BulkInventoryImportMatchError.MISSING_YEAR,
      warnings,
    };
  }

  const { matches, locode } = resolveCity(options.cities, parsed);
  if (matches.length === 0) {
    return {
      originalFileName,
      parsed,
      year,
      cityId: null,
      locode: locode,
      error: BulkInventoryImportMatchError.UNMATCHED_CITY,
      warnings,
    };
  }
  if (matches.length > 1) {
    return {
      originalFileName,
      parsed,
      year,
      cityId: null,
      locode: locode,
      error: BulkInventoryImportMatchError.AMBIGUOUS_CITY,
      warnings,
    };
  }

  return {
    originalFileName,
    parsed,
    year,
    cityId: matches[0].cityId,
    locode: matches[0].locode ?? locode,
    warnings,
  };
}

export function matchFiles(
  files: BulkInventoryImportMatchInput[],
  options: MatchFilesOptions,
): BulkInventoryImportMatchResult[] {
  return files.map((file) => matchFile(file, options));
}

/**
 * Same city+year can appear twice with different CRFFormat export dates.
 * Keep the latest yyyymmdd; files without an export date are left as-is.
 */
export function pickLatestExports(
  results: BulkInventoryImportMatchResult[],
): BulkInventoryImportMatchResult[] {
  const bestByKey = new Map<string, BulkInventoryImportMatchResult>();
  const passthrough: BulkInventoryImportMatchResult[] = [];

  for (const result of results) {
    const cityKey =
      result.cityId ??
      (result.parsed.locode
        ? `locode:${normalizeLocode(result.parsed.locode)}`
        : result.parsed.cityName
          ? `name:${normalizeCityName(result.parsed.cityName)}`
          : null);
    if (!cityKey || result.year == null || !result.parsed.exportDate) {
      passthrough.push(result);
      continue;
    }
    const key = `${cityKey}|${result.year}`;
    const existing = bestByKey.get(key);
    if (
      !existing ||
      result.parsed.exportDate > (existing.parsed.exportDate ?? "")
    ) {
      bestByKey.set(key, result);
    }
  }

  return [...passthrough, ...bestByKey.values()];
}

export class BulkInventoryImportMatcher {
  static parseFilename = parseFilename;
  static parseManifestCsv = parseManifestCsv;
  static matchFile = matchFile;
  static matchFiles = matchFiles;
  static pickLatestExports = pickLatestExports;
  static normalizeCityName = normalizeCityName;
  static normalizeLocode = normalizeLocode;
  static formatStoredLocode = formatStoredLocode;
  static locodeLookupValues = locodeLookupValues;
}
