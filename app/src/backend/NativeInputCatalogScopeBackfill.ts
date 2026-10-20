import { Op } from "sequelize";

import { db } from "@/models";

/**
 * CC-1060 PR 2: catalog rows are authorized at city and project, never by the
 * creator. This pass only fills a missing `projectId` from the row's city (or
 * its inventory's city). It writes nothing else: `userId`, `cityId` and
 * `organizationId` are left as they are (authorization ignores `userId`).
 * It is idempotent: a second run changes nothing.
 */

export type CatalogScopeBackfillCursor = { created: string; id: string };

export type CatalogScopeBackfillOptions = {
  limit: number;
  cursor?: CatalogScopeBackfillCursor;
  dryRun?: boolean;
};

export type CatalogScopeBackfillPage = {
  scanned: number;
  projectFilled: number;
  unresolved: number;
  nextCursor: CatalogScopeBackfillCursor | null;
  hasMore: boolean;
};

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("Catalog scope backfill limit must be 1 to 1000");
  }
}

function cursorWhere(cursor?: CatalogScopeBackfillCursor) {
  if (!cursor) return {};
  const created = new Date(cursor.created);
  return {
    [Op.or]: [
      { created: { [Op.gt]: created } },
      { created, id: { [Op.gt]: cursor.id } },
    ],
  };
}

async function resolveCityProject(row: {
  cityId?: string | null;
  inventoryId?: string | null;
}): Promise<{ projectId: string } | null> {
  let cityId = row.cityId ?? null;
  if (!cityId && row.inventoryId) {
    const inventory = await db.models.Inventory.findByPk(row.inventoryId, {
      attributes: ["inventoryId", "cityId"],
    });
    cityId = inventory?.cityId ?? null;
  }
  if (!cityId) return null;
  const city = await db.models.City.findByPk(cityId, {
    attributes: ["cityId", "projectId"],
  });
  if (!city?.projectId) return null;
  return { projectId: city.projectId };
}

export async function backfillCatalogScopePage(
  options: CatalogScopeBackfillOptions,
): Promise<CatalogScopeBackfillPage> {
  validateLimit(options.limit);

  const rows = await db.models.NativeInputCatalog.findAll({
    where: {
      [Op.and]: [{ projectId: null }, cursorWhere(options.cursor)],
    },
    order: [
      ["created", "ASC"],
      ["id", "ASC"],
    ],
    limit: options.limit + 1,
  });
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;

  const result: CatalogScopeBackfillPage = {
    scanned: page.length,
    projectFilled: 0,
    unresolved: 0,
    nextCursor: null,
    hasMore,
  };

  for (const row of page) {
    const resolved = await resolveCityProject(row);
    if (!resolved) {
      result.unresolved += 1;
      continue;
    }
    result.projectFilled += 1;
    if (!options.dryRun) await row.update({ projectId: resolved.projectId });
  }

  const last = page[page.length - 1];
  if (last && hasMore) {
    const created = last.created as unknown as Date | string;
    result.nextCursor = {
      created: (created instanceof Date
        ? created
        : new Date(created)
      ).toISOString(),
      id: last.id,
    };
  }
  return result;
}

/**
 * Run pages until done. A real run converges on its own (changed rows leave
 * the filter); a dry run advances by cursor.
 */
export async function runCatalogScopeBackfill(config: {
  batchSize: number;
  dryRun: boolean;
  maxBatches?: number;
}): Promise<
  Omit<CatalogScopeBackfillPage, "nextCursor" | "hasMore"> & { pages: number }
> {
  const totals = {
    scanned: 0,
    projectFilled: 0,
    unresolved: 0,
    pages: 0,
  };
  let cursor: CatalogScopeBackfillCursor | undefined;
  for (;;) {
    if (config.maxBatches && totals.pages >= config.maxBatches) break;
    const page = await backfillCatalogScopePage({
      limit: config.batchSize,
      cursor,
      dryRun: config.dryRun,
    });
    totals.pages += 1;
    totals.scanned += page.scanned;
    totals.projectFilled += page.projectFilled;
    totals.unresolved += page.unresolved;
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return totals;
}
