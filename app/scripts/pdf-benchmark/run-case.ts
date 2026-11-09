/**
 * Runs one attempt of one PDF case through the real import flow: creates a test
 * city and inventory, calls the upload, extract and approve routes, runs the OCR
 * queue worker (what the scheduler runs in production) until the import
 * settles, then reads the stored values back and scores them. Ported from
 * measure-ghgi-import.jest.ts (CC-1132).
 */
import env from "@next/env";
import { NextRequest } from "next/server";
import pino from "pino";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { QueryTypes } from "sequelize";
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import { heldRowDecisions } from "@/backend/ingestion-benchmark/held-rows";
import {
  ZERO_TOKENS,
  type FailureMode,
  type RunEntry,
  type Tokens,
} from "@/backend/ingestion-benchmark/report";
import {
  scoreFile,
  type StoredValue,
} from "@/backend/ingestion-benchmark/score";
import { scoringKey } from "@/backend/ingestion-benchmark/rescore";
import type { CaseManifestEntry } from "@/backend/ingestion-benchmark/selection";
import { Auth, type AppSession } from "@/lib/auth";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { toCanonical } from "@/util/notation-keys";
import { Roles } from "@/util/types";

const TEST_USER_ID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";
const IMPORT_PATH = "@/app/api/v1/city/[city]/inventory/[inventory]/import";
const JOB_TIMEOUT_MS = 600_000;

export type LocalConfig = {
  /** Folder (or folders, searched in order) holding the PDFs named in the manifest. */
  pdfDir: string | string[];
  answerKeys: string;
  /** Defaults to ../docs/ingestion-accuracy-runs */
  outRoot: string;
};

export type OcrRun = {
  ok: boolean;
  code: string | null;
  pages: number | null;
  ms: number;
};

type Routes = {
  upload: typeof import("@/app/api/v1/city/[city]/inventory/[inventory]/import/route");
  status: typeof import("@/app/api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/route");
  extract: typeof import("@/app/api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/extract/route");
  approve: typeof import("@/app/api/v1/city/[city]/inventory/[inventory]/import/approve/route");
};

export type RunContext = {
  db: typeof import("@/models").db;
  storage: typeof import("@/backend/InventoryFileStorageService").default;
  processPdfOcrJobs: typeof import("@/backend/PdfOcrService").processPdfOcrJobs;
  routes: Routes;
  config: LocalConfig;
  /** OCR jobs per case id, one per attempt. */
  ocrRuns: Map<string, OcrRun[]>;
  /** OCR text per `<caseId>/<attempt>`, written to the run folder once its name is known. */
  ocrTexts: Map<string, string>;
  uploadedKeys: string[];
  cityIds: string[];
  importedFileIds: string[];
  restoreAuth: () => void;
  /** Set once cleanup has started; a second call returns the same promise. */
  disposing?: Promise<void>;
  /** True when every test city was removed. */
  cleanedUp: boolean;
};

export function pdfPathFor(
  config: LocalConfig,
  entry: CaseManifestEntry,
): string | null {
  const dirs = Array.isArray(config.pdfDir) ? config.pdfDir : [config.pdfDir];
  for (const dir of dirs) {
    const candidate = join(dir, entry.fileName);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// Product code logs every LLM call with its token usage; read those lines from
// the shared pino stream so the benchmark needs no product change.
const meter: Tokens = { ...ZERO_TOKENS };
let windowMax = 0;
const snapshot = (): Tokens => ({ ...meter });
const since = (before: Tokens): Tokens => {
  const max = windowMax;
  windowMax = 0;
  return {
    calls: meter.calls - before.calls,
    promptTokens: meter.promptTokens - before.promptTokens,
    completionTokens: meter.completionTokens - before.completionTokens,
    reasoningTokens:
      (meter.reasoningTokens ?? 0) - (before.reasoningTokens ?? 0),
    lengthStops: (meter.lengthStops ?? 0) - (before.lengthStops ?? 0),
    maxCompletionTokens: max,
  };
};

function installUsageMeter(logger: object) {
  const stream = (logger as Record<symbol, { write: (c: string) => boolean }>)[
    pino.symbols.streamSym
  ];
  const write = stream.write.bind(stream);
  stream.write = (chunk: string) => {
    if (
      typeof chunk === "string" &&
      chunk.includes('"LLM complete response"')
    ) {
      try {
        const entry = JSON.parse(chunk) as {
          promptTokens?: number;
          completionTokens?: number;
          reasoningTokens?: number;
          finishReason?: string;
        };
        meter.calls += 1;
        meter.promptTokens += entry.promptTokens ?? 0;
        meter.completionTokens += entry.completionTokens ?? 0;
        meter.reasoningTokens =
          (meter.reasoningTokens ?? 0) + (entry.reasoningTokens ?? 0);
        if (entry.finishReason === "length") {
          meter.lengthStops = (meter.lengthStops ?? 0) + 1;
        }
        windowMax = Math.max(windowMax, entry.completionTokens ?? 0);
      } catch {
        // a malformed log line only loses one call from the count
      }
    }
    return write(chunk);
  };
}

function mockRequest(body?: unknown): NextRequest {
  const request = new NextRequest(new URL("http://localhost:3000/api/v1"));
  request.json = async () => body;
  return request;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Loads env, product modules and the test session. Call `disposeContext` when done. */
export async function createContext(config: LocalConfig): Promise<RunContext> {
  env.loadEnvConfig(process.cwd());
  installUsageMeter((await import("@/services/logger")).logger);
  const { db } = await import("@/models");
  const storage = (await import("@/backend/InventoryFileStorageService"))
    .default;
  const { processPdfOcrJobs } = await import("@/backend/PdfOcrService");
  const routes: Routes = {
    upload: await import(`${IMPORT_PATH}/route`),
    status: await import(`${IMPORT_PATH}/[importedFileId]/route`),
    extract: await import(`${IMPORT_PATH}/[importedFileId]/extract/route`),
    approve: await import(`${IMPORT_PATH}/approve/route`),
  };
  await db.initialize();

  const original = Auth.getServerSession;
  Auth.getServerSession = async () =>
    ({
      user: {
        id: TEST_USER_ID,
        name: "Ingestion accuracy",
        email: "ingestion-accuracy@example.com",
        image: null,
        role: Roles.User,
      },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    }) as AppSession;
  await db.models.User.upsert({ userId: TEST_USER_ID, name: "TEST_USER" });

  return {
    db,
    storage,
    processPdfOcrJobs,
    routes,
    config,
    ocrRuns: new Map(),
    ocrTexts: new Map(),
    uploadedKeys: [],
    cityIds: [],
    importedFileIds: [],
    cleanedUp: false,
    restoreAuth: () => {
      Auth.getServerSession = original;
    },
  };
}

/** Removes test cities, inventories, jobs and bucket objects, restores auth and closes the pool. */
export function disposeContext(ctx: RunContext): Promise<void> {
  ctx.disposing ??= doDispose(ctx);
  return ctx.disposing;
}

async function doDispose(ctx: RunContext): Promise<void> {
  let clean = true;
  try {
    for (const key of ctx.uploadedKeys) {
      try {
        await ctx.storage.deleteFile(key);
      } catch {
        // a missing object is not worth failing the cleanup
      }
    }
    try {
      await ctx.db.models.PdfOcrJob.destroy({
        where: {
          sourceType: "inventory_import",
          sourceId: ctx.importedFileIds,
        },
        force: true,
      });
    } catch (error) {
      clean = false;
      console.error(
        `Cleanup: OCR jobs not removed: ${(error as Error).message}`,
      );
    }
    for (const cityId of ctx.cityIds) {
      try {
        await ctx.db.models.ImportedInventoryFile.destroy({
          where: { cityId },
          force: true,
        });
        await ctx.db.sequelize!.query(
          `DELETE FROM "InventoryValue" WHERE inventory_id IN (SELECT inventory_id FROM "Inventory" WHERE city_id = :cityId)`,
          { replacements: { cityId } },
        );
        await ctx.db.models.Inventory.destroy({ where: { cityId } });
        await ctx.db.models.City.destroy({ where: { cityId } });
      } catch (error) {
        clean = false;
        console.error(
          `Cleanup: test city ${cityId} not removed: ${(error as Error).message}`,
        );
      }
    }
  } finally {
    ctx.cleanedUp = clean;
    try {
      ctx.restoreAuth();
      await ctx.db.sequelize?.close();
    } catch {
      // cleanup errors never change the exit code
    }
  }
}

type ReadBackRow = {
  gpc: string;
  scope: string | null;
  omit: boolean;
  co2eq: string | null;
  activity_co2eq: string | null;
  unavailable_reason: string | null;
};

// InventoryValue.co2eq is stored in kg; the report is in tonnes.
async function readBack(ctx: RunContext, inventoryId: string) {
  const rows = await ctx.db.sequelize!.query<ReadBackRow>(
    `SELECT iv.gpc_reference_number AS gpc,
            COALESCE(sc.scope_name, ss.scope_name) AS scope,
            iv.omit_from_total AS omit,
            iv.unavailable_reason AS unavailable_reason,
            iv.co2eq::text AS co2eq,
            (SELECT SUM(av.co2eq)::text FROM "ActivityValue" av WHERE av.inventory_value_id = iv.id) AS activity_co2eq
       FROM "InventoryValue" iv
       LEFT JOIN "SubCategory" sub ON sub.subcategory_id = iv.sub_category_id
       LEFT JOIN "Scope" sc ON sc.scope_id = sub.scope_id
       LEFT JOIN "SubSector" subs ON subs.subsector_id = iv.sub_sector_id
       LEFT JOIN "Scope" ss ON ss.scope_id = subs.scope_id
      WHERE iv.inventory_id = :inventoryId`,
    { replacements: { inventoryId }, type: QueryTypes.SELECT },
  );
  const tonnes = (row: ReadBackRow) =>
    Number(row.co2eq ?? row.activity_co2eq ?? 0) / 1000;
  const counted = rows.filter((row) => !row.omit);
  const stored: StoredValue[] = rows.map((row) => ({
    gpc: row.gpc,
    scope: row.scope,
    valueT: tonnes(row),
    omit: row.omit,
    notation: row.unavailable_reason
      ? (toCanonical(row.unavailable_reason) ?? row.unavailable_reason)
      : null,
  }));
  return {
    stored,
    total: counted.reduce((sum, row) => sum + tonnes(row), 0),
  };
}

async function pollStatus(
  ctx: RunContext,
  ids: { city: string; inventory: string },
  importedFileId: string,
  until: string[],
  maxMs = JOB_TIMEOUT_MS,
) {
  const start = Date.now();
  for (;;) {
    const response = await ctx.routes.status.GET(mockRequest(), {
      params: Promise.resolve({ ...ids, importedFileId }),
    });
    const json = await response.json();
    const importStatus = json?.data?.importStatus as string;
    if (until.includes(importStatus) || Date.now() - start > maxMs) {
      return { importStatus, json };
    }
    await sleep(1500);
  }
}

// What the scheduler does in production: extract queues the job, then the
// worker passes run OCR and extraction until the import settles.
async function runPdfJob(
  ctx: RunContext,
  ids: { city: string; inventory: string },
  importedFileId: string,
) {
  const queued = await ctx.routes.extract.POST(mockRequest(), {
    params: Promise.resolve({ ...ids, importedFileId }),
  });
  if (queued.status >= 300) throw new Error(`extract ${queued.status}`);
  const start = Date.now();
  for (;;) {
    await ctx.processPdfOcrJobs();
    const state = await pollStatus(
      ctx,
      ids,
      importedFileId,
      ["waiting_for_approval", "failed"],
      -1,
    );
    if (["waiting_for_approval", "failed"].includes(state.importStatus)) {
      return state;
    }
    if (Date.now() - start > JOB_TIMEOUT_MS) {
      throw new Error(`PDF job still ${state.importStatus} after 10 min`);
    }
    await sleep(2000);
  }
}

const asText = (item: unknown): string | null => {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    return JSON.stringify(item);
  }
  return null;
};

/** Warnings of the status response: import-level, legacy and per-row. */
export function collectWarnings(data: unknown): string[] {
  const root = (data ?? {}) as Record<string, any>;
  const lists: unknown[] = [
    root.validationResults?.warnings,
    root.validationResults_legacy?.warnings,
    root.reviewData?.warnings,
  ];
  const rows: unknown[] = Array.isArray(root.reviewData?.rows)
    ? root.reviewData.rows
    : [];
  for (const row of rows) {
    lists.push((row as Record<string, unknown>)?.warnings);
  }
  const warnings = lists.flatMap((list) =>
    Array.isArray(list) ? list.map(asText) : [],
  );
  return [...new Set(warnings.filter((w): w is string => !!w))];
}

/** Warnings stored on the ingest item that references the imported file, when there is one. */
async function ingestItemWarnings(
  ctx: RunContext,
  importedFileId: string,
): Promise<string[]> {
  try {
    const items = await ctx.db.sequelize!.query<{ warnings: string[] | null }>(
      `SELECT warnings FROM "IngestItem" WHERE result->>'importedFileId' = :importedFileId`,
      { replacements: { importedFileId }, type: QueryTypes.SELECT },
    );
    return items.flatMap((item) => item.warnings ?? []);
  } catch {
    return [];
  }
}

/** Include decisions for the rows the review would hold back, built the way the review screen sends them. */
async function includeHeldRows(ctx: RunContext, importedFileId: string) {
  const { buildImportResult } = await import("@/backend/ImportResultBuilder");
  const { findPendingRows } = await import("@/backend/ImportRowPreviewService");
  const file =
    await ctx.db.models.ImportedInventoryFile.findByPk(importedFileId);
  if (!file) return { decisions: {}, included: 0, unresolved: 0 };
  const { importResult } = await buildImportResult(file);
  return heldRowDecisions(findPendingRows(importResult), importedFileId);
}

type Stage = "setup" | "upload" | "job" | "approve" | "readback";

export async function runAttempt(
  ctx: RunContext,
  entry: CaseManifestEntry,
  key: KeyFile,
  attempt: number,
): Promise<RunEntry> {
  const started = Date.now();
  const beforeRun = snapshot();
  const stageMs: RunEntry["stageMs"] = {
    ocr: null,
    extraction: null,
    import: null,
    total: 0,
  };
  let usage: Tokens | null = null;
  const finish = (
    partial: Partial<RunEntry> & { failureMode: FailureMode },
  ): RunEntry => {
    stageMs.total = Date.now() - started;
    usage ??= since(beforeRun);
    return {
      run: attempt,
      warnings: [],
      ok: partial.failureMode === "scored",
      ms: stageMs.total,
      stageMs,
      usage,
      ...partial,
    };
  };

  const pdfPath = pdfPathFor(ctx.config, entry);
  if (!pdfPath) {
    return finish({
      failureMode: "setup_error",
      message: `PDF not found: ${entry.fileName}`,
    });
  }
  const buffer = readFileSync(pdfPath);
  const ocrRuns = ctx.ocrRuns.get(entry.id) ?? [];
  ctx.ocrRuns.set(entry.id, ocrRuns);

  let stage: Stage = "setup";
  let ids = { city: "", inventory: "" };
  let ocrOk = false;
  let warnings: string[] = [];
  let extractedRows = 0;
  let heldRowsIncluded = 0;
  let failedPages: number[] = [];
  try {
    const city = await ctx.db.models.City.create({
      cityId: randomUUID(),
      name: `Ingestion accuracy ${entry.id} r${attempt}`,
      country: "Test",
      locode: `XX_IA_${entry.id}_${attempt}_${randomUUID().slice(0, 6)}`.slice(
        0,
        32,
      ),
    });
    ctx.cityIds.push(city.cityId);
    await city.addUser(TEST_USER_ID);
    const inventory = await ctx.db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      inventoryName: `IA_${entry.id}_${attempt}`,
      year: entry.year,
      totalEmissions: 0,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    ids = { city: city.cityId, inventory: inventory.inventoryId };
    stage = "upload";
    const form = new FormData();
    form.append("file", new File([buffer], basename(pdfPath)));
    const request = mockRequest();
    request.formData = async () => form;
    const uploaded = await ctx.routes.upload.POST(request, {
      params: Promise.resolve(ids),
    });
    const uploadedJson = await uploaded.json();
    if (uploaded.status >= 300) {
      throw new Error(
        `upload ${uploaded.status}: ${JSON.stringify(uploadedJson).slice(0, 200)}`,
      );
    }
    const importedFileId: string = uploadedJson.data.id;
    ctx.importedFileIds.push(importedFileId);

    stage = "job";
    const jobStarted = Date.now();
    let state;
    let ocrMs: number | null = null;
    let jobMs = 0;
    try {
      state = await runPdfJob(ctx, ids, importedFileId);
    } finally {
      jobMs = Date.now() - jobStarted;
      const job = await ctx.db.models.PdfOcrJob.findOne({
        where: { sourceType: "inventory_import", sourceId: importedFileId },
      });
      const stored =
        await ctx.db.models.ImportedInventoryFile.findByPk(importedFileId);
      for (const s3Key of [
        stored?.s3Key,
        job?.resultS3Key,
        job?.structuredS3Key,
      ]) {
        if (s3Key) ctx.uploadedKeys.push(s3Key);
      }
      ocrMs =
        job?.startedAt && job?.completedAt
          ? job.completedAt.getTime() - job.startedAt.getTime()
          : null;
      ocrOk = job?.status === "succeeded";
      ocrRuns.push({
        ok: ocrOk,
        code: job?.errorCode ?? null,
        pages: job?.pageCount ?? null,
        ms: jobMs,
      });
      if (job?.resultS3Key) {
        // Third-party document text: kept in memory until the run folder exists.
        ctx.ocrTexts.set(
          `${entry.id}/${attempt}`,
          await ctx.storage.getTextFile(job.resultS3Key),
        );
      }
      const summary = (
        stored?.mappingConfiguration as {
          extractionSummary?: { failedPages?: number[] };
        } | null
      )?.extractionSummary;
      failedPages = summary?.failedPages ?? [];
    }
    stageMs.ocr = ocrMs;
    stageMs.extraction = Math.max(0, jobMs - (ocrMs ?? 0));
    usage = since(beforeRun);
    warnings = [
      ...collectWarnings(state.json?.data),
      ...(await ingestItemWarnings(ctx, importedFileId)),
    ];
    extractedRows = Number(state.json?.data?.rowCount ?? 0);
    const base = { warnings, failedPages, extractedRows };
    const withHeld = () => ({ ...base, heldRowsIncluded });

    if (state.importStatus === "failed") {
      const errorLog =
        (state.json?.data?.errorLog as string | null) ??
        "import failed without errorLog";
      // The extraction summary is kept only when the model returned no rows (CC-1202).
      const zeroRows = !!(
        state.json?.data?.mappingConfiguration as
          { extractionSummary?: unknown } | null | undefined
      )?.extractionSummary;
      if (!ocrOk) {
        return finish({ ...base, failureMode: "ocr_error", message: errorLog });
      }
      if (zeroRows) {
        return finish({
          ...base,
          failureMode: "zero_rows",
          zeroRowsReason: errorLog.replace(/^i18n:/, ""),
          message: errorLog,
        });
      }
      return finish({
        ...base,
        failureMode: "extraction_error",
        message: errorLog,
      });
    }

    stage = "approve";
    const importStarted = Date.now();
    // Held rows block approval until they have a decision. The benchmark
    // measures what the model extracted, so every held row is included.
    const held = await includeHeldRows(ctx, importedFileId);
    heldRowsIncluded = held.included;
    const approved = await ctx.routes.approve.POST(
      mockRequest({
        importedFileId,
        ...(held.included > 0
          ? {
              mappingOverrides: {
                columnMappings: {},
                rowDecisions: held.decisions,
              },
            }
          : {}),
      }),
      { params: Promise.resolve(ids) },
    );
    if (approved.status >= 300) {
      const detail = await approved.json().catch(() => null);
      throw new Error(
        `approve ${approved.status}${(detail?.error?.message ?? detail?.message) ? `: ${String(detail?.error?.message ?? detail.message).slice(0, 160)}` : ""}${held.unresolved ? ` (${held.unresolved} held row(s) cannot be included)` : ""}`,
      );
    }
    const done = await pollStatus(ctx, ids, importedFileId, [
      "completed",
      "failed",
    ]);
    stageMs.import = Date.now() - importStarted;
    if (done.importStatus !== "completed") {
      return finish({
        ...base,
        ...withHeld(),
        failureMode: "approve_error",
        message: `import ended ${done.importStatus}`,
      });
    }

    stage = "readback";
    const back = await readBack(ctx, ids.inventory);
    const score = scoreFile(scoringKey(key, entry.totalOnly), back.stored);
    const hitLimit = (usage.lengthStops ?? 0) > 0;
    const truncated = hitLimit || failedPages.length > 0;
    return finish({
      ...withHeld(),
      failureMode: truncated ? "truncated" : "scored",
      stored: back.stored,
      score,
      total: back.total,
      ...(truncated
        ? {
            message: hitLimit
              ? "a call hit the token limit"
              : `pages failed: ${failedPages.join(", ")}`,
          }
        : {}),
    });
  } catch (error) {
    const failureMode: FailureMode =
      stage === "approve"
        ? "approve_error"
        : stage === "readback"
          ? "readback_error"
          : stage === "setup" || stage === "upload"
            ? "setup_error"
            : stage === "job" &&
                !ocrOk &&
                !/^extract \d/.test((error as Error).message)
              ? "ocr_error"
              : "extraction_error";
    return finish({
      failureMode,
      warnings,
      failedPages,
      extractedRows,
      heldRowsIncluded,
      message: (error as Error).message,
    });
  }
}
