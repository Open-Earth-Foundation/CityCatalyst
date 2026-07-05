import { db } from "@/models";
import env from "@next/env";
import { logger } from "@/services/logger";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { Roles } from "@/util/types";
import bcrypt from "bcrypt";

const DEFAULT_FIXTURE = {
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "99999999-9999-4999-8999-999999999999",
  projectId: "88888888-8888-4888-8888-888888888888",
  cityId: "22222222-2222-4222-8222-222222222222",
  inventoryId: "33333333-3333-4333-8333-333333333333",
  cityUserId: "44444444-4444-4444-8444-444444444444",
  email: "ca-smoke@citycatalyst.local",
  name: "CA CC Smoke User",
  organizationName: "CA CC Smoke Organization",
  projectName: "CA CC Smoke Project",
  cityName: "CA CC Smoke City",
  locode: "XX-CA-SMOKE",
  inventoryName: "CA CC Smoke Inventory",
  year: 2024,
};

function envValue(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function envInteger(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

async function upsertCaSmokeFixture() {
  env.loadEnvConfig(process.cwd());

  if (!db.initialized) {
    await db.initialize();
  }

  const fixture = {
    userId: envValue("CA_SMOKE_USER_ID", DEFAULT_FIXTURE.userId),
    organizationId: envValue(
      "CA_SMOKE_ORGANIZATION_ID",
      DEFAULT_FIXTURE.organizationId,
    ),
    projectId: envValue("CA_SMOKE_PROJECT_ID", DEFAULT_FIXTURE.projectId),
    cityId: envValue("CA_SMOKE_CITY_ID", DEFAULT_FIXTURE.cityId),
    inventoryId: envValue("CA_SMOKE_INVENTORY_ID", DEFAULT_FIXTURE.inventoryId),
    cityUserId: envValue("CA_SMOKE_CITY_USER_ID", DEFAULT_FIXTURE.cityUserId),
    email: envValue("CA_SMOKE_USER_EMAIL", DEFAULT_FIXTURE.email).toLowerCase(),
    name: envValue("CA_SMOKE_USER_NAME", DEFAULT_FIXTURE.name),
    organizationName: envValue(
      "CA_SMOKE_ORGANIZATION_NAME",
      DEFAULT_FIXTURE.organizationName,
    ),
    projectName: envValue("CA_SMOKE_PROJECT_NAME", DEFAULT_FIXTURE.projectName),
    cityName: envValue("CA_SMOKE_CITY_NAME", DEFAULT_FIXTURE.cityName),
    locode: envValue("CA_SMOKE_CITY_LOCODE", DEFAULT_FIXTURE.locode),
    inventoryName: envValue(
      "CA_SMOKE_INVENTORY_NAME",
      DEFAULT_FIXTURE.inventoryName,
    ),
    year: envInteger("CA_SMOKE_INVENTORY_YEAR", DEFAULT_FIXTURE.year),
  };

  const password = process.env.CA_SMOKE_USER_PASSWORD;
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

  try {
    await db.sequelize!.transaction(async (transaction) => {
      const existingUserWithEmail = await db.models.User.findOne({
        where: { email: fixture.email },
        transaction,
      });
      if (
        existingUserWithEmail &&
        existingUserWithEmail.userId !== fixture.userId
      ) {
        throw new Error(
          "CA smoke fixture email already belongs to a different user",
        );
      }

      await db.models.Organization.upsert(
        {
          organizationId: fixture.organizationId,
          name: fixture.organizationName,
          contactEmail: fixture.email,
          active: true,
        },
        { transaction },
      );

      await db.models.Project.upsert(
        {
          projectId: fixture.projectId,
          organizationId: fixture.organizationId,
          name: fixture.projectName,
          cityCountLimit: 1,
          description: "Deterministic CA/CC connection smoke fixture",
        },
        { transaction },
      );

      await db.models.City.upsert(
        {
          cityId: fixture.cityId,
          projectId: fixture.projectId,
          locode: fixture.locode,
          name: fixture.cityName,
          country: "Smoke",
          region: "Smoke",
          countryLocode: "XX",
          regionLocode: "XX-SMOKE",
        },
        { transaction },
      );

      await db.models.Inventory.upsert(
        {
          inventoryId: fixture.inventoryId,
          cityId: fixture.cityId,
          inventoryName: fixture.inventoryName,
          year: fixture.year,
          isPublic: false,
          inventoryType: InventoryTypeEnum.GPC_BASIC,
          globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
        },
        { transaction },
      );

      const existingUser = await db.models.User.findByPk(fixture.userId, {
        transaction,
      });
      if (existingUser) {
        await existingUser.update(
          {
            name: fixture.name,
            email: fixture.email,
            role: Roles.User,
            defaultCityId: fixture.cityId,
            defaultInventoryId: fixture.inventoryId,
            ...(passwordHash ? { passwordHash } : {}),
          },
          { transaction },
        );
      } else {
        await db.models.User.create(
          {
            userId: fixture.userId,
            name: fixture.name,
            email: fixture.email,
            role: Roles.User,
            defaultCityId: fixture.cityId,
            defaultInventoryId: fixture.inventoryId,
            ...(passwordHash ? { passwordHash } : {}),
          },
          { transaction },
        );
      }

      await db.models.CityUser.upsert(
        {
          cityUserId: fixture.cityUserId,
          userId: fixture.userId,
          cityId: fixture.cityId,
        },
        { transaction },
      );
    });

    logger.info(
      {
        userId: fixture.userId,
        cityId: fixture.cityId,
        inventoryId: fixture.inventoryId,
        email: fixture.email,
      },
      "Upserted CA/CC smoke fixture",
    );
  } finally {
    await db.sequelize?.close();
  }
}

upsertCaSmokeFixture().catch(async (error) => {
  logger.error({ err: error }, "Failed to upsert CA/CC smoke fixture");
  await db.sequelize?.close();
  process.exitCode = 1;
});
