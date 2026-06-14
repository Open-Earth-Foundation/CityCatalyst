// Local dev helper: seed a demo project + a few Brazilian cities with inventories,
// linked to the default admin user and the GHGI module. Idempotent.
// Run from app/: npx tsx scripts/seed-brazil.ts
import { db } from "@/models";
import env from "@next/env";
import { randomUUID } from "node:crypto";
import { logger } from "@/services/logger";
import {
  InventoryTypeEnum,
  GlobalWarmingPotentialTypeEnum,
} from "@/util/enums";

const PROJECT_NAME = "Brazil Demo";
const INVENTORY_YEAR = 2023;

const CITIES = [
  {
    locode: "BR SAO",
    name: "São Paulo",
    region: "São Paulo",
    regionLocode: "BR-SP",
    area: 1521,
  },
  {
    locode: "BR RIO",
    name: "Rio de Janeiro",
    region: "Rio de Janeiro",
    regionLocode: "BR-RJ",
    area: 1200,
  },
  {
    locode: "BR CWB",
    name: "Curitiba",
    region: "Paraná",
    regionLocode: "BR-PR",
    area: 435,
  },
];

async function seed() {
  env.loadEnvConfig(process.cwd());

  // Safety guard: this is a LOCAL-ONLY demo seeder. Refuse to run against
  // anything that isn't a local database, so it can never touch dev/prod.
  const host = (process.env.DATABASE_HOST || "").trim();
  const allowed = ["localhost", "127.0.0.1", "::1", "0.0.0.0", ""];
  if (!allowed.includes(host)) {
    logger.error(
      `seed-brazil: refusing to run — DATABASE_HOST="${host}" is not local. ` +
        `This script is for local development only.`,
    );
    process.exit(1);
  }

  if (!db.initialized) await db.initialize();

  const adminEmail = (
    process.env.DEFAULT_ADMIN_EMAIL || "johndoe@example.com"
  ).toLowerCase();
  const user = await db.models.User.findOne({ where: { email: adminEmail } });
  if (!user) {
    logger.error(
      `seed-brazil: admin user ${adminEmail} not found. Run create-admin first.`,
    );
    await db.sequelize?.close();
    return;
  }

  // Reuse the default organization
  const org = await db.models.Organization.findOne();
  if (!org) {
    logger.error("seed-brazil: no Organization found. Run db:seed first.");
    await db.sequelize?.close();
    return;
  }

  // Find or create the demo project
  let project = await db.models.Project.findOne({
    where: { name: PROJECT_NAME },
  });
  if (!project) {
    project = await db.models.Project.create({
      projectId: randomUUID(),
      name: PROJECT_NAME,
      description: "Demo project with Brazilian cities for local testing",
      cityCountLimit: 100,
      organizationId: org.organizationId,
    });
    logger.info(`Created project "${PROJECT_NAME}" (${project.projectId})`);
  } else {
    logger.info(
      `Project "${PROJECT_NAME}" already exists (${project.projectId})`,
    );
  }

  const ghgiModule = await db.models.Module.findOne({
    where: { url: "/GHGI", type: "OEF", status: "active" },
  });
  if (!ghgiModule) {
    logger.error(
      "seed-brazil: active GHGI module not found. Run db:seed first.",
    );
    await db.sequelize?.close();
    return;
  }

  const moduleLink = await db.models.ProjectModules.findOne({
    where: { projectId: project.projectId, moduleId: ghgiModule.id },
  });
  if (!moduleLink) {
    await db.models.ProjectModules.create({
      id: randomUUID(),
      projectId: project.projectId,
      moduleId: ghgiModule.id,
    });
    logger.info(`Linked project "${PROJECT_NAME}" to GHGI module`);
  }

  let defaultInventoryId: string | null = null;
  let defaultCityId: string | null = null;

  for (const c of CITIES) {
    let city = await db.models.City.findOne({ where: { locode: c.locode } });
    if (!city) {
      city = await db.models.City.create({
        cityId: randomUUID(),
        locode: c.locode,
        name: c.name,
        country: "Brazil",
        countryLocode: "BR",
        region: c.region,
        regionLocode: c.regionLocode,
        area: c.area,
        projectId: project.projectId,
      });
      logger.info(`  Created city ${c.name} (${c.locode})`);
    } else {
      logger.info(`  City ${c.name} already exists`);
    }

    // Link city to admin user
    const link = await db.models.CityUser.findOne({
      where: { userId: user.userId, cityId: city.cityId },
    });
    if (!link) {
      await db.models.CityUser.create({
        cityUserId: randomUUID(),
        userId: user.userId,
        cityId: city.cityId,
      });
    }

    // One inventory per city
    let inventory = await db.models.Inventory.findOne({
      where: { cityId: city.cityId, year: INVENTORY_YEAR },
    });
    if (!inventory) {
      inventory = await db.models.Inventory.create({
        inventoryId: randomUUID(),
        inventoryName: `${c.name} ${INVENTORY_YEAR}`,
        year: INVENTORY_YEAR,
        cityId: city.cityId,
        inventoryType: InventoryTypeEnum.GPC_BASIC,
        globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      });
      logger.info(`    Created inventory ${inventory.inventoryName}`);
    }

    if (!defaultInventoryId) {
      defaultInventoryId = inventory.inventoryId;
      defaultCityId = city.cityId;
    }
  }

  // Point the admin user's defaults at the first city/inventory (chatbot context)
  if (defaultInventoryId) {
    await user.update({ defaultInventoryId, defaultCityId });
    logger.info(`Set admin default inventory -> ${defaultInventoryId}`);
  }

  logger.info("seed-brazil: done ✨");
  await db.sequelize?.close();
}

seed().catch(async (e) => {
  logger.error(e);
  await db.sequelize?.close();
  process.exit(1);
});
