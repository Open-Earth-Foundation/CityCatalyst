/**
 * Validate ON-6046 accessible-inventory totals/breakdown per role fixture.
 *
 * Brief: Calls `buildAccessibleInventoryList` for collaborator, project admin,
 * org admin, and system admin fixtures and asserts expected counts/scope.
 *
 * Inputs:
 * - Env vars (optional):
 *   - `CA_SMOKE_ORGANIZATION_ID`: smoke organization id
 *   - `CA_ROLE_PROJECT_ADMIN_PROJECT_ID`: project-admin project id
 *   - `CA_ROLE_COLLABORATOR_CITY_LIMIT`: expected collaborator city count
 * - DB: role fixtures from `npm run upsert-ca-role-fixtures`
 *
 * Outputs:
 * - Pass/fail report on stdout (exit code 0 on success, 1 on failure)
 *
 * Usage (from `app/`):
 * - `npm run upsert-ca-role-fixtures`
 * - `npm run validate-ca-inventory-access-by-role`
 */

import { buildAccessibleInventoryList } from "@/backend/agentic/ghgi/inventory/context";
import { db } from "@/models";
import { logger } from "@/services/logger";
import env from "@next/env";
import { Op } from "sequelize";

const DEFAULT_ORG_ID = "99999999-9999-4999-8999-999999999999";
const DEFAULT_PROJECT_ADMIN_PROJECT_ID =
  "f8c1192c-4eaa-4de9-a11b-24a70b14c755";

const USERS = {
  collaborator: {
    userId: "a1111111-1111-4111-8111-111111111101",
    email: "ca-collaborator@citycatalyst.local",
    roleLabel: "collaborator",
  },
  projectAdmin: {
    userId: "a1111111-1111-4111-8111-111111111102",
    email: "ca-project-admin@citycatalyst.local",
    roleLabel: "project_admin",
  },
  orgAdmin: {
    userId: "a1111111-1111-4111-8111-111111111103",
    email: "ca-org-admin@citycatalyst.local",
    roleLabel: "org_admin",
  },
  systemAdmin: {
    userId: "a1111111-1111-4111-8111-111111111104",
    email: "ca-system-admin@citycatalyst.local",
    roleLabel: "system_admin",
  },
} as const;

type CheckResult = {
  role: string;
  email: string;
  ok: boolean;
  details: string[];
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
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

/** Format by_project rows for readable assertion output. */
function formatBreakdown(
  byProject: Array<{
    project_name: string | null;
    total_inventories: number;
    total_cities: number;
  }>,
): string {
  if (byProject.length === 0) {
    return "(empty)";
  }
  return byProject
    .map(
      (row) =>
        `${row.project_name ?? "unknown"}: ${row.total_inventories} inv / ${row.total_cities} cities`,
    )
    .join("; ");
}

/** Count inventories linked to cities in the given project ids. */
async function countInventoriesForProjects(
  projectIds: string[],
): Promise<number> {
  if (projectIds.length === 0) {
    return 0;
  }
  return db.models.Inventory.count({
    include: [
      {
        model: db.models.City,
        as: "city",
        required: true,
        where: { projectId: { [Op.in]: projectIds } },
      },
    ],
  });
}

/** Count inventories for cities explicitly assigned to a collaborator. */
async function countCollaboratorInventories(userId: string): Promise<{
  inventoryCount: number;
  cityCount: number;
  projectIds: string[];
}> {
  const cityUsers = await db.models.CityUser.findAll({
    where: { userId },
    include: [
      {
        model: db.models.City,
        as: "city",
        include: [
          { model: db.models.Inventory, as: "inventories" },
          { model: db.models.Project, as: "project" },
        ],
      },
    ],
  });

  const projectIds = [
    ...new Set(
      cityUsers
        .map((row) => row.city?.project?.projectId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  return {
    cityCount: cityUsers.length,
    inventoryCount: cityUsers.reduce(
      (sum, row) => sum + (row.city?.inventories?.length ?? 0),
      0,
    ),
    projectIds,
  };
}

async function validateRoleAccess() {
  env.loadEnvConfig(process.cwd());

  if (!db.initialized) {
    await db.initialize();
  }

  const organizationId = envValue("CA_SMOKE_ORGANIZATION_ID", DEFAULT_ORG_ID);
  const projectAdminProjectId = envValue(
    "CA_ROLE_PROJECT_ADMIN_PROJECT_ID",
    DEFAULT_PROJECT_ADMIN_PROJECT_ID,
  );
  const collaboratorCityLimit = envInteger(
    "CA_ROLE_COLLABORATOR_CITY_LIMIT",
    3,
  );

  const results: CheckResult[] = [];

  try {
    const orgProjects = await db.models.Project.findAll({
      where: { organizationId },
      attributes: ["projectId", "name"],
    });
    const orgProjectIds = orgProjects.map((project) => project.projectId);
    const orgInventoryCount =
      await countInventoriesForProjects(orgProjectIds);
    const projectAdminInventoryCount = await countInventoriesForProjects([
      projectAdminProjectId,
    ]);

    // Collaborator
    {
      const fixture = USERS.collaborator;
      const expected = await countCollaboratorInventories(fixture.userId);
      const list = await buildAccessibleInventoryList({
        userId: fixture.userId,
        includeAllCityYears: true,
      });
      const details: string[] = [];
      let ok = true;

      if (expected.cityCount !== collaboratorCityLimit) {
        ok = false;
        details.push(
          `fixture city associations=${expected.cityCount}, expected ${collaboratorCityLimit} (re-run upsert-ca-role-fixtures)`,
        );
      }
      if (list.access_scope !== "projects") {
        ok = false;
        details.push(`access_scope=${list.access_scope}, expected projects`);
      }
      if (list.total_inventories !== expected.inventoryCount) {
        ok = false;
        details.push(
          `total_inventories=${list.total_inventories}, expected ${expected.inventoryCount}`,
        );
      }
      if (list.total_cities !== expected.cityCount) {
        ok = false;
        details.push(
          `total_cities=${list.total_cities}, expected ${expected.cityCount}`,
        );
      }
      if (list.by_project.length !== expected.projectIds.length) {
        ok = false;
        details.push(
          `by_project rows=${list.by_project.length}, expected ${expected.projectIds.length}`,
        );
      }
      details.push(`got: ${list.total_inventories} inv / ${list.total_cities} cities`);
      details.push(`by_project: ${formatBreakdown(list.by_project)}`);
      results.push({
        role: fixture.roleLabel,
        email: fixture.email,
        ok,
        details,
      });
    }

    // Project admin
    {
      const fixture = USERS.projectAdmin;
      const list = await buildAccessibleInventoryList({
        userId: fixture.userId,
        includeAllCityYears: true,
      });
      const details: string[] = [];
      let ok = true;

      if (list.access_scope !== "projects") {
        ok = false;
        details.push(`access_scope=${list.access_scope}, expected projects`);
      }
      if (list.total_inventories !== projectAdminInventoryCount) {
        ok = false;
        details.push(
          `total_inventories=${list.total_inventories}, expected ${projectAdminInventoryCount}`,
        );
      }
      if (list.total_cities !== projectAdminInventoryCount) {
        ok = false;
        details.push(
          `total_cities=${list.total_cities}, expected ${projectAdminInventoryCount}`,
        );
      }
      const onlyExpectedProject =
        list.by_project.length === 1 &&
        list.by_project[0]?.project_id === projectAdminProjectId;
      if (!onlyExpectedProject) {
        ok = false;
        details.push(
          `by_project should be only project ${projectAdminProjectId}`,
        );
      }
      details.push(`got: ${list.total_inventories} inv / ${list.total_cities} cities`);
      details.push(`by_project: ${formatBreakdown(list.by_project)}`);
      results.push({
        role: fixture.roleLabel,
        email: fixture.email,
        ok,
        details,
      });
    }

    // Org admin
    {
      const fixture = USERS.orgAdmin;
      const list = await buildAccessibleInventoryList({
        userId: fixture.userId,
        includeAllCityYears: true,
      });
      const details: string[] = [];
      let ok = true;

      if (list.access_scope !== "projects") {
        ok = false;
        details.push(`access_scope=${list.access_scope}, expected projects`);
      }
      if (list.total_inventories !== orgInventoryCount) {
        ok = false;
        details.push(
          `total_inventories=${list.total_inventories}, expected ${orgInventoryCount}`,
        );
      }
      if (list.total_cities !== orgInventoryCount) {
        ok = false;
        details.push(
          `total_cities=${list.total_cities}, expected ${orgInventoryCount}`,
        );
      }
      if (list.by_project.length !== orgProjects.length) {
        ok = false;
        details.push(
          `by_project rows=${list.by_project.length}, expected ${orgProjects.length}`,
        );
      }
      details.push(`got: ${list.total_inventories} inv / ${list.total_cities} cities`);
      details.push(`by_project: ${formatBreakdown(list.by_project)}`);
      results.push({
        role: fixture.roleLabel,
        email: fixture.email,
        ok,
        details,
      });
    }

    // System admin
    {
      const fixture = USERS.systemAdmin;
      const list = await buildAccessibleInventoryList({
        userId: fixture.userId,
        includeAllCityYears: true,
      });
      const details: string[] = [];
      let ok = true;

      if (list.access_scope !== "platform") {
        ok = false;
        details.push(`access_scope=${list.access_scope}, expected platform`);
      }
      if (list.total_inventories < orgInventoryCount) {
        ok = false;
        details.push(
          `total_inventories=${list.total_inventories}, expected >= ${orgInventoryCount}`,
        );
      }
      details.push(`got: ${list.total_inventories} inv / ${list.total_cities} cities`);
      details.push(`by_project rows: ${list.by_project.length}`);
      details.push(`by_project: ${formatBreakdown(list.by_project)}`);
      results.push({
        role: fixture.roleLabel,
        email: fixture.email,
        ok,
        details,
      });
    }

    const failed = results.filter((result) => !result.ok);
    for (const result of results) {
      const status = result.ok ? "PASS" : "FAIL";
      console.log(`\n[${status}] ${result.role} <${result.email}>`);
      for (const line of result.details) {
        console.log(`  - ${line}`);
      }
    }

    if (failed.length > 0) {
      logger.error(
        { failedRoles: failed.map((result) => result.role) },
        "ON-6046 role access validation failed",
      );
      process.exitCode = 1;
      return;
    }

    logger.info("ON-6046 role access validation passed for all fixtures");
    console.log("\nAll role access checks passed.");
  } finally {
    await db.sequelize?.close();
  }
}

validateRoleAccess().catch(async (error) => {
  logger.error({ err: error }, "Failed to validate CA role inventory access");
  await db.sequelize?.close();
  process.exitCode = 1;
});
