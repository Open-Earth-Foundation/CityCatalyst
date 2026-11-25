/**
 * CC-950 / CC-1217 / CC-1330: run Path A files (exact eCRF, near-eCRF, CIRIS
 * with eCRF_3) through GhgiIngestPlugin, score stored InventoryValues against
 * the answer key or source file, then generate CityCatalyst's eCRF export and
 * score that workbook against the ingested (stored) GPC values.
 *
 *   npx tsx scripts/ghgi-path-a-backtest.ts --files ./ingestion-script-files
 */
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import env from "@next/env";
import Excel from "exceljs";
import { db } from "@/models";
import { Roles } from "@/util/types";
import { DEFAULT_PROJECT_ID } from "@/util/constants";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { createIngestRuntime } from "@/backend/ingest/http";
import { ingestGhgiBuffer } from "@/backend/ingest/ghgi-run";
import { getEmissionResults } from "@/backend/ResultsService";
import ECRFDownloadService from "@/backend/ECRFDownloadService";
import type { InventoryWithInventoryValuesAndActivityValues } from "@/util/types";
import InventoryReplaceService from "@/backend/InventoryReplaceService";
import FileValidatorService from "@/backend/FileValidatorService";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import {
  importRowSkipReason,
  resolveImportedTotalCO2e,
} from "@/backend/InventoryImportService";
import {
  buildBulkInventoryImportResult,
  classifyBulkInventoryFile,
  fileTypeOf,
} from "@/backend/InventoryFileAutoImportService";
import { hasSignedNumericValue } from "@/util/parse-numeric-cell";
import { toCanonical } from "@/util/notation-keys";
import { isOmittedGPCReference } from "@/util/GHGI/reported-totals";

const DEFAULT_FILES = "./ingestion-script-files";
const VALUE_TOLERANCE = 0.001;
const RECALL_BAR = 0.99;
const PRECISION_BAR = 0.99;
const CLASS_BAR = 0.98;

type Family = "exact-ecrf" | "near-ecrf" | "ciris";

interface AnswerKeyRow {
  city: string;
  file: string;
  year: number;
  rowsEcrf3: number | null;
  rowsWithValue: number | null;
  notationKeys: string;
  fileTotalT: number | null;
  totalExclEnergyT: number | null;
  sectors: Record<string, number | null>;
  fromWorkbook: boolean;
}

interface CaseResult {
  city: string;
  file: string;
  family: Family;
  year: number;
  pathTaken: string;
  ingestStatus: string;
  error?: string;
  expectedValueRows: number | null;
  storedValueRows: number;
  storedNotationRows: number;
  matchedRows: number;
  rowRecall: number | null;
  rowPrecision: number | null;
  valueAccuracy: number | null;
  classification: number | null;
  storedTotalT: number;
  expectedTotalExclEnergyT: number | null;
  expectedFileTotalT: number | null;
  totalsMatchExclEnergy: boolean | null;
  totalsMatchFile: boolean | null;
  exportRecall: number | null;
  exportPrecision: number | null;
  exportValueAccuracy: number | null;
  exportTotalT: number | null;
  exportPass: boolean;
  flags: string[];
  pass: boolean;
}

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && value !== null && "text" in value) {
    return String((value as { text: string }).text);
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    return cellText((value as { result: unknown }).result);
  }
  return String(value).trim();
}

function cellNum(value: unknown): number | null {
  const text = cellText(value).replace(/,/g, "");
  if (!text || text === "-" || text.toLowerCase() === "null") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(1\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function withinTol(actual: number, expected: number): boolean {
  if (expected === 0) return Math.abs(actual) < 1e-6;
  return Math.abs(actual - expected) / Math.abs(expected) <= VALUE_TOLERANCE;
}

function familyOf(fileName: string): Family {
  if (/ciris/i.test(fileName)) return "ciris";
  return /^ecrf-inventory/i.test(fileName) ? "exact-ecrf" : "near-ecrf";
}

function isInventoryXlsx(file: string): boolean {
  const s = slug(file);
  if (s.startsWith("answer_keys") || file.startsWith("~$")) return false;
  return s.endsWith("xlsx") || s.endsWith("xlsm");
}

/** e.g. Banana_CRFFormat_2022_20261106.xlsx → { city, year } */
function parseCrfFormatName(
  file: string,
): { city: string; year: number } | null {
  const match = file.match(/^(.*)_CRFFormat_(\d{4})_/i);
  if (!match) return null;
  return { city: match[1].trim(), year: Number(match[2]) };
}

function splitCamelCity(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

/**
 * CIRIS filenames, e.g. A3-04_Boston_2023_CIRIS_slim.xlsx,
 * CIRIS_BuenosAires_GEI_2020_CDP.xlsx, Boston, USA 2023 Final CIRIS (2025).xlsm.
 */
function parseCirisName(
  file: string,
): { city: string; year: number } | null {
  if (!/ciris/i.test(file)) return null;
  const a3 = file.match(/^A\d+-\d+_([^_]+)_(\d{4})_CIRIS/i);
  if (a3) return { city: splitCamelCity(a3[1]), year: Number(a3[2]) };
  const prefixed = file.match(/^CIRIS_([^_]+).*?(\d{4})/i);
  if (prefixed) {
    return { city: splitCamelCity(prefixed[1]), year: Number(prefixed[2]) };
  }
  const yearMatch = file.match(/\b((?:19|20)\d{2})\b/);
  if (!yearMatch) return null;
  const city = file
    .replace(/\.(xlsx|xlsm)$/i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/,?\s*(USA|US)\b/gi, "")
    .replace(/\bFinal\s+CIRIS\b.*$/i, "")
    .replace(/\bCIRIS\b/gi, "")
    .replace(/\b((?:19|20)\d{2})\b/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!city) return null;
  return { city, year: Number(yearMatch[1]) };
}

function keyFromSource(
  city: string,
  file: string,
  year: number,
  expected: { values: Map<string, number>; notations: Map<string, string> },
): AnswerKeyRow {
  let fileTotalT = 0;
  let totalExclEnergyT = 0;
  for (const [gpc, tonnes] of expected.values) {
    fileTotalT += tonnes;
    if (!isOmittedGPCReference(gpc)) totalExclEnergyT += tonnes;
  }
  return {
    city,
    file,
    year,
    rowsEcrf3: null,
    rowsWithValue: expected.values.size,
    notationKeys: `${expected.notations.size} notation GPC refs`,
    fileTotalT,
    totalExclEnergyT,
    sectors: {},
    fromWorkbook: false,
  };
}

async function loadAnswerKeys(dir: string): Promise<AnswerKeyRow[]> {
  const keyPath = path.join(dir, "Answer_Keys_and_Results_eCRF_DP4C.xlsx");
  try {
    await access(keyPath, fsConstants.R_OK);
  } catch {
    return [];
  }
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(keyPath);
  const sheet = wb.getWorksheet("Answer key");
  if (!sheet) throw new Error("Answer key sheet missing");
  const rows: AnswerKeyRow[] = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const city = cellText(row.getCell(1).value);
    const file = cellText(row.getCell(2).value);
    if (!city || !file.endsWith(".xlsx")) return;
    rows.push({
      city,
      file,
      year: cellNum(row.getCell(3).value) ?? 0,
      rowsEcrf3: cellNum(row.getCell(4).value),
      rowsWithValue: cellNum(row.getCell(5).value),
      notationKeys: cellText(row.getCell(6).value),
      sectors: {
        "Stationary Energy": cellNum(row.getCell(7).value),
        Transportation: cellNum(row.getCell(8).value),
        Waste: cellNum(row.getCell(9).value),
        IPPU: cellNum(row.getCell(10).value),
        AFOLU: cellNum(row.getCell(11).value),
        "Energy generation": cellNum(row.getCell(12).value),
      },
      fileTotalT: cellNum(row.getCell(15).value),
      totalExclEnergyT: cellNum(row.getCell(16).value),
      fromWorkbook: true,
    });
  });
  return rows;
}

function matchFiles(
  files: string[],
  key: AnswerKeyRow,
): { file: string; family: Family }[] {
  const target = slug(key.file).replace(/_xlsx$/, "");
  const city = slug(key.city);
  const hits: { file: string; family: Family }[] = [];
  for (const file of files) {
    const s = slug(file);
    if (s.startsWith("answer_keys")) continue;
    if (!s.endsWith("xlsx")) continue;
    const fam = familyOf(file);
    if (fam === "exact-ecrf") {
      if (city.includes("mexico") && /mx_mex|mexico/i.test(s)) {
        hits.push({ file, family: fam });
      }
      continue;
    }
    if (s.includes(target) || s.includes(city)) {
      hits.push({ file, family: fam });
    }
  }
  return hits;
}

async function resolveUserId(): Promise<string> {
  const email = process.env.DEFAULT_ADMIN_EMAIL?.toLowerCase();
  if (email) {
    const user = await db.models.User.findOne({ where: { email } });
    if (user?.userId) return user.userId;
  }
  const admin = await db.models.User.findOne({ where: { role: Roles.Admin } });
  if (!admin?.userId) {
    throw new Error("No admin user. Set DEFAULT_ADMIN_EMAIL or create-admin.");
  }
  return admin.userId;
}

async function ensureInventory(input: {
  cityName: string;
  year: number;
  userId: string;
}): Promise<{ cityId: string; inventoryId: string }> {
  const locode = `XX P950 ${slug(input.cityName).slice(0, 18)}`.trim();
  let city = await db.models.City.findOne({ where: { locode } });
  if (!city) {
    city = await db.models.City.create({
      cityId: randomUUID(),
      locode,
      name: `Path A backtest ${input.cityName}`,
      projectId: DEFAULT_PROJECT_ID,
      country: "Test",
    });
    await db.models.CityUser.create({
      cityUserId: randomUUID(),
      cityId: city.cityId,
      userId: input.userId,
    });
  }
  let inventory = await db.models.Inventory.findOne({
    where: { cityId: city.cityId, year: input.year },
  });
  if (!inventory) {
    inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      year: input.year,
      inventoryName: `${input.cityName} ${input.year} path-a backtest`,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
  }
  return { cityId: city.cityId, inventoryId: inventory.inventoryId };
}

function toUploadFile(buffer: Buffer, originalFileName: string): File {
  const fileType = fileTypeOf(originalFileName);
  const mime =
    fileType === "unknown"
      ? "application/octet-stream"
      : InventoryFileStorageService.mimeTypeForFileType(fileType);
  return new File([new Uint8Array(buffer)], originalFileName, { type: mime });
}

/** Same GPC grouping import uses: many eCRF_3 lines become one stored ref. */
async function expectedByGpc(
  buffer: Buffer,
  fileName: string,
  year: number,
): Promise<{
  values: Map<string, number>;
  notations: Map<string, string>;
}> {
  const values = new Map<string, number>();
  const notations = new Map<string, string>();
  const fileType = fileTypeOf(fileName);
  if (fileType !== "xlsx" && fileType !== "csv") {
    return { values, notations };
  }
  const validation = await FileValidatorService.validateFileStructure(
    toUploadFile(buffer, fileName),
  );
  const classified = classifyBulkInventoryFile(validation);
  if (classified.kind !== "ecrf" && classified.kind !== "near-ecrf") {
    return { values, notations };
  }
  const importResult = await buildBulkInventoryImportResult({
    kind: classified.kind,
    buffer,
    fileType,
    validation,
    inventoryYear: year,
  });
  for (const row of importResult.rows) {
    if (row.errors?.length || importRowSkipReason(row)) continue;
    const gpc = row.gpcRefNo?.trim();
    if (!gpc) continue;
    const total = resolveImportedTotalCO2e(row);
    if (hasSignedNumericValue(total)) {
      values.set(gpc, (values.get(gpc) ?? 0) + (total as number));
      continue;
    }
    const notation = toCanonical(row.notationKey);
    if (notation) notations.set(gpc, notation);
  }
  return { values, notations };
}

function mapsFromInventoryValues(rows: {
  gpcReferenceNumber?: string | null;
  co2eq?: unknown;
  unavailableReason?: string | null;
}[]): { values: Map<string, number>; notations: Map<string, string> } {
  const values = new Map<string, number>();
  const notations = new Map<string, string>();
  for (const row of rows) {
    const gpc = row.gpcReferenceNumber?.trim();
    if (!gpc) continue;
    if (row.co2eq != null) {
      values.set(gpc, Number(row.co2eq) / 1000);
    }
    const note = toCanonical(row.unavailableReason);
    if (note) notations.set(gpc, note);
  }
  return { values, notations };
}

function scoreMaps(
  expected: { values: Map<string, number>; notations: Map<string, string> },
  actual: { values: Map<string, number>; notations: Map<string, string> },
): {
  recall: number | null;
  precision: number | null;
  valueAccuracy: number | null;
  totalExclEnergyT: number;
} {
  const expectedIds = new Set([
    ...expected.values.keys(),
    ...expected.notations.keys(),
  ]);
  const actualIds = new Set([...actual.values.keys(), ...actual.notations.keys()]);
  let intersection = 0;
  for (const id of expectedIds) {
    if (actualIds.has(id)) intersection += 1;
  }
  let valuePairs = 0;
  let valueHits = 0;
  for (const [gpc, tonnes] of expected.values) {
    const got = actual.values.get(gpc);
    if (got == null) continue;
    valuePairs += 1;
    if (withinTol(got, tonnes)) valueHits += 1;
  }
  let totalExclEnergyT = 0;
  for (const [gpc, tonnes] of actual.values) {
    if (!isOmittedGPCReference(gpc)) totalExclEnergyT += tonnes;
  }
  return {
    recall: expectedIds.size > 0 ? intersection / expectedIds.size : null,
    precision: actualIds.size > 0 ? intersection / actualIds.size : null,
    valueAccuracy: valuePairs > 0 ? valueHits / valuePairs : null,
    totalExclEnergyT,
  };
}

function meetsScoreBars(score: {
  recall: number | null;
  precision: number | null;
  valueAccuracy: number | null;
}): boolean {
  return (
    (score.recall ?? 0) >= RECALL_BAR &&
    (score.precision ?? 0) >= PRECISION_BAR &&
    (score.valueAccuracy ?? 0) >= 1
  );
}

async function loadInventoryForEcrfExport(
  inventoryId: string,
): Promise<InventoryWithInventoryValuesAndActivityValues> {
  const inventory = await db.models.Inventory.findByPk(inventoryId, {
    include: [
      { model: db.models.City, as: "city" },
      {
        model: db.models.InventoryValue,
        as: "inventoryValues",
        include: [
          {
            model: db.models.ActivityValue,
            as: "activityValues",
            include: [
              {
                model: db.models.GasValue,
                as: "gasValues",
                separate: true,
                include: [
                  {
                    model: db.models.EmissionsFactor,
                    as: "emissionsFactor",
                  },
                ],
              },
            ],
          },
          {
            model: db.models.DataSource,
            attributes: [
              "datasourceId",
              "sourceType",
              "datasetName",
              "datasourceName",
              "dataQuality",
            ],
            as: "dataSource",
          },
          {
            model: db.models.SubSector,
            as: "subSector",
            attributes: ["subsectorId", "subsectorName"],
          },
        ],
      },
    ],
  });
  if (!inventory) {
    throw new Error(`Inventory ${inventoryId} not found for eCRF export`);
  }
  return inventory.toJSON() as InventoryWithInventoryValuesAndActivityValues;
}

/** CityCatalyst eCRF download of ingested values, scored against stored GPC maps. */
async function scoreEcrfExport(
  inventoryId: string,
  year: number,
  stored: { values: Map<string, number>; notations: Map<string, string> },
): Promise<{
  recall: number | null;
  precision: number | null;
  valueAccuracy: number | null;
  totalT: number | null;
  pass: boolean;
  error?: string;
}> {
  try {
    const output = await loadInventoryForEcrfExport(inventoryId);
    const buffer = await ECRFDownloadService.downloadECRF(output);
    const exported = await expectedByGpc(
      buffer,
      "eCRF-inventory-export.xlsx",
      year,
    );
    const scored = scoreMaps(stored, exported);
    return {
      recall: scored.recall,
      precision: scored.precision,
      valueAccuracy: scored.valueAccuracy,
      totalT: scored.totalExclEnergyT,
      pass: meetsScoreBars(scored),
    };
  } catch (err) {
    return {
      recall: null,
      precision: null,
      valueAccuracy: null,
      totalT: null,
      pass: false,
      error: `ecrf export: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function wipeInventory(inventoryId: string, userId: string) {
  const count = await db.models.InventoryValue.count({
    where: { inventoryId },
  });
  if (!count) return;
  await db.sequelize!.transaction(async (transaction) => {
    await InventoryReplaceService.replaceInventoryValues(
      inventoryId,
      userId,
      transaction,
    );
  });
}

async function scoreStored(
  inventoryId: string,
  key: AnswerKeyRow,
  family: Family,
  file: string,
  ingestStatus: string,
  pathTaken: string,
  expected: { values: Map<string, number>; notations: Map<string, string> },
  error?: string,
): Promise<CaseResult> {
  const rows = await db.models.InventoryValue.findAll({
    where: { inventoryId },
  });
  const stored = mapsFromInventoryValues(rows);
  const vsSource = scoreMaps(expected, stored);
  const expectedIds = new Set([
    ...expected.values.keys(),
    ...expected.notations.keys(),
  ]);
  const storedIds = new Set([
    ...stored.values.keys(),
    ...stored.notations.keys(),
  ]);
  let intersection = 0;
  for (const id of expectedIds) {
    if (storedIds.has(id)) intersection += 1;
  }

  const classified = rows.filter((row) => row.gpcReferenceNumber).length;
  const classification = rows.length > 0 ? classified / rows.length : null;

  const results = await getEmissionResults(inventoryId);
  // InventoryValue.co2eq is kilograms; the answer key is metric tonnes.
  const storedTotalT = Number(results.totalEmissions ?? 0) / 1000;
  const totalsMatchExclEnergy =
    key.totalExclEnergyT == null
      ? null
      : withinTol(storedTotalT, key.totalExclEnergyT);
  const totalsMatchFile =
    key.fileTotalT == null ? null : withinTol(storedTotalT, key.fileTotalT);

  const exportScore =
    ingestStatus === "completed"
      ? await scoreEcrfExport(inventoryId, key.year, stored)
      : {
          recall: null,
          precision: null,
          valueAccuracy: null,
          totalT: null,
          pass: false,
          error: "ecrf export skipped (ingest did not complete)",
        };

  const flags: string[] = [];
  if (family === "exact-ecrf") {
    flags.push("exact-ecrf uses DPC Mexico totals as ingest control");
  }
  if (!key.fromWorkbook) {
    flags.push(
      family === "ciris"
        ? "CIRIS; scored against eCRF_3 (no workbook key row)"
        : "no workbook key row; scored against the source file",
    );
  }
  if (totalsMatchExclEnergy === false && totalsMatchFile === true) {
    flags.push("key?: dashboard total matches file total, not excl. I.4.4");
  }
  if (totalsMatchExclEnergy === false && totalsMatchFile === false) {
    flags.push("totals miss both file total and excl. energy generation");
  }
  if (error) flags.push(error);

  const pass =
    ingestStatus === "completed" &&
    (classification ?? 0) >= CLASS_BAR &&
    meetsScoreBars(vsSource) &&
    totalsMatchExclEnergy === true;

  return {
    city: key.city,
    file,
    family,
    year: key.year,
    pathTaken,
    ingestStatus,
    error,
    expectedValueRows: expected.values.size,
    storedValueRows: stored.values.size,
    storedNotationRows: stored.notations.size,
    matchedRows: intersection,
    rowRecall: vsSource.recall,
    rowPrecision: vsSource.precision,
    valueAccuracy: vsSource.valueAccuracy,
    classification,
    storedTotalT,
    expectedTotalExclEnergyT: key.totalExclEnergyT,
    expectedFileTotalT: key.fileTotalT,
    totalsMatchExclEnergy,
    totalsMatchFile,
    exportRecall: exportScore.recall,
    exportPrecision: exportScore.precision,
    exportValueAccuracy: exportScore.valueAccuracy,
    exportTotalT: exportScore.totalT,
    exportPass: exportScore.pass,
    flags,
    pass,
  };
}

function pct(n: number | null): string {
  if (n == null) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

function renderReport(results: CaseResult[], missing: string[]): string {
  const lines = [
    "# GHGI Path A backtest (eCRF, near-eCRF, CIRIS)",
    "",
    `Ran ${results.length} file(s). Rows are scored as stored GPC refs (import sums eCRF_3 lines that share a ref).`,
    "CIRIS with eCRF_3 is Path A (CC-1217). Packs without eCRF_3 are not scored.",
    "",
    "| City | Family | Path | Status | Recall | Precision | Value acc | Class | Stored t | Excl. energy t | Pass | Flags |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of results) {
    lines.push(
      `| ${r.city} | ${r.family} | ${r.pathTaken} | ${r.ingestStatus} | ${pct(r.rowRecall)} | ${pct(r.rowPrecision)} | ${pct(r.valueAccuracy)} | ${pct(r.classification)} | ${r.storedTotalT.toFixed(0)} | ${r.expectedTotalExclEnergyT ?? "-"} | ${r.pass ? "yes" : "no"} | ${r.flags.join("; ") || ""} |`,
    );
  }
  if (missing.length) {
    lines.push("", "## Missing from the folder", "");
    for (const m of missing) lines.push(`- ${m}`);
  }
  return lines.join("\n") + "\n";
}

async function runCase(input: {
  filesDir: string;
  file: string;
  family: Family;
  key: AnswerKeyRow;
  userId: string;
  runner: ReturnType<typeof createIngestRuntime>["runner"];
  store: ReturnType<typeof createIngestRuntime>["store"];
}): Promise<CaseResult> {
  const abs = path.join(input.filesDir, input.file);
  const { cityId, inventoryId } = await ensureInventory({
    cityName: `${input.key.city} ${input.family}`,
    year: input.key.year,
    userId: input.userId,
  });
  await wipeInventory(inventoryId, input.userId);
  const buffer = await readFile(abs);
  const expected = await expectedByGpc(buffer, input.file, input.key.year);
  const key = input.key.fromWorkbook
    ? input.key
    : keyFromSource(input.key.city, input.file, input.key.year, expected);
  let ingestStatus = "failed";
  let pathTaken = "unknown";
  let error: string | undefined;
  try {
    const { item } = await ingestGhgiBuffer({
      buffer,
      originalFileName: input.file,
      cityId,
      inventoryId,
      userId: input.userId,
      runner: input.runner,
      store: input.store,
    });
    ingestStatus = item.status;
    pathTaken =
      (item.result as { kind?: string } | undefined)?.kind ??
      item.errorCode ??
      item.status;
    if (item.status !== "completed") {
      error = item.errorLog ?? item.errorCode ?? "ingest did not complete";
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return scoreStored(
    inventoryId,
    key,
    input.family,
    input.file,
    ingestStatus,
    pathTaken,
    expected,
    error,
  );
}

async function main() {
  const filesDir = argValue("--files", DEFAULT_FILES);
  try {
    await access(filesDir, fsConstants.R_OK);
  } catch {
    throw new Error(
      `Golden-file folder not found: ${filesDir}. Pass --files <path> to the local inventory xlsx folder.`,
    );
  }
  env.loadEnvConfig(process.cwd());
  await db.initialize();
  const userId = await resolveUserId();
  const keys = await loadAnswerKeys(filesDir);
  const names = await readdir(filesDir);
  const { runner, store } = createIngestRuntime();
  const results: CaseResult[] = [];
  const missing: string[] = [];
  const used = new Set<string>();

  for (const key of keys) {
    const hits = matchFiles(names, key);
    if (!hits.length) {
      missing.push(`${key.city} (${key.file})`);
      continue;
    }
    for (const hit of hits) {
      used.add(hit.file);
      results.push(
        await runCase({
          filesDir,
          file: hit.file,
          family: hit.family,
          key,
          userId,
          runner,
          store,
        }),
      );
    }
  }

  for (const file of names) {
    if (!isInventoryXlsx(file) || used.has(file)) continue;
    const parsed = parseCirisName(file) ?? parseCrfFormatName(file);
    const city = parsed?.city ?? file.replace(/\.(xlsx|xlsm)$/i, "");
    const year = parsed?.year ?? new Date().getFullYear();
    results.push(
      await runCase({
        filesDir,
        file,
        family: familyOf(file),
        key: {
          city,
          file,
          year,
          rowsEcrf3: null,
          rowsWithValue: null,
          notationKeys: "",
          fileTotalT: null,
          totalExclEnergyT: null,
          sectors: {},
          fromWorkbook: false,
        },
        userId,
        runner,
        store,
      }),
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "reports", "ghgi-path-a", stamp);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "report.md"), renderReport(results, missing));
  await writeFile(
    path.join(outDir, "report.json"),
    JSON.stringify({ results, missing }, null, 2),
  );
  console.log(renderReport(results, missing));
  console.log(`Wrote ${outDir}`);
  await db.sequelize?.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
