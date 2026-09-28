/**
 * @swagger
 * /api/v1/admin/bulk-inventory-import:
 *   get:
 *     tags:
 *       - admin
 *     operationId: getBulkInventoryImportLatestJob
 *     summary: Get the latest bulk inventory-file import job for a project
 *     description: Returns the most recent BulkInventoryImportJob for the project plus per-status item counts. Requires an admin session. Does not include per-file items; use GET /api/v1/admin/bulk-inventory-import/{jobId} for that.
 *     parameters:
 *       - in: query
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Latest job and item roll-up, or null when the project has no jobs
 *       400:
 *         description: Missing or invalid projectId
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 *   post:
 *     tags:
 *       - admin
 *     operationId: enqueueBulkInventoryImport
 *     summary: Upload a zip of inventory files and enqueue a bulk import job
 *     description: Stores the zip (S3 when configured), matches inner xlsx/csv files to cities in the project, and inserts job items. Does not import activity rows. Returns 202 with jobId and counts.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [projectId, year, file]
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               year:
 *                 type: integer
 *               file:
 *                 type: string
 *                 format: binary
 *               dryRun:
 *                 type: boolean
 *                 description: Validate and match only. Does not write ActivityValue rows or create city/inventory shells.
 *               createMissingCities:
 *                 type: boolean
 *               replaceExisting:
 *                 type: boolean
 *               inventoryType:
 *                 type: string
 *                 enum: [gpc_basic, gpc_basic_plus]
 *               gwp:
 *                 type: string
 *                 enum: [AR5, AR6, ar5, ar6]
 *               countryLocode:
 *                 type: string
 *                 description: Optional ISO-2 country to scope OpenClimate city name search (e.g. BR, CL)

 *     responses:
 *       202:
 *         description: Job enqueued
 *       400:
 *         description: Invalid zip or fields
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found
 */
import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import {
  BulkInventoryImportJobService,
  serializeJob,
} from "@/backend/BulkInventoryImportJobService";
import { BulkInventoryImportEnqueueService } from "@/backend/BulkInventoryImportEnqueueService";
import { BulkInventoryImportWorkerService } from "@/backend/BulkInventoryImportWorkerService";
import { db } from "@/models";
import { after, NextResponse } from "next/server";
import createHttpError from "http-errors";
import { z } from "zod";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { logger } from "@/services/logger";

/** Unpacking a Chile-sized zip of eCRF files can exceed the default 30s. */
export const maxDuration = 120;

const querySchema = z.object({
  projectId: z.string().uuid(),
});

const enqueueFieldsSchema = z.object({
  projectId: z.string().uuid(),
  year: z.coerce.number().int().min(1990).max(2100),
  dryRun: z.boolean().optional(),
  createMissingCities: z.boolean().optional(),
  replaceExisting: z.boolean().optional(),
  inventoryType: z.nativeEnum(InventoryTypeEnum).optional(),
  gwp: z
    .enum(["AR5", "AR6", "ar5", "ar6"])
    .optional()
    .transform((value) =>
      value
        ? (value.toLowerCase() as GlobalWarmingPotentialTypeEnum)
        : undefined,
    ),
  countryLocode: z
    .string()
    .optional()
    .transform((value) => {
      const text = (value ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
      if (text.length < 2) return undefined;
      return text.slice(0, 2);
    }),
});

function parseFlag(value: FormDataEntryValue | null): boolean {
  if (value == null || value === "") return false;
  const text = String(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
}

export const GET = apiHandler(async (_req, { session, searchParams }) => {
  UserService.ensureIsAdmin(session);

  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    throw new createHttpError.BadRequest("projectId is required");
  }
  const { projectId } = parsed.data;

  const project = await db.models.Project.findByPk(projectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  const latest =
    await BulkInventoryImportJobService.getLatestJobWithRollup(projectId);
  if (!latest) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({
    data: serializeJob(latest.job, latest.counts),
  });
});

export const POST = apiHandler(async (req, { session }) => {
  UserService.ensureIsAdmin(session);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new createHttpError.BadRequest("file is required");
  }

  const parsed = enqueueFieldsSchema.safeParse({
    projectId: form.get("projectId"),
    year: form.get("year"),
    dryRun: parseFlag(form.get("dryRun")),
    createMissingCities: parseFlag(form.get("createMissingCities")),
    replaceExisting: parseFlag(form.get("replaceExisting")),
    inventoryType: form.get("inventoryType") || undefined,
    gwp: form.get("gwp") || undefined,
    countryLocode: form.get("countryLocode") || undefined,
  });
  if (!parsed.success) {
    throw new createHttpError.BadRequest("projectId and year are required");
  }

  const zipBuffer = Buffer.from(await file.arrayBuffer());
  const result = await BulkInventoryImportEnqueueService.enqueue({
    projectId: parsed.data.projectId,
    year: parsed.data.year,
    zipBuffer,
    zipFileName: file.name || "upload.zip",
    userId: session!.user.id,
    dryRun: parsed.data.dryRun,
    createMissingCities: parsed.data.createMissingCities,
    replaceExisting: parsed.data.replaceExisting,
    inventoryType: parsed.data.inventoryType,
    gwp: parsed.data.gwp,
    countryLocode: parsed.data.countryLocode,
  });

  // k8s cron is every minute; local `next dev` has no cron. Drain this job
  // after the 202 so pending files do not sit idle waiting for a cron tick.
  after(async () => {
    try {
      await BulkInventoryImportWorkerService.processDueJobs(
        undefined,
        result.jobId,
      );
    } catch (err) {
      logger.error(
        { err, jobId: result.jobId },
        "Failed to start bulk inventory import worker after enqueue",
      );
    }
  });

  return NextResponse.json({ data: result }, { status: 202 });
});
