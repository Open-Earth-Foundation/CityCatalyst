import env from "@next/env";
import { randomUUID } from "node:crypto";
import type { Transaction } from "sequelize";
import { db } from "@/models";
import { ACTION_TYPES, HighImpactActionRankingStatus } from "@/util/types";
import { OrganizationPlanType } from "@/util/enums";

const FIXTURE_PREFIX = "ZZ-CC752-LOAD";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000752";
const PROJECT_ID = "00000000-0000-4000-8000-000000000753";
const CITY_ID = "00000000-0000-4000-8000-000000000754";
const INVENTORY_ID = "00000000-0000-4000-8000-000000000755";

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function jsonPayload(bytes: number, index: number): Record<string, unknown> {
  return {
    fixture: "cc-752-hiap-load-test",
    index,
    content: "x".repeat(bytes),
  };
}

async function resetFixture(transaction: Transaction): Promise<void> {
  await db.sequelize!.query(
    `DELETE FROM "NativeInputCatalog" WHERE inventory_id = '${INVENTORY_ID}'`,
    { transaction },
  );
  await db.sequelize!.query(
    `DELETE FROM "ActionPlan" WHERE city_locode LIKE '${FIXTURE_PREFIX}-%'`,
    { transaction },
  );
  await db.sequelize!.query(
    `DELETE FROM "HighImpactActionRanked" WHERE hia_ranking_id IN (
      SELECT id FROM "HighImpactActionRanking" WHERE locode LIKE '${FIXTURE_PREFIX}-%'
    )`,
    { transaction },
  );
  await db.sequelize!.query(
    `DELETE FROM "HighImpactActionRanking" WHERE locode LIKE '${FIXTURE_PREFIX}-%'`,
    { transaction },
  );
}

async function seed(): Promise<void> {
  const rankingCount = positiveInteger("HIAP_LOAD_TEST_RANKINGS", 1000);
  const planCount = positiveInteger("HIAP_LOAD_TEST_PLANS", rankingCount);
  const jsonBytes = positiveInteger("HIAP_LOAD_TEST_JSON_BYTES", 32768);
  const shouldReset = process.env.HIAP_LOAD_TEST_RESET !== "false";

  if (!db.initialized) await db.initialize();
  if (!db.sequelize) throw new Error("Database not initialized");

  await db.sequelize.transaction(async (transaction) => {
    if (shouldReset) await resetFixture(transaction);

    const organization = await db.models.Organization.findByPk(
      ORGANIZATION_ID,
      { transaction },
    );
    if (!organization) {
      await db.models.Organization.create(
        {
          organizationId: ORGANIZATION_ID,
          name: "CC-752 load-test organization",
          contactEmail: "load-test@example.invalid",
          active: true,
          planType: OrganizationPlanType.FULL,
        },
        { transaction },
      );
    }

    const project = await db.models.Project.findByPk(PROJECT_ID, {
      transaction,
    });
    if (!project) {
      await db.models.Project.create(
        {
          projectId: PROJECT_ID,
          name: "CC-752 load-test project",
          cityCountLimit: Math.max(rankingCount, planCount),
          organizationId: ORGANIZATION_ID,
          description: "Synthetic project for the CC-752 local load test",
        },
        { transaction },
      );
    }

    const city = await db.models.City.findByPk(CITY_ID, { transaction });
    if (!city) {
      await db.models.City.create(
        {
          cityId: CITY_ID,
          locode: `${FIXTURE_PREFIX}-CITY`,
          name: "CC-752 Load-Test City",
          country: "Testland",
          projectId: PROJECT_ID,
        },
        { transaction },
      );
    }

    const inventory = await db.models.Inventory.findByPk(INVENTORY_ID, {
      transaction,
    });
    if (!inventory) {
      await db.models.Inventory.create(
        {
          inventoryId: INVENTORY_ID,
          inventoryName: "CC-752 Load-Test Inventory",
          year: 2024,
          cityId: CITY_ID,
          isPublic: false,
        },
        { transaction },
      );
    }

    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const rankings = Array.from({ length: rankingCount }, (_, index) => ({
      id: randomUUID(),
      locode: `${FIXTURE_PREFIX}-${String(index).padStart(6, "0")}`,
      inventoryId: INVENTORY_ID,
      type: ACTION_TYPES.Mitigation,
      langs: ["en", "pt"],
      status: HighImpactActionRankingStatus.SUCCESS,
      isBulk: true,
      jobId: `cc-752-load-${index}`,
      created: new Date(createdAt.getTime() + index * 1000),
      lastUpdated: new Date(createdAt.getTime() + index * 1000),
    }));
    await db.models.HighImpactActionRanking.bulkCreate(rankings, {
      transaction,
    });

    const rankedActions = rankings.flatMap((ranking, rankingIndex) =>
      [0, 1, 2].map((actionIndex) => ({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        type: ACTION_TYPES.Mitigation,
        name: `Synthetic action ${rankingIndex}-${actionIndex}`,
        description: "d".repeat(Math.max(1024, Math.floor(jsonBytes / 4))),
        actionId: `cc-752-action-${rankingIndex}-${actionIndex}`,
        rank: actionIndex + 1,
        explanation: {
          explanations: { en: `Synthetic explanation ${rankingIndex}` },
        },
        lang: actionIndex === 1 ? "pt" : "en",
        isSelected: actionIndex === 0,
      })),
    );
    await db.models.HighImpactActionRanked.bulkCreate(rankedActions, {
      transaction,
    });

    const plans = Array.from({ length: planCount }, (_, index) => {
      const ranked = rankedActions[(index % rankingCount) * 3];
      return {
        id: randomUUID(),
        actionId: ranked.actionId,
        highImpactActionRankedId: ranked.id,
        cityLocode: `${FIXTURE_PREFIX}-${String(index).padStart(6, "0")}`,
        cityId: CITY_ID,
        inventoryId: INVENTORY_ID,
        actionName: `Synthetic action plan ${index}`,
        language: "en",
        cityName: "CC-752 Load-Test City",
        createdAtTimestamp: new Date(
          createdAt.getTime() + index * 1000,
        ).toISOString(),
        cityDescription: "Synthetic city description",
        actionDescription: "Synthetic action description",
        nationalStrategyExplanation: "Synthetic strategy explanation",
        subactions: jsonPayload(jsonBytes, index),
        institutions: { fixture: true },
        milestones: { fixture: true },
        timeline: { fixture: true },
        costBudget: { fixture: true },
        merIndicators: { fixture: true },
        mitigations: { fixture: true },
        adaptations: { fixture: true },
        sdgs: { fixture: true },
        created: new Date(createdAt.getTime() + index * 1000),
        lastUpdated: new Date(createdAt.getTime() + index * 1000),
      };
    });
    await db.models.ActionPlan.bulkCreate(plans, { transaction });

    console.log(
      JSON.stringify({
        fixturePrefix: FIXTURE_PREFIX,
        rankings: rankingCount,
        rankedActions: rankedActions.length,
        actionPlans: planCount,
        jsonBytesPerPlan: jsonBytes,
      }),
    );
  });
}

env.loadEnvConfig(process.cwd());
seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize?.close();
  });
