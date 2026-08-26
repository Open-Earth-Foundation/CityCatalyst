import { Op } from "sequelize";

import { db } from "@/models";
import {
  registerNativeInput,
  supersedeNativeInput,
  withdrawNativeInput,
  type RegisterNativeInputInput,
  type NativeInputCatalogRegistration,
} from "@/backend/NativeInputCatalogService";
import { logger } from "@/services/logger";

const MEED_MODULE = "hiap_meed" as const;
const MEED_RANKING_SOURCE_TYPE = "hiap_meed_ranking" as const;

export type MEEDCatalogBackfillCursor = {
  created: string;
  id: string;
};

export type MEEDCatalogBackfillPageOptions = {
  limit: number;
  cursor?: MEEDCatalogBackfillCursor;
  dryRun: boolean;
};

export type MEEDCatalogBackfillPage = {
  scanned: number;
  repaired: number;
  failed: number;
  nextCursor: MEEDCatalogBackfillCursor | null;
  hasMore: boolean;
};

type MeedRankingLike = {
  id: string;
  inventoryId?: string | null;
  userId?: string | null;
  inputDigest?: string | null;
  contentDigest?: string | null;
  status?: string | null;
  requestedLanguages?: string[] | null;
  topN?: number | null;
  created?: Date;
};

type CatalogScope = {
  userId: string | null;
  inventoryId: string | null;
  cityId: string | null;
  projectId: string | null;
  organizationId: string | null;
};

type CatalogModel = {
  findAll: (options: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
  findOne: (options: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
};

type MeedRankingModel = {
  findAll: (options: Record<string, unknown>) => Promise<MeedRankingLike[]>;
  findByPk: (id: string, options?: Record<string, unknown>) => Promise<MeedRankingLike | null>;
};

type MeedActionModel = {
  findAll: (options: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
};

type MeedModels = typeof db.models & {
  NativeInputCatalog: CatalogModel;
  MeedRanking: MeedRankingModel;
  MeedActionRanked: MeedActionModel;
  MeedActionRemoved: MeedActionModel;
};

function models(): MeedModels {
  return db.models as MeedModels;
}

async function resolveScope(ranking: MeedRankingLike): Promise<CatalogScope> {
  const inventory = ranking.inventoryId
    ? await db.models.Inventory.findByPk(ranking.inventoryId, {
        include: [
          {
            model: db.models.City,
            as: "city",
            include: [
              {
                model: db.models.Project,
                as: "project",
                include: [{ model: db.models.Organization, as: "organization" }],
              },
            ],
          },
        ],
      })
    : null;

  const city = inventory?.city;
  const project = city?.project;
  const organization = project?.organization;
  const scope: CatalogScope = {
    userId: ranking.userId ?? null,
    inventoryId: inventory?.inventoryId ?? ranking.inventoryId ?? null,
    cityId: inventory?.cityId ?? city?.cityId ?? null,
    projectId: city?.projectId ?? project?.projectId ?? null,
    organizationId:
      project?.organizationId ?? organization?.organizationId ?? null,
  };

  if (
    !scope.userId &&
    !scope.inventoryId &&
    !scope.cityId &&
    !scope.projectId &&
    !scope.organizationId
  ) {
    throw new Error("MEED catalog registration requires a scope identifier");
  }

  return scope;
}

async function loadRanking(rankingId: string): Promise<MeedRankingLike> {
  const ranking = await models().MeedRanking.findByPk(rankingId);
  if (!ranking) throw new Error("MEED ranking not found");
  return ranking;
}

async function buildMEEDRankingInput(
  ranking: MeedRankingLike,
): Promise<RegisterNativeInputInput> {
  if (ranking.status !== "completed") {
    throw new Error("Only completed MEED rankings can enter the catalog");
  }
  if (!ranking.inventoryId) {
    throw new Error("MEED rankings require an inventory");
  }
  if (!ranking.inputDigest || !ranking.contentDigest) {
    throw new Error("Completed MEED rankings require input and content digests");
  }

  const rankedActions = await models().MeedActionRanked.findAll({
    where: { rankingId: ranking.id },
    attributes: ["id"],
  });
  const removedActions = await models().MeedActionRemoved.findAll({
    where: { rankingId: ranking.id },
    attributes: ["id"],
  });
  const actionCount = rankedActions.length + removedActions.length;
  if (actionCount === 0) {
    throw new Error("Only persisted MEED rankings can enter the catalog");
  }

  const scope = await resolveScope(ranking);
  const sourceId = `${scope.inventoryId}:${scope.userId ?? "anonymous"}:${ranking.inputDigest}:${ranking.contentDigest}`;

  return {
    kind: "hiap_meed_ranking",
    owningModule: MEED_MODULE,
    sourceType: MEED_RANKING_SOURCE_TYPE,
    sourceId,
    ...scope,
    contentDigest: ranking.contentDigest,
    markdownReady: false,
    labels: {
      rankingId: ranking.id,
      actionCount,
      requestedLanguages: ranking.requestedLanguages ?? [],
      topN: ranking.topN ?? null,
      inputDigest: ranking.inputDigest,
    },
  };
}

async function supersedePreviousVersions(
  input: RegisterNativeInputInput,
  replacementCatalogId: string,
): Promise<void> {
  const activeEntries = await models().NativeInputCatalog.findAll({
    where: {
      owningModule: MEED_MODULE,
      sourceType: MEED_RANKING_SOURCE_TYPE,
      inventoryId: input.inventoryId,
      userId: input.userId ?? null,
      availability: "active",
    },
  });

  for (const catalog of activeEntries) {
    if (catalog.id === replacementCatalogId) continue;
    await supersedeNativeInput(String(catalog.id), input);
  }
}

function validateBackfillLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error(
      "MEED catalog backfill limit must be an integer from 1 to 1000",
    );
  }
}

function cursorWhere(cursor?: MEEDCatalogBackfillCursor) {
  if (!cursor) return {};

  const created = new Date(cursor.created);
  if (Number.isNaN(created.getTime())) {
    throw new Error("MEED catalog backfill cursor has an invalid timestamp");
  }

  return {
    [Op.or]: [
      { created: { [Op.gt]: created } },
      { created, id: { [Op.gt]: cursor.id } },
    ],
  };
}

function cursorFor(record: MeedRankingLike): MEEDCatalogBackfillCursor {
  if (!record.created) {
    throw new Error(
      `MEED catalog backfill ranking ${record.id} has no created timestamp`,
    );
  }

  return { created: record.created.toISOString(), id: record.id };
}

export async function registerMEEDRanking(
  rankingId: string,
): Promise<NativeInputCatalogRegistration> {
  const ranking = await loadRanking(rankingId);
  const input = await buildMEEDRankingInput(ranking);
  const existing = await models().NativeInputCatalog.findOne({
    where: {
      owningModule: MEED_MODULE,
      sourceType: MEED_RANKING_SOURCE_TYPE,
      sourceId: input.sourceId,
      availability: "active",
    },
  });
  const registration = existing
    ? { catalog: existing, created: false }
    : await registerNativeInput(input);
  await supersedePreviousVersions(input, String(registration.catalog.id));
  return registration;
}

export async function backfillMissingMEEDRankingsPage(
  options: MEEDCatalogBackfillPageOptions,
): Promise<MEEDCatalogBackfillPage> {
  validateBackfillLimit(options.limit);

  const rankings = await models().MeedRanking.findAll({
    where: { status: "completed", ...cursorWhere(options.cursor) },
    order: [
      ["created", "ASC"],
      ["id", "ASC"],
    ],
    limit: options.limit,
  });

  let repaired = 0;
  let failed = 0;

  for (const ranking of rankings) {
    try {
      if (options.dryRun) {
        await buildMEEDRankingInput(ranking);
        repaired++;
      } else {
        const registration = await registerMEEDRanking(ranking.id);
        if (registration.created) {
          repaired++;
          logger.info(
            { rankingId: ranking.id, inventoryId: ranking.inventoryId },
            "Backfilled missing MEED ranking catalog entry",
          );
        }
      }
    } catch (error) {
      failed++;
      logger.error(
        { error, rankingId: ranking.id, inventoryId: ranking.inventoryId },
        "Failed to backfill MEED ranking catalog entry",
      );
    }
  }

  const hasMore = rankings.length === options.limit;
  return {
    scanned: rankings.length,
    repaired,
    failed,
    hasMore,
    nextCursor:
      hasMore && rankings.length > 0
        ? cursorFor(rankings[rankings.length - 1])
        : null,
  };
}

export async function withdrawMEEDCatalogForInventory(
  inventoryId: string,
): Promise<number> {
  const activeEntries = await models().NativeInputCatalog.findAll({
    where: {
      owningModule: MEED_MODULE,
      sourceType: MEED_RANKING_SOURCE_TYPE,
      inventoryId,
      availability: "active",
    },
  });

  for (const catalog of activeEntries) {
    await withdrawNativeInput(String(catalog.id));
  }
  return activeEntries.length;
}
