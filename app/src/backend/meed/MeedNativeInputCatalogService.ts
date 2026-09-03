import { Op, QueryTypes, type Transaction } from "sequelize";

import { db } from "@/models";
import {
  registerNativeInput,
  withdrawNativeInput,
  type RegisterNativeInputInput,
  type NativeInputCatalogRegistration,
} from "@/backend/NativeInputCatalogService";
import type { NativeInputCatalog } from "@/models/NativeInputCatalog";
import { logger } from "@/services/logger";

const MEED_MODULE = "hiap_meed" as const;
const MEED_RANKING_SOURCE_TYPE = "hiap_meed_ranking" as const;
const MEED_RANKING_LOCK_PREFIX = "citycatalyst:hiap-meed-ranking:";

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
  inventoryId: string | null;
  cityId: string | null;
  projectId: string | null;
  organizationId: string | null;
};

type CatalogModel = {
  findAll: (options: Record<string, unknown>) => Promise<NativeInputCatalog[]>;
  findOne: (
    options: Record<string, unknown>,
  ) => Promise<NativeInputCatalog | null>;
};

type MeedRankingModel = {
  findAll: (options: Record<string, unknown>) => Promise<MeedRankingLike[]>;
  findByPk: (
    id: string,
    options?: Record<string, unknown>,
  ) => Promise<MeedRankingLike | null>;
};

type MeedActionModel = {
  findAll: (
    options: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>;
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

async function resolveScope(
  ranking: MeedRankingLike,
  transaction?: Transaction,
): Promise<CatalogScope> {
  const inventory = ranking.inventoryId
    ? await db.models.Inventory.findByPk(ranking.inventoryId, {
        transaction,
        include: [
          {
            model: db.models.City,
            as: "city",
            include: [
              {
                model: db.models.Project,
                as: "project",
                include: [
                  { model: db.models.Organization, as: "organization" },
                ],
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
    inventoryId: inventory?.inventoryId ?? ranking.inventoryId ?? null,
    cityId: inventory?.cityId ?? city?.cityId ?? null,
    projectId: city?.projectId ?? project?.projectId ?? null,
    organizationId:
      project?.organizationId ?? organization?.organizationId ?? null,
  };

  if (
    !scope.inventoryId &&
    !scope.cityId &&
    !scope.projectId &&
    !scope.organizationId
  ) {
    throw new Error("MEED catalog registration requires a scope identifier");
  }

  return scope;
}

async function loadRanking(
  rankingId: string,
  transaction?: Transaction,
): Promise<MeedRankingLike> {
  const ranking = await models().MeedRanking.findByPk(rankingId, {
    transaction,
  });
  if (!ranking) throw new Error("MEED ranking not found");
  return ranking;
}

async function buildMEEDRankingInput(
  ranking: MeedRankingLike,
  transaction?: Transaction,
): Promise<RegisterNativeInputInput> {
  if (ranking.status !== "completed") {
    throw new Error("Only completed MEED rankings can enter the catalog");
  }
  if (!ranking.inventoryId) {
    throw new Error("MEED rankings require an inventory");
  }
  if (!ranking.inputDigest || !ranking.contentDigest) {
    throw new Error(
      "Completed MEED rankings require input and content digests",
    );
  }

  const rankedActions = await models().MeedActionRanked.findAll({
    where: { rankingId: ranking.id },
    attributes: ["id"],
    transaction,
  });
  const removedActions = await models().MeedActionRemoved.findAll({
    where: { rankingId: ranking.id },
    attributes: ["id"],
    transaction,
  });
  const actionCount = rankedActions.length + removedActions.length;
  if (actionCount === 0) {
    throw new Error("Only persisted MEED rankings can enter the catalog");
  }

  const scope = await resolveScope(ranking, transaction);
  const sourceId = ranking.id;

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

async function lockMEEDInventory(
  transaction: Transaction,
  inventoryId: string,
): Promise<void> {
  if (!db.sequelize) {
    throw new Error("Database is not initialized");
  }

  await db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext($1))", {
    replacements: [`${MEED_RANKING_LOCK_PREFIX}${inventoryId}`],
    transaction,
    type: QueryTypes.SELECT,
  });
}

function compareRankingOrder(
  left: MeedRankingLike,
  right: MeedRankingLike,
): number {
  if (!left.created || !right.created) {
    throw new Error("MEED rankings require a created timestamp");
  }

  const createdDifference = left.created.getTime() - right.created.getTime();
  if (createdDifference !== 0) return createdDifference;
  if (left.id === right.id) return 0;
  return left.id > right.id ? 1 : -1;
}

async function findActiveMEEDEntries(
  input: RegisterNativeInputInput,
  transaction: Transaction,
): Promise<NativeInputCatalog[]> {
  return models().NativeInputCatalog.findAll({
    where: {
      owningModule: MEED_MODULE,
      sourceType: MEED_RANKING_SOURCE_TYPE,
      inventoryId: input.inventoryId,
      availability: "active",
    },
    transaction,
  });
}

async function supersedeCatalogEntry(
  catalog: NativeInputCatalog,
  replacementCatalogId: string,
  transaction: Transaction,
): Promise<void> {
  if (catalog.id === replacementCatalogId) return;
  await catalog.update(
    {
      availability: "superseded",
      supersededById: replacementCatalogId,
    },
    { transaction },
  );
}

async function reconcileMEEDCatalogInTransaction(
  ranking: MeedRankingLike,
  input: RegisterNativeInputInput,
  registration: NativeInputCatalogRegistration,
  transaction: Transaction,
): Promise<void> {
  const activeEntries = await findActiveMEEDEntries(input, transaction);
  const entries = activeEntries.some(
    (catalog) => catalog.id === registration.catalog.id,
  )
    ? activeEntries
    : [...activeEntries, registration.catalog];

  const rankedEntries = await Promise.all(
    entries.map(async (catalog) => ({
      catalog,
      ranking:
        catalog.id === registration.catalog.id
          ? ranking
          : await loadRanking(String(catalog.sourceId), transaction),
    })),
  );
  const winner = rankedEntries.reduce((current, candidate) =>
    compareRankingOrder(candidate.ranking, current.ranking) > 0
      ? candidate
      : current,
  );

  for (const entry of rankedEntries) {
    await supersedeCatalogEntry(entry.catalog, winner.catalog.id, transaction);
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
  if (!db.sequelize) {
    throw new Error("Database is not initialized");
  }

  return db.sequelize.transaction(async (transaction) => {
    const ranking = await loadRanking(rankingId, transaction);
    if (!ranking.inventoryId) {
      throw new Error("MEED rankings require an inventory");
    }
    await lockMEEDInventory(transaction, ranking.inventoryId);

    const input = await buildMEEDRankingInput(ranking, transaction);
    const existing = await models().NativeInputCatalog.findOne({
      where: {
        owningModule: MEED_MODULE,
        sourceType: MEED_RANKING_SOURCE_TYPE,
        sourceId: input.sourceId,
        availability: { [Op.ne]: "withdrawn" },
      },
      transaction,
    });
    if (existing?.availability === "superseded") {
      return { catalog: existing, created: false };
    }

    const registration = existing
      ? { catalog: existing, created: false }
      : await registerNativeInput(input, transaction);
    await reconcileMEEDCatalogInTransaction(
      ranking,
      input,
      registration,
      transaction,
    );
    return registration;
  });
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
      rankings.length > 0 ? cursorFor(rankings[rankings.length - 1]) : null,
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
