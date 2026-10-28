/**
 * Upsert deterministic CityCatalyst users for ON-6046 multi-role Clima validation.
 *
 * Brief: Creates collaborator, project admin, org admin, and system admin users
 * with distinct project/city access against the CA smoke organization.
 *
 * Inputs:
 * - Env vars (optional):
 *   - `CA_ROLE_FIXTURE_PASSWORD`: shared login password (default: `password`)
 *   - `CA_SMOKE_ORGANIZATION_ID`: org that owns the demo projects
 *     (default: smoke org `99999999-9999-4999-8999-999999999999`)
 *   - `CA_ROLE_PROJECT_ADMIN_PROJECT_ID`: project for the project-admin user
 *     (default: Demo Project 2 id from local demo seed)
 *   - `CA_ROLE_COLLABORATOR_CITY_LIMIT`: cities assigned to collaborator (default: 3)
 * - DB: existing Organization / Project / City / Inventory rows in the smoke org
 *
 * Outputs:
 * - Upserts User + role association rows (CityUser / ProjectAdmin / OrganizationAdmin)
 * - Prints UI login credentials and expected access scope to stdout/logger
 *
 * Usage (from `app/`):
 * - `CA_ROLE_FIXTURE_PASSWORD='password' npm run upsert-ca-role-fixtures`
 */

import { randomUUID } from "node:crypto";

import { db } from "@/models";
import { logger } from "@/services/logger";
import { Roles } from "@/util/types";
import env from "@next/env";
import bcrypt from "bcrypt";
import type { Transaction } from "sequelize";

const DEFAULT_ORG_ID = "99999999-9999-4999-8999-999999999999";
/** Demo Project 2 from the local ON-6046 demo seed (67 cities). */
const DEFAULT_PROJECT_ADMIN_PROJECT_ID =
  "f8c1192c-4eaa-4de9-a11b-24a70b14c755";

const FIXTURES = {
  collaborator: {
    userId: "a1111111-1111-4111-8111-111111111101",
    email: "ca-collaborator@citycatalyst.local",
    name: "CA Collaborator",
    organizationAdminId: "b1111111-1111-4111-8111-111111111101",
    projectAdminId: "c1111111-1111-4111-8111-111111111101",
  },
  projectAdmin: {
    userId: "a1111111-1111-4111-8111-111111111102",
    email: "ca-project-admin@citycatalyst.local",
    name: "CA Project Admin",
    organizationAdminId: "b1111111-1111-4111-8111-111111111102",
    projectAdminId: "c1111111-1111-4111-8111-111111111102",
  },
  orgAdmin: {
    userId: "a1111111-1111-4111-8111-111111111103",
    email: "ca-org-admin@citycatalyst.local",
    name: "CA Org Admin",
    organizationAdminId: "b1111111-1111-4111-8111-111111111103",
    projectAdminId: "c1111111-1111-4111-8111-111111111103",
  },
  systemAdmin: {
    userId: "a1111111-1111-4111-8111-111111111104",
    email: "ca-system-admin@citycatalyst.local",
    name: "CA System Admin",
    organizationAdminId: "b1111111-1111-4111-8111-111111111104",
    projectAdminId: "c1111111-1111-4111-8111-111111111104",
  },
} as const;

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
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

/** Ensure email is owned by the expected fixture user id. */
async function assertEmailOwner(
  email: string,
  expectedUserId: string,
  transaction: Transaction,
) {
  const existing = await db.models.User.findOne({
    where: { email },
    transaction,
  });
  if (existing && existing.userId !== expectedUserId) {
    throw new Error(
      `Email ${email} already belongs to a different user (${existing.userId})`,
    );
  }
}

/** Create or update a credentials user with the given platform role. */
async function upsertUser(params: {
  userId: string;
  email: string;
  name: string;
  role: Roles;
  passwordHash: string;
  defaultCityId?: string | null;
  defaultInventoryId?: string | null;
  transaction: Transaction;
}) {
  await assertEmailOwner(params.email, params.userId, params.transaction);

  const existing = await db.models.User.findByPk(params.userId, {
    transaction: params.transaction,
  });
  const payload = {
    name: params.name,
    email: params.email,
    role: params.role,
    passwordHash: params.passwordHash,
    defaultCityId: params.defaultCityId ?? null,
    defaultInventoryId: params.defaultInventoryId ?? null,
  };

  if (existing) {
    await existing.update(payload, { transaction: params.transaction });
    return existing;
  }

  return db.models.User.create(
    {
      userId: params.userId,
      ...payload,
    },
    { transaction: params.transaction },
  );
}

/** Remove prior role associations for a fixture user so re-runs stay deterministic. */
async function clearRoleAssociations(
  userId: string,
  transaction: Transaction,
) {
  await db.models.CityUser.destroy({ where: { userId }, transaction });
  await db.models.ProjectAdmin.destroy({ where: { userId }, transaction });
  await db.models.OrganizationAdmin.destroy({ where: { userId }, transaction });
}

async function upsertCaRoleFixtures() {
  env.loadEnvConfig(process.cwd());

  if (!db.initialized) {
    await db.initialize();
  }

  const organizationId = envValue(
    "CA_SMOKE_ORGANIZATION_ID",
    DEFAULT_ORG_ID,
  );
  const projectAdminProjectId = envValue(
    "CA_ROLE_PROJECT_ADMIN_PROJECT_ID",
    DEFAULT_PROJECT_ADMIN_PROJECT_ID,
  );
  const collaboratorCityLimit = envInteger(
    "CA_ROLE_COLLABORATOR_CITY_LIMIT",
    3,
  );
  const password = envValue("CA_ROLE_FIXTURE_PASSWORD", "password");
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const summary = await db.sequelize!.transaction(async (transaction) => {
      const organization = await db.models.Organization.findByPk(
        organizationId,
        { transaction },
      );
      if (!organization) {
        throw new Error(
          `Organization ${organizationId} not found. Run the CA smoke + demo project seed first.`,
        );
      }

      const projectAdminProject = await db.models.Project.findOne({
        where: { projectId: projectAdminProjectId, organizationId },
        transaction,
      });
      if (!projectAdminProject) {
        throw new Error(
          `Project ${projectAdminProjectId} not found in org ${organizationId}`,
        );
      }

      // Collaborator gets a small explicit city set inside Demo Project 1 (or first non-admin project).
      const collaboratorProject =
        (await db.models.Project.findOne({
          where: { organizationId, name: "Demo Project 1" },
          transaction,
        })) ??
        (await db.models.Project.findOne({
          where: { organizationId },
          order: [["name", "ASC"]],
          transaction,
        }));
      if (!collaboratorProject) {
        throw new Error(`No projects found in organization ${organizationId}`);
      }

      const collaboratorCities = await db.models.City.findAll({
        where: { projectId: collaboratorProject.projectId },
        include: [{ model: db.models.Inventory, as: "inventories" }],
        order: [["name", "ASC"]],
        limit: collaboratorCityLimit,
        transaction,
      });
      if (collaboratorCities.length === 0) {
        throw new Error(
          `No cities found in project ${collaboratorProject.projectId}`,
        );
      }

      const projectAdminCities = await db.models.City.findAll({
        where: { projectId: projectAdminProject.projectId },
        include: [{ model: db.models.Inventory, as: "inventories" }],
        order: [["name", "ASC"]],
        limit: 1,
        transaction,
      });

      const orgInventoryCount = await db.models.Inventory.count({
        include: [
          {
            model: db.models.City,
            as: "city",
            required: true,
            include: [
              {
                model: db.models.Project,
                as: "project",
                required: true,
                where: { organizationId },
              },
            ],
          },
        ],
        transaction,
      });

      const projectAdminInventoryCount = await db.models.Inventory.count({
        include: [
          {
            model: db.models.City,
            as: "city",
            required: true,
            where: { projectId: projectAdminProject.projectId },
          },
        ],
        transaction,
      });

      // --- Collaborator: only the selected cities ---
      await clearRoleAssociations(FIXTURES.collaborator.userId, transaction);
      const collaboratorDefaultCity = collaboratorCities[0];
      const collaboratorDefaultInventory =
        collaboratorDefaultCity.inventories?.[0];
      await upsertUser({
        userId: FIXTURES.collaborator.userId,
        email: FIXTURES.collaborator.email,
        name: FIXTURES.collaborator.name,
        role: Roles.User,
        passwordHash,
        defaultCityId: collaboratorDefaultCity.cityId,
        defaultInventoryId: collaboratorDefaultInventory?.inventoryId ?? null,
        transaction,
      });
      for (const city of collaboratorCities) {
        await db.models.CityUser.create(
          {
            cityUserId: randomUUID(),
            userId: FIXTURES.collaborator.userId,
            cityId: city.cityId,
          },
          { transaction },
        );
      }

      // --- Project admin: full Demo Project 2 ---
      await clearRoleAssociations(FIXTURES.projectAdmin.userId, transaction);
      const projectAdminDefaultCity = projectAdminCities[0];
      const projectAdminDefaultInventory =
        projectAdminDefaultCity?.inventories?.[0];
      await upsertUser({
        userId: FIXTURES.projectAdmin.userId,
        email: FIXTURES.projectAdmin.email,
        name: FIXTURES.projectAdmin.name,
        role: Roles.User,
        passwordHash,
        defaultCityId: projectAdminDefaultCity?.cityId ?? null,
        defaultInventoryId: projectAdminDefaultInventory?.inventoryId ?? null,
        transaction,
      });
      await db.models.ProjectAdmin.create(
        {
          projectAdminId: FIXTURES.projectAdmin.projectAdminId,
          projectId: projectAdminProject.projectId,
          userId: FIXTURES.projectAdmin.userId,
        },
        { transaction },
      );

      // --- Org admin: entire smoke organization ---
      await clearRoleAssociations(FIXTURES.orgAdmin.userId, transaction);
      await upsertUser({
        userId: FIXTURES.orgAdmin.userId,
        email: FIXTURES.orgAdmin.email,
        name: FIXTURES.orgAdmin.name,
        role: Roles.User,
        passwordHash,
        defaultCityId: collaboratorDefaultCity.cityId,
        defaultInventoryId: collaboratorDefaultInventory?.inventoryId ?? null,
        transaction,
      });
      await db.models.OrganizationAdmin.create(
        {
          organizationAdminId: FIXTURES.orgAdmin.organizationAdminId,
          organizationId,
          userId: FIXTURES.orgAdmin.userId,
        },
        { transaction },
      );

      // --- System / super admin: platform-wide Roles.Admin ---
      await clearRoleAssociations(FIXTURES.systemAdmin.userId, transaction);
      await upsertUser({
        userId: FIXTURES.systemAdmin.userId,
        email: FIXTURES.systemAdmin.email,
        name: FIXTURES.systemAdmin.name,
        role: Roles.Admin,
        passwordHash,
        defaultCityId: collaboratorDefaultCity.cityId,
        defaultInventoryId: collaboratorDefaultInventory?.inventoryId ?? null,
        transaction,
      });

      return {
        password,
        organizationId,
        organizationName: organization.name,
        collaborator: {
          ...FIXTURES.collaborator,
          projectId: collaboratorProject.projectId,
          projectName: collaboratorProject.name,
          cityIds: collaboratorCities.map((city) => city.cityId),
          expectedInventories: collaboratorCities.reduce(
            (sum, city) => sum + (city.inventories?.length ?? 0),
            0,
          ),
          expectedCities: collaboratorCities.length,
        },
        projectAdmin: {
          ...FIXTURES.projectAdmin,
          projectId: projectAdminProject.projectId,
          projectName: projectAdminProject.name,
          expectedInventories: projectAdminInventoryCount,
          expectedCities: projectAdminInventoryCount,
        },
        orgAdmin: {
          ...FIXTURES.orgAdmin,
          expectedInventories: orgInventoryCount,
          expectedCities: orgInventoryCount,
        },
        systemAdmin: {
          ...FIXTURES.systemAdmin,
          expectedAccessScope: "platform" as const,
          expectedMinInventories: orgInventoryCount,
        },
      };
    });

    logger.info(
      {
        organizationId: summary.organizationId,
        collaboratorEmail: summary.collaborator.email,
        projectAdminEmail: summary.projectAdmin.email,
        orgAdminEmail: summary.orgAdmin.email,
        systemAdminEmail: summary.systemAdmin.email,
      },
      "Upserted CA multi-role fixtures",
    );

    // Intentional CLI UX: print a copy-pasteable UI checklist.
    console.log(`
=== ON-6046 multi-role fixtures ready ===
Password (all users): ${summary.password}
Organization: ${summary.organizationName} (${summary.organizationId})

UI logins + expected Clima answer for "How many inventories do I have?":

1) Collaborator  ${summary.collaborator.email}
   Access: ${summary.collaborator.expectedInventories} inventories / ${summary.collaborator.expectedCities} cities
   Project: ${summary.collaborator.projectName} only (assigned cities)

2) Project admin ${summary.projectAdmin.email}
   Access: ${summary.projectAdmin.expectedInventories} inventories / ${summary.projectAdmin.expectedCities} cities
   Project: ${summary.projectAdmin.projectName} only
   access_scope: projects

3) Org admin     ${summary.orgAdmin.email}
   Access: ${summary.orgAdmin.expectedInventories} inventories / ${summary.orgAdmin.expectedCities} cities
   All projects in the smoke organization
   access_scope: projects

4) System admin  ${summary.systemAdmin.email}
   Access: platform-wide (>= ${summary.systemAdmin.expectedMinInventories} inventories)
   access_scope: platform
   Copy: "you have access to…"

Validate via script:
  npm run validate-ca-inventory-access-by-role
`);
  } finally {
    await db.sequelize?.close();
  }
}

upsertCaRoleFixtures().catch(async (error) => {
  logger.error({ err: error }, "Failed to upsert CA multi-role fixtures");
  await db.sequelize?.close();
  process.exitCode = 1;
});
