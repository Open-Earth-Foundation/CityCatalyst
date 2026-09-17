/**
 * IMP-003 / IMP-005: a job and items can be created and listed by an admin
 * session; a small zip enqueues items without writing activity rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import { db } from "@/models";
import { Roles } from "@/util/types";
import {
  BulkInventoryImportItemStatus,
  BulkInventoryImportJobStatus,
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { DEFAULT_PROJECT_ID } from "@/util/constants";
import {
  BulkInventoryImportJobService,
  serializeJob,
  serializeItem,
} from "@/backend/BulkInventoryImportJobService";
import { BulkInventoryImportEnqueueService } from "@/backend/BulkInventoryImportEnqueueService";
import { createBulkInventoryImportZip } from "@/backend/BulkInventoryImportZip";
import UserService from "@/backend/UserService";

const testUserID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";
const adminSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};
const userSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};

async function getLatestJobAsAdmin(projectId: string) {
  UserService.ensureIsAdmin(adminSession as never);
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
}

async function getJobAsAdmin(jobId: string, status?: string) {
  UserService.ensureIsAdmin(adminSession as never);
  const result = await BulkInventoryImportJobService.getJobWithRollup(jobId);
  if (!result) {
    throw new createHttpError.NotFound("Job not found");
  }
  const items = status
    ? result.items.filter((item) => item.status === status)
    : result.items;
  return NextResponse.json({
    data: {
      ...serializeJob(result.job, result.counts),
      items: items.map(serializeItem),
    },
  });
}

describe("Admin bulk inventory import job API", () => {
  let jobId: string;
  let failedItemId: string;
  let enqueuedJobId: string;
  const createdCityIds: string[] = [];
  const PREFIX = `XX_IMP005_${randomUUID().slice(0, 8)}_`;

  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    await db.initialize();
    await db.models.User.upsert({
      userId: testUserID,
      name: "Test User",
      email: "test@example.com",
      role: Roles.Admin,
    });
  });

  afterAll(async () => {
    const jobIds = [jobId, enqueuedJobId].filter(Boolean);
    if (jobIds.length) {
      await db.models.BulkInventoryImportJob.destroy({
        where: { id: jobIds },
      });
    }
    if (createdCityIds.length) {
      await db.models.Inventory.destroy({
        where: { cityId: createdCityIds },
      });
      await db.models.City.destroy({ where: { cityId: createdCityIds } });
    }
    if (db.sequelize) await db.sequelize.close();
  });

  it("creates a job and items that an admin can list", async () => {
    const job = await db.models.BulkInventoryImportJob.create({
      id: randomUUID(),
      projectId: DEFAULT_PROJECT_ID,
      year: 2023,
      userId: testUserID,
      status: BulkInventoryImportJobStatus.PENDING,
      totalCount: 2,
      dryRun: false,
      createMissingCities: false,
      replaceExisting: false,
    });
    jobId = job.id;

    const failed = await db.models.BulkInventoryImportItem.create({
      jobId,
      originalFileName: "Nowhere_CRFFormat_2023_20260917.xlsx",
      status: BulkInventoryImportItemStatus.UNMATCHED,
      errorCode: "unmatched_city",
      errorLog: "No city in project matched this file",
      resolvedYear: 2023,
    });
    failedItemId = failed.id;

    await db.models.BulkInventoryImportItem.create({
      jobId,
      originalFileName: "CL-IQQ-2023.xlsx",
      status: BulkInventoryImportItemStatus.MATCHED,
      locode: "CL IQQ",
      resolvedYear: 2023,
    });

    const listRes = await getLatestJobAsAdmin(DEFAULT_PROJECT_ID);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.data.id).toBe(jobId);
    expect(listBody.data.status).toBe("pending");
    expect(listBody.data.counts.total).toBe(2);
    expect(listBody.data.counts.matched).toBe(1);
    expect(listBody.data.counts.unmatched).toBe(1);
    expect(listBody.data.items).toBeUndefined();

    const detailRes = await getJobAsAdmin(jobId);
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.data.items).toHaveLength(2);
    expect(
      detailBody.data.items.map(
        (item: { originalFileName: string }) => item.originalFileName,
      ),
    ).toEqual(["CL-IQQ-2023.xlsx", "Nowhere_CRFFormat_2023_20260917.xlsx"]);

    const filteredRes = await getJobAsAdmin(jobId, "unmatched");
    expect(filteredRes.status).toBe(200);
    const filteredBody = await filteredRes.json();
    expect(filteredBody.data.items).toHaveLength(1);
    expect(filteredBody.data.items[0].id).toBe(failedItemId);
    expect(filteredBody.data.counts.total).toBe(2);
  });

  it("rejects non-admin sessions", () => {
    expect(() => UserService.ensureIsAdmin(userSession as never)).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it("returns 404 for an unknown job", async () => {
    await expect(
      getJobAsAdmin("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("enqueues a 3-file zip without writing activity rows", async () => {
    const alphaName = `${PREFIX}Alpha`;
    const betaName = `${PREFIX}Beta`;
    const alpha = await db.models.City.create({
      cityId: randomUUID(),
      name: alphaName,
      projectId: DEFAULT_PROJECT_ID,
    });
    const beta = await db.models.City.create({
      cityId: randomUUID(),
      name: betaName,
      projectId: DEFAULT_PROJECT_ID,
    });
    createdCityIds.push(alpha.cityId, beta.cityId);

    await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: alpha.cityId,
      inventoryName: `${alphaName} 2023`,
      year: 2023,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: beta.cityId,
      inventoryName: `${betaName} 2023`,
      year: 2023,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });

    const zip = await createBulkInventoryImportZip({
      [`${alphaName}_CRFFormat_2023_20260917.csv`]: "sector,value\nI,1\n",
      [`${betaName}_CRFFormat_2023_20260917.csv`]: "sector,value\nI,2\n",
      [`${PREFIX}Ghost_CRFFormat_2023_20260917.csv`]: "sector,value\nI,3\n",
    });

    const result = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2023,
      zipBuffer: zip,
      zipFileName: "chile-sample.zip",
      userId: testUserID,
    });
    enqueuedJobId = result.jobId;

    expect(result.itemCount).toBe(3);
    expect(result.unmatchedCount).toBe(1);

    const listed = await getJobAsAdmin(result.jobId);
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.data.items).toHaveLength(3);
    expect(body.data.status).toBe("pending");
    expect(body.data.counts.pending).toBe(2);
    expect(body.data.counts.unmatched).toBe(1);

    const inventoryIds = body.data.items
      .map((item: { inventoryId: string | null }) => item.inventoryId)
      .filter(Boolean);
    const inventoryValues = await db.models.InventoryValue.findAll({
      where: { inventoryId: inventoryIds },
      attributes: ["id"],
    });
    const activityCount = await db.models.ActivityValue.count({
      where: {
        inventoryValueId: inventoryValues.map((value) => value.id),
      },
    });
    expect(activityCount).toBe(0);
  });
});
