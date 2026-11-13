/**
 * @swagger
 * /api/v1/city/{city}/inventory/{inventory}/import/{importedFileId}/source-checks:
 *   patch:
 *     tags:
 *       - city
 *       - inventory
 *       - import
 *     operationId: updateImportSourceChecks
 *     summary: Answer the source checks of an extracted PDF import.
 *     description: |
 *       Applies the user's reading of the unit and of the number format to the
 *       rows already stored, without re-running extraction, recomputes
 *       importedSum, and marks the answered checks confirmed. Row decisions on
 *       rows whose values changed are cleared. A total answer confirms a printed
 *       candidate, a typed total (origin user), or no total (skip, only when the
 *       document printed none). Only valid while the import waits for approval.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: importedFileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: At least one key. Each key must answer a check the import has.
 *             properties:
 *               unit:
 *                 type: string
 *                 enum: [t, Mt]
 *               numberFormat:
 *                 type: string
 *                 enum: [english, european]
 *               total:
 *                 oneOf:
 *                   - type: object
 *                     required: [candidate]
 *                     properties:
 *                       candidate:
 *                         type: integer
 *                         minimum: 0
 *                         description: Index in sourceChecks.total.candidates.
 *                   - type: object
 *                     required: [value]
 *                     properties:
 *                       value:
 *                         type: number
 *                         description: Total typed by the user, not zero.
 *                   - type: object
 *                     required: [skip]
 *                     properties:
 *                       skip:
 *                         type: boolean
 *                         enum: [true]
 *                         description: No total; only when there are no candidates.
 *     responses:
 *       200:
 *         description: The updated extraction summary.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     extractionSummary:
 *                       type: object
 *                       additionalProperties: true
 *       400:
 *         description: |
 *           Invalid body, an answer to a check the import does not have, a
 *           candidate out of range, or the file is not waiting for approval.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Import file not found or access denied.
 *       409:
 *         description: |
 *           The import changed between the read and the write (another answer,
 *           an approval). Error code source-checks-conflict; refetch and retry.
 */

import UserService from "@/backend/UserService";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import type {
  ExtractionSummary,
  ReportedTotal,
} from "@/util/GHGI/extraction-summary";
import {
  applyReadings,
  sumImported,
  type ConfirmedTotal,
  type Readings,
  type SourceChecks,
} from "@/util/GHGI/source-checks";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

const sourceChecksBodySchema = z
  .object({
    unit: z.enum(["t", "Mt"]).optional(),
    numberFormat: z.enum(["english", "european"]).optional(),
    total: z
      .union([
        z.object({ candidate: z.number().int().min(0) }),
        z.object({
          value: z
            .number()
            .finite()
            .refine((v) => v !== 0),
        }),
        z.object({ skip: z.literal(true) }),
      ])
      .optional(),
  })
  .refine((b) => b.unit || b.numberFormat || b.total, {
    message: "Answer at least one check",
  });

const VALUE_KEYS = ["totalCO2e", "co2", "ch4", "n2o"] as const;

/** Indexes of stored rows whose total or gas values differ after conversion. */
function changedRowIndexes(
  before: ExtractedRow[],
  after: ExtractedRow[],
): Set<string> {
  const changed = new Set<string>();
  before.forEach((row, index) => {
    if (
      VALUE_KEYS.some(
        (key) => (row[key] ?? null) !== (after[index][key] ?? null),
      )
    )
      changed.add(String(index));
  });
  return changed;
}

/**
 * Row decisions without the changed rows. Stored overrides are either keyed
 * by row index or namespaced as `{ columnMappings, rowDecisions }`; both keys
 * are positions in `mappingConfiguration.rows`.
 */
function withoutDecisions(
  overrides: Record<string, unknown>,
  changed: Set<string>,
): Record<string, unknown> {
  const drop = (record: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(record).filter(([key]) => !changed.has(key)),
    );
  const namespaced =
    "columnMappings" in overrides || "rowDecisions" in overrides;
  if (!namespaced) return drop(overrides);
  const rowDecisions = overrides.rowDecisions;
  return rowDecisions && typeof rowDecisions === "object"
    ? {
        ...overrides,
        rowDecisions: drop(rowDecisions as Record<string, unknown>),
      }
    : overrides;
}

function sameTotal(a: ReportedTotal, b: ConfirmedTotal): boolean {
  return (
    a.value === b.value &&
    a.label === b.label &&
    (a.source ?? null) === (b.source ?? null) &&
    (a.page ?? null) === (b.page ?? null)
  );
}

function confirmedFrom(candidate: ReportedTotal): ConfirmedTotal {
  return {
    value: candidate.value,
    origin: "document",
    label: candidate.label,
    source: candidate.source ?? null,
    page: candidate.page ?? null,
  };
}

export const PATCH = apiHandler(async (req, { session, params }) => {
  if (!session) throw new createHttpError.Unauthorized("Not signed in");

  const cityId = z.string().uuid().parse(params.city);
  const inventoryId = z.string().uuid().parse(params.inventory);
  const importedFileId = z.string().uuid().parse(params.importedFileId);
  await UserService.findUserInventory(inventoryId, session);

  const importedFile = await db.models.ImportedInventoryFile.findOne({
    where: {
      id: importedFileId,
      inventoryId,
      cityId,
      userId: session.user.id,
    },
  });
  if (!importedFile) {
    throw new createHttpError.NotFound(
      "Imported file not found or access denied",
    );
  }
  if (importedFile.importStatus !== ImportStatusEnum.WAITING_FOR_APPROVAL) {
    throw new createHttpError.BadRequest(
      "Source checks can only be answered while the import waits for approval",
    );
  }

  const body = sourceChecksBodySchema.parse(await req.json());

  const mappingConfiguration = importedFile.mappingConfiguration || {};
  const summary = mappingConfiguration.extractionSummary as
    ExtractionSummary | undefined;
  const checks = summary?.sourceChecks;
  if (!summary || !checks) {
    throw new createHttpError.BadRequest("This import has no source checks");
  }
  for (const key of ["unit", "numberFormat", "total"] as const) {
    if (body[key] !== undefined && !checks[key]) {
      throw new createHttpError.BadRequest(
        `This import has no ${key} check to answer`,
      );
    }
  }

  // Always convert from the stored values with their current readings.
  const from: Readings = {
    unit: checks.unit?.reading ?? null,
    numberFormat: checks.numberFormat?.reading ?? null,
  };
  const to: Readings = {
    unit: body.unit ?? from.unit,
    numberFormat: body.numberFormat ?? from.numberFormat,
  };
  const storedRows = (mappingConfiguration.rows ?? []) as ExtractedRow[];
  const rows = applyReadings(storedRows, from, to);
  const reportedTotals = applyReadings(summary.reportedTotals ?? [], from, to);

  const nextChecks: SourceChecks = { ...checks };
  if (checks.unit && body.unit) {
    nextChecks.unit = {
      ...checks.unit,
      status: "confirmed",
      reading: body.unit,
    };
  }
  if (checks.numberFormat && body.numberFormat) {
    nextChecks.numberFormat = {
      ...checks.numberFormat,
      status: "confirmed",
      reading: body.numberFormat,
    };
  }
  if (checks.total) {
    const candidates = applyReadings(checks.total.candidates, from, to);
    let selected = checks.total.selected;
    let status = checks.total.status;
    if (body.total && "candidate" in body.total) {
      const candidate = candidates[body.total.candidate];
      if (!candidate) {
        throw new createHttpError.BadRequest("Total candidate out of range");
      }
      selected = confirmedFrom(candidate);
      status = "confirmed";
    } else if (body.total && "value" in body.total) {
      selected = { value: body.total.value, origin: "user" };
      status = "confirmed";
    } else if (body.total && "skip" in body.total) {
      if (candidates.length > 0) {
        throw new createHttpError.BadRequest(
          "A total can only be skipped when the document prints none",
        );
      }
      selected = null;
      status = "confirmed";
    } else if (selected?.origin === "document") {
      // A printed total confirmed earlier follows its candidate into the new reading.
      const index = checks.total.candidates.findIndex((c) =>
        sameTotal(c, selected!),
      );
      if (index >= 0) selected = confirmedFrom(candidates[index]);
    }
    nextChecks.total = { ...checks.total, candidates, selected, status };
  }

  const extractionSummary: ExtractionSummary = {
    ...summary,
    reportedTotals,
    importedSum: sumImported(rows),
    sourceChecks: nextChecks,
  };
  const overrides = mappingConfiguration.overrides as
    Record<string, unknown> | undefined;
  const changed = changedRowIndexes(storedRows, rows);

  // Optimistic guard, the same one approve uses to claim the file: the write
  // only lands on the version read above. A newer lastUpdated also makes a
  // concurrent approve's claim fail instead of importing the old rows.
  const readAt = importedFile.lastUpdated;
  const writtenAt = new Date(
    Math.max(Date.now(), (readAt?.getTime() ?? 0) + 1),
  );
  const [updated] = await db.models.ImportedInventoryFile.update(
    {
      mappingConfiguration: {
        ...mappingConfiguration,
        rows,
        extractionSummary,
        ...(overrides && changed.size > 0
          ? { overrides: withoutDecisions(overrides, changed) }
          : {}),
      },
      lastUpdated: writtenAt,
    },
    {
      where: {
        id: importedFile.id,
        importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
        lastUpdated: readAt,
      },
    },
  );
  if (!updated) {
    throw createHttpError(
      409,
      "The import changed while the answer was saved. Reload and answer again.",
      { code: "source-checks-conflict" },
    );
  }

  return NextResponse.json({ data: { extractionSummary } });
});
