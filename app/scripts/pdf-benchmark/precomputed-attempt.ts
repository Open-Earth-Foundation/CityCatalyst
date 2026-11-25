/**
 * Runs one attempt of one PDF case with rows from an external pipeline's
 * precomputed envelope (CC-1295): checks that the envelope was made from the
 * local PDF, uploads the PDF (no OCR, no extraction),
 * stores the mapped rows on the imported file the way the extraction worker
 * does, then approves, reads back and scores with the helpers of run-case.ts.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import {
  mapEnvelope,
  type MappedEnvelope,
} from "@/backend/ingestion-benchmark/pipelines/map-envelope";
import {
  checkSourcePdf,
  RowsDirError,
  type ReadEnvelope,
  type RowsDir,
} from "@/backend/ingestion-benchmark/pipelines/rows-dir";
import {
  pipelineCostUsd,
  type PipelineAttempt,
  type Prices,
  type RunEntry,
} from "@/backend/ingestion-benchmark/report";
import { scoringKey } from "@/backend/ingestion-benchmark/rescore";
import type { StoredValue } from "@/backend/ingestion-benchmark/score";
import {
  isParentReference,
  parentRefOverlap,
  scoreWithVariant,
} from "@/backend/ingestion-benchmark/scoring-variant";
import type { CaseManifestEntry } from "@/backend/ingestion-benchmark/selection";
import { ImportStatusEnum } from "@/util/enums";
import {
  approveImport,
  attemptClock,
  collectWarnings,
  getStatus,
  includeHeldRows,
  pdfPathFor,
  readBack,
  setUpImport,
  type RunContext,
} from "./run-case";

type FileDb = {
  models: Pick<RunContext["db"]["models"], "ImportedInventoryFile">;
};

/**
 * Stores precomputed rows on an uploaded PDF the way the extraction worker
 * does (PdfOcrService), so approve reads them as extracted rows. Returns false
 * when the file is no longer pending extraction.
 */
export async function markExtracted(
  db: FileDb,
  importedFileId: string,
  rows: ExtractedRow[],
): Promise<boolean> {
  const file = await db.models.ImportedInventoryFile.findByPk(importedFileId);
  const [updated] = await db.models.ImportedInventoryFile.update(
    {
      importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
      mappingConfiguration: { ...(file?.mappingConfiguration || {}), rows },
      rowCount: rows.length,
      errorLog: null,
      lastUpdated: new Date(),
    },
    {
      where: {
        id: importedFileId,
        importStatus: ImportStatusEnum.PENDING_AI_EXTRACTION,
      },
    },
  );
  return updated === 1;
}

/** Fails a pending file the way a failed extraction does. */
async function markFailed(
  db: FileDb,
  importedFileId: string,
  errorLog: string,
) {
  await db.models.ImportedInventoryFile.update(
    {
      importStatus: ImportStatusEnum.FAILED,
      errorLog,
      lastUpdated: new Date(),
    },
    {
      where: {
        id: importedFileId,
        importStatus: ImportStatusEnum.PENDING_AI_EXTRACTION,
      },
    },
  );
}

/**
 * Rows approve will skip, by issue code. Approve imports only rows without
 * errors (InventoryImportService), so these never reach the inventory.
 */
export function lostRowsByIssue(
  rows: { issue?: string; errors?: string[] }[],
): Record<string, number> {
  const lost: Record<string, number> = {};
  for (const row of rows) {
    if (!row.errors?.length) continue;
    const issue = row.issue ?? "unknown";
    lost[issue] = (lost[issue] ?? 0) + 1;
  }
  return lost;
}

/**
 * Checks the issue counts against approve's own skipped-row count. The counts
 * come from the import result before the held-row decisions; a gap either way
 * is recorded (`unexplained`: approve skipped more, `notSkipped`: fewer)
 * rather than hidden.
 */
export function reconcileLostRows(
  lost: Record<string, number>,
  skippedRows: unknown,
): Record<string, number> {
  if (typeof skippedRows !== "number") return lost;
  const counted = Object.values(lost).reduce((sum, n) => sum + n, 0);
  if (skippedRows > counted)
    return { ...lost, unexplained: skippedRows - counted };
  if (skippedRows < counted)
    return { ...lost, notSkipped: counted - skippedRows };
  return lost;
}

/**
 * The mapped rows with an unsplit I/II/III subsector reference that approve did
 * not store (it drops them as gpc-reference-unknown), as stored values for the
 * score variant. A row with neither a value nor a notation key is left out.
 */
export function droppedParentRefRows(
  rows: ExtractedRow[],
  stored: StoredValue[],
): StoredValue[] {
  const storedRefs = new Set(stored.map((value) => value.gpc));
  return rows.flatMap((row) => {
    const ref = row.gpcRefNo;
    if (!ref || !isParentReference(ref) || storedRefs.has(ref)) return [];
    if (row.totalCO2e === null && !row.notationKey) return [];
    return [
      {
        gpc: ref,
        scope: row.scope ?? null,
        valueT: row.totalCO2e ?? 0,
        omit: false,
        notation: row.notationKey ?? null,
      },
    ];
  });
}

/** What the run entry records about the envelope; tallies stay empty when its rows were not mapped. */
function pipelineAttempt(
  envelope: ReadEnvelope,
  mapped: MappedEnvelope,
  lostRows: Record<string, number>,
  prices: Prices,
  sourcePdf: "verified" | "unverified",
): PipelineAttempt {
  const { data } = envelope;
  const counts =
    "failure" in mapped
      ? {
          executionStatus: envelope.executionStatus,
          rowsInEnvelope: data.rows.length,
          unknownRowRoles: {},
          droppedRows: {},
          rowRoles: {},
          scopeBasis: {},
          totalInclusion: {},
          reported: {
            totalT: data.reported_total_tco2e,
            grossT: data.reported_gross_total_tco2e,
            netT: data.reported_net_total_tco2e,
            removalsT: data.reported_removals_tco2e,
            totalBasis: data.total_basis,
            totalKind: data.total_kind,
          },
        }
      : mapped.attempt;
  return {
    ...counts,
    ...pipelineCostUsd(envelope, prices),
    usage: envelope.usage,
    lostRows,
    sourcePdf,
  };
}

/**
 * One attempt with rows from a precomputed envelope: upload (no OCR, no
 * extraction), store the rows, approve, read back and score.
 */
export async function runPrecomputedAttempt(
  ctx: RunContext,
  entry: CaseManifestEntry,
  key: KeyFile,
  attempt: number,
  rowsDir: RowsDir,
  prices: Prices,
): Promise<RunEntry> {
  const { stageMs, finish } = attemptClock(attempt);

  // A missing or invalid envelope fails the attempt before anything is uploaded.
  let envelope: ReadEnvelope;
  try {
    envelope = rowsDir.get(entry.id, attempt);
  } catch (error) {
    const code = error instanceof RowsDirError ? error.code : undefined;
    const missing = code === "missing_entry";
    return finish({
      // An envelope the pipeline wrote badly is its failure; a missing, duplicate
      // or tampered file is the setup's.
      failureMode:
        code === "invalid_envelope" ? "extraction_error" : "setup_error",
      message: (error as Error).message,
      ...(missing ? { missingEnvelope: true as const } : {}),
    });
  }
  const pdfPath = pdfPathFor(ctx.config, entry);
  if (!pdfPath) {
    return finish({
      failureMode: "setup_error",
      message: `PDF not found: ${entry.fileName}`,
    });
  }
  const buffer = readFileSync(pdfPath);
  // Hashes the bytes about to be uploaded, so the check covers exactly what is scored.
  let sourcePdf: "verified" | "unverified";
  try {
    sourcePdf = checkSourcePdf(
      envelope,
      createHash("sha256").update(buffer).digest("hex"),
      entry.id,
      attempt,
    );
  } catch (error) {
    // Rows from another edition of the document are the setup's failure, not the pipeline's.
    return finish({
      failureMode: "setup_error",
      message: (error as Error).message,
    });
  }
  const mapped = mapEnvelope(envelope);

  let stage: "setup" | "approve" | "readback" = "setup";
  let warnings: string[] = [];
  let extractedRows = 0;
  let heldRowsIncluded = 0;
  let lostRows: Record<string, number> = {};
  const base = () => ({
    warnings,
    extractedRows,
    heldRowsIncluded,
    pipeline: pipelineAttempt(envelope, mapped, lostRows, prices, sourcePdf),
  });
  try {
    const { ids, importedFileId } = await setUpImport(ctx, entry, attempt, {
      buffer,
      path: pdfPath,
    });
    const uploaded =
      await ctx.db.models.ImportedInventoryFile.findByPk(importedFileId);
    if (uploaded?.s3Key) ctx.uploadedKeys.push(uploaded.s3Key);

    if ("failure" in mapped) {
      await markFailed(ctx.db, importedFileId, mapped.message);
      return finish({
        ...base(),
        failureMode: mapped.failure,
        message: mapped.message,
      });
    }
    if (mapped.rows.length === 0) {
      const reason =
        envelope.data.rows.length === 0
          ? "envelope-without-rows"
          : "no-importable-rows";
      await markFailed(ctx.db, importedFileId, reason);
      return finish({
        ...base(),
        failureMode: "zero_rows",
        zeroRowsReason: reason,
        message: reason,
      });
    }
    if (!(await markExtracted(ctx.db, importedFileId, mapped.rows))) {
      throw new Error("imported file is no longer pending_ai_extraction");
    }
    extractedRows = mapped.rows.length;
    const state = await getStatus(ctx, ids, importedFileId);
    warnings = collectWarnings(state.json?.data);

    stage = "approve";
    const importStarted = Date.now();
    const held = await includeHeldRows(ctx, importedFileId);
    heldRowsIncluded = held.included;
    lostRows = lostRowsByIssue(held.importRows);
    const done = await approveImport(ctx, ids, importedFileId, held);
    stageMs.import = Date.now() - importStarted;
    lostRows = reconcileLostRows(
      lostRows,
      done.json?.data?.validationResults_legacy?.importSummary?.skippedRows,
    );
    if (done.importStatus !== ImportStatusEnum.COMPLETED) {
      const errorLog = done.json?.data?.errorLog as string | null | undefined;
      return finish({
        ...base(),
        failureMode: "approve_error",
        message: `import ended ${done.importStatus}${errorLog ? `: ${errorLog.slice(0, 160)}` : ""}`,
      });
    }

    stage = "readback";
    const back = await readBack(ctx, ids.inventory);
    const parentRefRows = droppedParentRefRows(mapped.rows, back.stored);
    const scores = scoreWithVariant(
      scoringKey(key, entry.totalOnly),
      back.stored,
      parentRefRows,
    );
    const recorded = base();
    return finish({
      ...recorded,
      pipeline: {
        ...recorded.pipeline,
        parentRefRows,
        parentRefOverlap: parentRefOverlap(parentRefRows, back.stored),
        variantScore: scores.parentRefs,
      },
      failureMode: "scored",
      stored: back.stored,
      score: scores.standard,
      total: back.total,
    });
  } catch (error) {
    return finish({
      ...base(),
      failureMode:
        stage === "approve"
          ? "approve_error"
          : stage === "readback"
            ? "readback_error"
            : "setup_error",
      message: (error as Error).message,
    });
  }
}
