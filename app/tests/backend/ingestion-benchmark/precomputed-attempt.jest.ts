import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import {
  RowsDirError,
  type EnvelopeRow,
  type ReadEnvelope,
  type RowsDir,
} from "@/backend/ingestion-benchmark/pipelines/rows-dir";
import {
  incompleteRun,
  type CaseResult,
} from "@/backend/ingestion-benchmark/report";
import type { CaseManifestEntry } from "@/backend/ingestion-benchmark/selection";
import { ImportStatusEnum } from "@/util/enums";
import {
  lostRowsByIssue,
  markExtracted,
  reconcileLostRows,
  runPrecomputedAttempt,
} from "../../../scripts/pdf-benchmark/precomputed-attempt";
import type { RunContext } from "../../../scripts/pdf-benchmark/run-case";

const row = (over: Partial<EnvelopeRow> = {}): EnvelopeRow => ({
  source_label: "Synthetic label",
  gpc_ref: "I.1.1",
  scope: 1,
  emissions_tco2e: 10,
  notation_key: null,
  row_role: "emission",
  total_inclusion: "included",
  scope_basis: "explicit",
  ...over,
});

const envelope = (
  rows: EnvelopeRow[],
  over: Partial<ReadEnvelope> = {},
): ReadEnvelope => ({
  data: {
    reporting_year: 2020,
    reported_total_tco2e: 100,
    total_basis: null,
    reported_gross_total_tco2e: null,
    reported_net_total_tco2e: null,
    reported_removals_tco2e: null,
    total_kind: "gross",
    reconciliation_tolerance_tco2e: null,
    rows,
  },
  usage: { input_tokens: 3 },
  executionStatus: "completed",
  info: {
    id: "precomputed",
    study: "s",
    stage: "t",
    mode: null,
    version: null,
  },
  costUsd: 0.5,
  ...over,
});

const rowsDirOf = (get: RowsDir["get"]): RowsDir => ({
  info: { study: "s", stage: "t" },
  get,
});

type Update = {
  values: Record<string, unknown>;
  where: Record<string, unknown>;
};

/** An in-memory ImportedInventoryFile row; update honours the where clause. */
function fakeFileModel(importStatus: string, mappingConfiguration = {}) {
  const state = { importStatus, mappingConfiguration, s3Key: null };
  const updates: Update[] = [];
  return {
    state,
    updates,
    model: {
      findByPk: async () => state,
      update: async (
        values: Record<string, unknown>,
        options: { where: Record<string, unknown> },
      ) => {
        updates.push({ values, where: options.where });
        const matches =
          options.where.importStatus === undefined ||
          options.where.importStatus === state.importStatus;
        if (matches) Object.assign(state, values);
        return [matches ? 1 : 0];
      },
    },
  };
}

let pdfDir: string;
const entry: CaseManifestEntry = {
  id: "C-T1",
  city: "Synthetic",
  country: "Test",
  year: 2020,
  block: "dev",
  totalOnly: false,
  textTables: true,
  fileName: "synthetic.pdf",
};
const key = { id: "C-T1" } as KeyFile;

beforeAll(() => {
  pdfDir = fs.mkdtempSync(path.join(os.tmpdir(), "precomputed-attempt-"));
  fs.writeFileSync(path.join(pdfDir, entry.fileName), "%PDF-1.4 synthetic");
});
afterAll(() => fs.rmSync(pdfDir, { recursive: true, force: true }));

/** A context whose city, inventory and upload are fakes; the file starts pending extraction. */
function fakeContext(
  fileStatus: string = ImportStatusEnum.PENDING_AI_EXTRACTION,
) {
  const file = fakeFileModel(fileStatus);
  const seen = { cityCreates: 0, uploads: 0, cityIdsAtUpload: [] as string[] };
  const ctx = {
    db: {
      models: {
        City: {
          create: async (values: { cityId: string }) => {
            seen.cityCreates++;
            return { cityId: values.cityId, addUser: async () => undefined };
          },
        },
        Inventory: {
          create: async (values: { inventoryId: string }) => ({
            inventoryId: values.inventoryId,
          }),
        },
        ImportedInventoryFile: file.model,
      },
    },
    routes: {
      upload: {
        POST: async () => {
          seen.uploads++;
          seen.cityIdsAtUpload = [...ctx.cityIds];
          return Response.json({ data: { id: "file-1" } }, { status: 202 });
        },
      },
    },
    config: { pdfDir, answerKeys: "", outRoot: "" },
    ocrRuns: new Map(),
    ocrTexts: new Map(),
    uploadedKeys: [] as string[],
    cityIds: [] as string[],
    importedFileIds: [] as string[],
    restoreAuth: () => undefined,
    cleanedUp: false,
  };
  return { ctx: ctx as unknown as RunContext, raw: ctx, file, seen };
}

describe("markExtracted", () => {
  it("returns false when the file is no longer pending extraction", async () => {
    const file = fakeFileModel(ImportStatusEnum.WAITING_FOR_APPROVAL);
    const db = { models: { ImportedInventoryFile: file.model } };
    const ok = await markExtracted(db as never, "file-1", []);
    expect(ok).toBe(false);
    expect(file.updates[0].where).toEqual({
      id: "file-1",
      importStatus: ImportStatusEnum.PENDING_AI_EXTRACTION,
    });
  });

  it("stores the rows, keeps the existing mapping and waits for approval", async () => {
    const file = fakeFileModel(ImportStatusEnum.PENDING_AI_EXTRACTION, {
      earlier: true,
    });
    const db = { models: { ImportedInventoryFile: file.model } };
    const rows = [{ gpcRefNo: "I.1.1" }, { gpcRefNo: "I.2.1" }];
    const ok = await markExtracted(db as never, "file-1", rows as never);
    expect(ok).toBe(true);
    const { values } = file.updates[0];
    expect(values).toMatchObject({
      importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
      mappingConfiguration: { earlier: true, rows },
      rowCount: 2,
      errorLog: null,
    });
    expect(values.lastUpdated).toBeInstanceOf(Date);
  });
});

describe("runPrecomputedAttempt", () => {
  it("maps a rows-folder error to setup_error before any upload", async () => {
    const { ctx, seen } = fakeContext();
    const rows = rowsDirOf(() => {
      throw new RowsDirError("missing_entry", "case C-T1 attempt 1");
    });
    const run = await runPrecomputedAttempt(ctx, entry, key, 1, rows);
    expect(run.failureMode).toBe("setup_error");
    expect(run.message).toContain("missing_entry");
    expect(run.missingEnvelope).toBe(true);
    expect(seen.cityCreates).toBe(0);
    expect(seen.uploads).toBe(0);
  });

  it("marks only a missing envelope, not other rows-folder errors", async () => {
    const { ctx } = fakeContext();
    const rows = rowsDirOf(() => {
      throw new RowsDirError("hash_mismatch", "case C-T1 attempt 1");
    });
    const run = await runPrecomputedAttempt(ctx, entry, key, 1, rows);
    expect(run.failureMode).toBe("setup_error");
    expect(run.missingEnvelope).toBeUndefined();
  });

  it("gives setup_error when the rows cannot be stored on the file", async () => {
    const { ctx, file } = fakeContext(ImportStatusEnum.WAITING_FOR_APPROVAL);
    const run = await runPrecomputedAttempt(
      ctx,
      entry,
      key,
      1,
      rowsDirOf(() => envelope([row()])),
    );
    expect(run.failureMode).toBe("setup_error");
    expect(run.message).toContain("no longer pending_ai_extraction");
    expect(file.state.importStatus).toBe(ImportStatusEnum.WAITING_FOR_APPROVAL);
  });

  it("maps a mapping failure to extraction_error and fails the file", async () => {
    const { ctx, file } = fakeContext();
    const rows = rowsDirOf(() =>
      envelope([row()], { executionStatus: "failed" }),
    );
    const run = await runPrecomputedAttempt(ctx, entry, key, 1, rows);
    expect(run.failureMode).toBe("extraction_error");
    expect(run.message).toContain("execution status failed");
    expect(run.stageMs.ocr).toBeNull();
    expect(run.stageMs.extraction).toBeNull();
    expect(file.state.importStatus).toBe(ImportStatusEnum.FAILED);
    expect(run.pipeline).toMatchObject({
      executionStatus: "failed",
      costUsd: 0.5,
      costSource: "envelope",
    });
  });

  it("maps an envelope without importable rows to zero_rows and fails the file", async () => {
    const { ctx, file } = fakeContext();
    const rows = rowsDirOf(() =>
      envelope([row({ row_role: "information" })], { costUsd: null }),
    );
    const run = await runPrecomputedAttempt(ctx, entry, key, 1, rows);
    expect(run.failureMode).toBe("zero_rows");
    expect(run.zeroRowsReason).toBe("no-importable-rows");
    expect(run.extractedRows).toBe(0);
    expect(file.state.importStatus).toBe(ImportStatusEnum.FAILED);
    expect(file.updates.at(-1)?.where).toEqual({
      id: "file-1",
      importStatus: ImportStatusEnum.PENDING_AI_EXTRACTION,
    });
    expect(run.pipeline).toMatchObject({
      rowsInEnvelope: 1,
      droppedRows: { information: 1 },
      costUsd: null,
      costSource: "none",
      usage: { input_tokens: 3 },
      lostRows: {},
    });
  });

  it("registers its test city before the upload", async () => {
    const { ctx, raw, seen } = fakeContext();
    const rows = rowsDirOf(() => envelope([]));
    await runPrecomputedAttempt(ctx, entry, key, 1, rows);
    expect(seen.uploads).toBe(1);
    expect(seen.cityIdsAtUpload).toHaveLength(1);
    expect(seen.cityIdsAtUpload).toEqual(raw.cityIds);
    expect(raw.importedFileIds).toEqual(["file-1"]);
  });
});

describe("lostRowsByIssue", () => {
  it("counts the rows approve skips by issue code", () => {
    expect(
      lostRowsByIssue([
        { issue: "gpc-reference-unknown", errors: ["not in taxonomy"] },
        { issue: "gpc-reference-unknown", errors: ["not in taxonomy"] },
        { errors: ["no code"] },
        { issue: "outside-inventory-type" },
        { errors: [] },
      ]),
    ).toEqual({ "gpc-reference-unknown": 2, unknown: 1 });
  });
});

describe("reconcileLostRows", () => {
  const lost = { "gpc-reference-unknown": 2 };
  it("keeps the counts when approve skipped the same number", () => {
    expect(reconcileLostRows(lost, 2)).toEqual(lost);
  });
  it("flags rows approve skipped beyond the counted ones", () => {
    expect(reconcileLostRows(lost, 3)).toEqual({ ...lost, unexplained: 1 });
  });
  it("flags counted rows approve did not skip", () => {
    expect(reconcileLostRows(lost, 1)).toEqual({ ...lost, notSkipped: 1 });
  });
  it("leaves the counts alone without a skipped count", () => {
    expect(reconcileLostRows(lost, undefined)).toEqual(lost);
  });
});

describe("incompleteRun", () => {
  const result = (id: string, missingEnvelope?: true) =>
    ({
      id,
      runs: [
        {
          run: 1,
          failureMode: missingEnvelope ? "setup_error" : "scored",
          ...(missingEnvelope ? { missingEnvelope } : {}),
        },
      ],
    }) as unknown as CaseResult;

  it("marks a run with a missing envelope incomplete, without --all", () => {
    expect(
      incompleteRun({
        all: false,
        missing: [],
        unfinished: [],
        results: [result("C-T1"), result("C-T2", true)],
      }),
    ).toEqual({
      missing: [{ id: "C-T2", reason: "no envelope in the rows folder" }],
      unfinished: [],
    });
  });

  it("leaves a complete run, and a built-in run outside --all, unmarked", () => {
    expect(
      incompleteRun({
        all: false,
        missing: [],
        unfinished: ["C-T1"],
        results: [result("C-T1")],
      }),
    ).toBeUndefined();
  });

  it("keeps the --all rule for missing inputs and unfinished cases", () => {
    const missing = [{ id: "C-T3", reason: "PDF not found" }];
    expect(
      incompleteRun({
        all: true,
        missing,
        unfinished: ["C-T1"],
        results: [result("C-T1")],
      }),
    ).toEqual({ missing, unfinished: ["C-T1"] });
  });
});
