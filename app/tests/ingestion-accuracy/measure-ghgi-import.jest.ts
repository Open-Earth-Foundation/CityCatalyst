/**
 * Measures how the GHGI file import behaves on real files. Skipped unless
 * INGESTION_ACCURACY_RUN=1, so it never runs in CI. See
 * docs/IngestionAccuracyBaseline.md for the method and how to read the output.
 *
 * What it does, per file and per run:
 * - Creates a test city and inventory for the report year.
 * - PDF: uploads the file to the configured bucket, runs Mistral OCR and the
 *   extraction, stores the rows as `waiting_for_approval` (as the OCR job does),
 *   then calls the real approve route.
 * - CSV/XLSX: calls the real upload, interpret (if needed), status and approve
 *   routes.
 * - Reads the imported values back from `InventoryValue` and compares the total
 *   and the scope split with the published reference.
 *
 * Needs a throwaway Postgres (migrated and seeded), a bucket for PDFs, and the
 * LLM and Mistral keys in the environment. DATABASE_* variables exported in the
 * shell override `.env`. Test cities, inventories and bucket objects are removed
 * at the end.
 *
 *   INGESTION_ACCURACY_RUN=1 \
 *   INGESTION_ACCURACY_CONFIG=tests/ingestion-accuracy/config.example.json \
 *   INGESTION_ACCURACY_OUT=../docs/ingestion-accuracy-runs \
 *   NODE_OPTIONS=--experimental-vm-modules NODE_ENV=test \
 *   npx jest tests/ingestion-accuracy --runInBand --coverage=false
 */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import env from "@next/env";
import { NextRequest } from "next/server";
import pino from "pino";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { QueryTypes } from "sequelize";
import { Auth, type AppSession } from "@/lib/auth";
import {
  GlobalWarmingPotentialTypeEnum,
  ImportStatusEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { toCanonical } from "@/util/notation-keys";
import { Roles } from "@/util/types";
import {
  ZERO_TOKENS,
  gitInfo,
  writeRunArtifact,
  type CaseResult,
  type Prices,
  type Tokens,
} from "./report";
import { scoreFile, type KeyFile, type StoredValue } from "./score";

const RUN = process.env.INGESTION_ACCURACY_RUN === "1";
// 22 cases x 3 runs takes about 2 hours; raise it for bigger sets.
const TEST_TIMEOUT_MS = Number(
  process.env.INGESTION_ACCURACY_TIMEOUT_MS ?? 4 * 3_600_000,
);
const TEST_USER_ID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";
const IMPORT_PATH = "@/app/api/v1/city/[city]/inventory/[inventory]/import";

type FileSpec = {
  /** File id in the answer keys when `answerKeys` is set, otherwise any label. */
  id: string;
  path: string;
  /** Defaults to the year in the answer keys. */
  targetYear?: number;
  /** Defaults to the file extension. */
  kind?: "pdf" | "csv" | "xlsx";
  reference?: { total?: number; scopes?: Record<string, number> };
};

type Config = {
  runs: number;
  /** JSON produced by export-answer-keys.ts; enables row-level scoring. */
  answerKeys?: string;
  /** Copy the input files into the run folder (they are third-party documents). */
  publishInputs?: boolean;
  /** USD unit prices; without all three the report shows tokens and pages but no dollar figure. */
  prices?: Prices;
  /** LLM prices per extraction model (as in LLM_EXTRACTION_MODEL); override `prices` for that model. */
  modelPrices?: Record<string, Prices>;
  /** File ids reported apart from the validated set. */
  heldOut?: string[];
  files: FileSpec[];
};

type AnswerKeys = { files: Record<string, KeyFile> };

type ReadBackRow = {
  gpc: string;
  scope: string | null;
  omit: boolean;
  co2eq: string | null;
  activity_co2eq: string | null;
  unavailable_reason: string | null;
};

function mockRequest(body?: unknown): NextRequest {
  const request = new NextRequest(new URL("http://localhost:3000/api/v1"));
  request.json = jest.fn(() =>
    Promise.resolve(body),
  ) as unknown as typeof request.json;
  return request;
}

// Product code logs every LLM call with its token usage; read those lines from
// the shared pino stream so the benchmark needs no product change.
const meter: Tokens = { ...ZERO_TOKENS };
const snapshot = (): Tokens => ({ ...meter });
// The largest single completion is tracked per window, not as a running total.
let windowMax = 0;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function pctDiff(actual: number, expected: number): number | null {
  return expected ? ((actual - expected) / Math.abs(expected)) * 100 : null;
}

(RUN ? describe : describe.skip)("GHGI import accuracy", () => {
  let db: typeof import("@/models").db;
  let Storage: typeof import("@/backend/InventoryFileStorageService").default;
  let ocr: typeof import("@/backend/MistralOcrService");
  let extraction: typeof import("@/backend/InventoryExtractionService");
  let uploadRoute: typeof import("@/app/api/v1/city/[city]/inventory/[inventory]/import/route");
  let statusRoute: typeof import("@/app/api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/route");
  let interpretRoute: typeof import("@/app/api/v1/city/[city]/inventory/[inventory]/import/[importedFileId]/interpret/route");
  let approveRoute: typeof import("@/app/api/v1/city/[city]/inventory/[inventory]/import/approve/route");
  let config: Config;
  let answerKeys: AnswerKeys | null = null;
  const outDir =
    process.env.INGESTION_ACCURACY_OUT ?? "../docs/ingestion-accuracy-runs";
  const uploadedKeys: string[] = [];
  const cityIds: string[] = [];

  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    installUsageMeter((await import("@/services/logger")).logger);
    ({ db } = await import("@/models"));
    Storage = (await import("@/backend/InventoryFileStorageService")).default;
    ocr = await import("@/backend/MistralOcrService");
    extraction = await import("@/backend/InventoryExtractionService");
    uploadRoute = await import(`${IMPORT_PATH}/route`);
    statusRoute = await import(`${IMPORT_PATH}/[importedFileId]/route`);
    interpretRoute = await import(
      `${IMPORT_PATH}/[importedFileId]/interpret/route`
    );
    approveRoute = await import(`${IMPORT_PATH}/approve/route`);
    await db.initialize();
    jest.spyOn(Auth, "getServerSession").mockResolvedValue({
      user: {
        id: TEST_USER_ID,
        name: "Ingestion accuracy",
        email: "ingestion-accuracy@example.com",
        image: null,
        role: Roles.User,
      },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    } as AppSession);
    await db.models.User.upsert({ userId: TEST_USER_ID, name: "TEST_USER" });
    config = JSON.parse(
      readFileSync(process.env.INGESTION_ACCURACY_CONFIG!, "utf8"),
    ) as Config;
    if (config.answerKeys) {
      answerKeys = JSON.parse(
        readFileSync(config.answerKeys, "utf8"),
      ) as AnswerKeys;
    }
    mkdirSync(outDir, { recursive: true });
  }, 300_000);

  afterAll(async () => {
    for (const key of uploadedKeys) await Storage.deleteFile(key);
    for (const cityId of cityIds) {
      await db.models.ImportedInventoryFile.destroy({
        where: { cityId },
        force: true,
      });
      await db.sequelize!.query(
        `DELETE FROM "InventoryValue" WHERE inventory_id IN (SELECT inventory_id FROM "Inventory" WHERE city_id = :cityId)`,
        { replacements: { cityId } },
      );
      await db.models.Inventory.destroy({ where: { cityId } });
      await db.models.City.destroy({ where: { cityId } });
    }
    await db.sequelize?.close();
  }, 300_000);

  async function pollStatus(
    ids: { city: string; inventory: string },
    importedFileId: string,
    until: string[],
    maxMs = 600_000,
  ) {
    const start = Date.now();
    for (;;) {
      const response = await statusRoute.GET(mockRequest(), {
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

  // InventoryValue.co2eq is stored in kg; the report is in tonnes.
  async function readBack(inventoryId: string) {
    const rows = await db.sequelize!.query<ReadBackRow>(
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
    const byScope: Record<string, number> = {};
    for (const row of counted) {
      const scope = row.scope ?? "?";
      byScope[scope] = (byScope[scope] ?? 0) + tonnes(row);
    }
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
      storedRows: rows.length,
      omittedRows: rows.length - counted.length,
      total: counted.reduce((sum, row) => sum + tonnes(row), 0),
      byScope,
      gpcRefs: [...new Set(rows.map((row) => row.gpc))].sort(),
    };
  }

  async function runOcr(buffer: Buffer, fileName: string) {
    const key = `ingestion-accuracy/${randomUUID()}-${fileName}`;
    await Storage.putFile(key, buffer, "application/pdf");
    uploadedKeys.push(key);
    const url = await Storage.createSignedDownloadUrl(key, 600);
    const started = Date.now();
    try {
      const result = await ocr.convertPdfUrlToMarkdown(url, "none");
      return {
        markdown: result.markdown,
        stage: {
          ok: true,
          pages: result.pageCount,
          chars: result.markdown.length,
          ms: Date.now() - started,
        } as Record<string, unknown>,
      };
    } catch (error) {
      // Keep measuring the extraction on the raw OCR text when the structured
      // artifact step rejects the document; the stage is reported as failed.
      const response = await fetch("https://api.mistral.ai/v1/ocr", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          ocr.buildMistralOcrRequest(
            url,
            process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest",
            "none",
          ),
        ),
      });
      const payload = (await response.json()) as {
        pages?: { markdown?: string }[];
      };
      return {
        markdown: (payload.pages ?? [])
          .map(
            (page, index) =>
              `<!-- page ${index + 1} -->\n${page.markdown ?? ""}`,
          )
          .join("\n\n"),
        stage: {
          ok: false,
          code: (error as { code?: string }).code ?? null,
          message: (error as Error).message,
          pages: payload.pages?.length ?? null,
          ms: Date.now() - started,
        } as Record<string, unknown>,
      };
    }
  }

  it(
    "measures each file",
    async () => {
      const results: unknown[] = [];
      for (const file of config.files) {
        const buffer = readFileSync(file.path);
        const fileName = basename(file.path);
        const key = answerKeys?.files[file.id];
        if (answerKeys && !key) {
          throw new Error(`No answer key for file id ${file.id}`);
        }
        const targetYear = file.targetYear ?? key?.year;
        if (!targetYear) throw new Error(`No year for ${file.id}`);
        const extension = extname(file.path).slice(1).toLowerCase();
        const kind = file.kind ?? (extension as "pdf" | "csv" | "xlsx");
        const runs: Record<string, unknown>[] = [];
        const beforeOcr = snapshot();
        const ocrResult =
          kind === "pdf" ? await runOcr(buffer, fileName) : null;
        if (ocrResult) {
          // Third-party document text: kept next to the runs, ignored by git.
          const ocrDir = join(outDir, ".ocr-text");
          mkdirSync(ocrDir, { recursive: true });
          writeFileSync(join(ocrDir, `${file.id}.md`), ocrResult.markdown);
        }
        const ocrUsage = {
          ...since(beforeOcr),
          pages: (ocrResult?.stage.pages as number | null | undefined) ?? null,
        };

        for (let run = 1; run <= config.runs; run++) {
          const started = Date.now();
          const beforeRun = snapshot();
          const city = await db.models.City.create({
            cityId: randomUUID(),
            name: `Ingestion accuracy ${file.id} r${run}`,
            country: "Test",
            locode: `XX_IA_${file.id}_${run}`.slice(0, 32),
          });
          cityIds.push(city.cityId);
          await city.addUser(TEST_USER_ID);
          const inventory = await db.models.Inventory.create({
            inventoryId: randomUUID(),
            cityId: city.cityId,
            inventoryName: `IA_${file.id}_${run}`,
            year: targetYear,
            totalEmissions: 0,
            inventoryType: InventoryTypeEnum.GPC_BASIC,
            globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
          });
          const ids = { city: city.cityId, inventory: inventory.inventoryId };
          try {
            let importedFileId: string;
            let extractedRows = 0;
            let failedPages: number[] = [];
            if (ocrResult) {
              const { rows, summary } =
                await extraction.extractInventoryFromDocument(
                  ocrResult.markdown,
                  { targetYear },
                );
              extractedRows = rows.length;
              failedPages = summary.failedPages ?? [];
              importedFileId = randomUUID();
              await db.models.ImportedInventoryFile.create({
                id: importedFileId,
                userId: TEST_USER_ID,
                cityId: ids.city,
                inventoryId: ids.inventory,
                fileName,
                originalFileName: fileName,
                fileType: "pdf",
                fileSize: buffer.length,
                contentDigest: createHash("sha256")
                  .update(buffer)
                  .digest("hex"),
                data: buffer,
                importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
                mappingConfiguration: { rows },
                rowCount: rows.length,
                validationResults: { errors: [], warnings: [] },
              });
            } else {
              const form = new FormData();
              form.append("file", new File([buffer], fileName));
              const request = mockRequest();
              request.formData = jest.fn(() =>
                Promise.resolve(form),
              ) as unknown as typeof request.formData;
              const uploaded = await uploadRoute.POST(request, {
                params: Promise.resolve(ids),
              });
              const uploadedJson = await uploaded.json();
              if (uploaded.status >= 300) {
                throw new Error(
                  `upload ${uploaded.status}: ${JSON.stringify(uploadedJson).slice(0, 200)}`,
                );
              }
              importedFileId = uploadedJson.data.id;
              let state = await pollStatus(ids, importedFileId, [
                "pending_ai_interpretation",
                "waiting_for_approval",
                "failed",
              ]);
              if (state.importStatus === "pending_ai_interpretation") {
                await interpretRoute.POST(mockRequest(), {
                  params: Promise.resolve({ ...ids, importedFileId }),
                });
                state = await pollStatus(ids, importedFileId, [
                  "waiting_for_approval",
                  "failed",
                ]);
              }
              if (state.importStatus !== "waiting_for_approval") {
                throw new Error(`before approve: ${state.importStatus}`);
              }
              extractedRows = Number(state.json?.data?.rowCount ?? 0);
            }
            const approved = await approveRoute.POST(
              mockRequest({ importedFileId }),
              { params: Promise.resolve(ids) },
            );
            if (approved.status >= 300) {
              throw new Error(`approve ${approved.status}`);
            }
            const done = await pollStatus(ids, importedFileId, [
              "completed",
              "failed",
            ]);
            const back = await readBack(ids.inventory);
            const reference = file.reference;
            const score = key ? scoreFile(key, back.stored) : null;
            runs.push({
              run,
              ok: done.importStatus === "completed",
              finalStatus: done.importStatus,
              ...(done.importStatus === "completed"
                ? {}
                : {
                    message:
                      extractedRows === 0
                        ? "extraction returned 0 rows"
                        : `import ended ${done.importStatus}`,
                  }),
              ms: Date.now() - started,
              extractedRows,
              failedPages,
              usage: since(beforeRun),
              ...back,
              score,
              totalDiffPct: reference?.total
                ? pctDiff(back.total, reference.total)
                : null,
              scopeDiffPct: Object.fromEntries(
                Object.entries(reference?.scopes ?? {}).map(
                  ([scope, value]) => [
                    scope,
                    pctDiff(back.byScope[scope] ?? 0, value),
                  ],
                ),
              ),
            });
          } catch (error) {
            runs.push({
              run,
              ok: false,
              ms: Date.now() - started,
              usage: since(beforeRun),
              message: (error as Error).message,
            });
          }
        }

        const totals = runs
          .filter((entry) => entry.ok)
          .map((entry) => Math.round(entry.total as number));
        results.push({
          id: file.id,
          file: fileName,
          kind,
          targetYear,
          keyId: key?.id ?? null,
          reference: file.reference ?? null,
          ocr: ocrResult?.stage ?? null,
          ocrUsage,
          // When true, a user would see a failed import: the runs below measure the extraction on the raw OCR text only.
          productFlowFailsAtOcr: ocrResult ? !ocrResult.stage.ok : false,
          runs,
          stableTotal: totals.length > 1 && new Set(totals).size === 1,
        });
      }

      // One folder per run (report.md, results.json, per-case inputs) so the team
      // can read the outcome from the PR without running anything.
      const extractionModel =
        process.env.LLM_EXTRACTION_MODEL || process.env.LLM_MODEL;
      const modelPrices = extractionModel
        ? config.modelPrices?.[extractionModel]
        : undefined;
      const artifactDir = writeRunArtifact({
        root: outDir,
        summary: {
          measuredAt: new Date().toISOString(),
          ...gitInfo(),
          llmModel: process.env.LLM_MODEL,
          extractionModel,
          reasoningEffort: process.env.LLM_EXTRACTION_REASONING_EFFORT || null,
          prices: { ...config.prices, ...modelPrices },
          ocrModel: process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest",
          runsPerFile: config.runs,
          heldOut: config.heldOut,
          results: results as CaseResult[],
        },
        inputs: config.files.map((file) => ({
          id: file.id,
          path: file.path,
          key: answerKeys?.files[file.id] ?? null,
        })),
        publishInputs: config.publishInputs === true,
      });
      console.log(`Ingestion accuracy artifact: ${artifactDir}`);
      expect(results.length).toBe(config.files.length);
    },
    TEST_TIMEOUT_MS,
  );
});
