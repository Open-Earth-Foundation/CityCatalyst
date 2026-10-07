import { createHash } from "node:crypto";
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
import { isCompleteMEEDOutputPlan } from "@/backend/meed/meedOutputPlan";

const MEED_MODULE = "hiap_meed" as const;
const MEED_RANKING_SOURCE_TYPE = "hiap_meed_ranking" as const;
const MEED_OUTPUT_PLAN_SOURCE_TYPE = "hiap_meed_output_plan" as const;
const MEED_RANKING_LOCK_PREFIX = "citycatalyst:hiap-meed-ranking:";
const MEED_OUTPUT_PLAN_LOCK_PREFIX = "citycatalyst:hiap-meed-output-plan:";

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

type MeedActionReportLike = {
  id: string;
  inventoryId?: string | null;
  actionId?: string | null;
  catalogEligible?: boolean | null;
  languages?: string[] | null;
  chapters?: unknown;
  authorityScopeClassification?: unknown;
  created?: Date;
};

type OrderedSource = {
  id: string;
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

type MeedActionReportModel = {
  findAll: (
    options: Record<string, unknown>,
  ) => Promise<MeedActionReportLike[]>;
  findByPk: (
    id: string,
    options?: Record<string, unknown>,
  ) => Promise<MeedActionReportLike | null>;
};

type MeedActionModel = {
  findAll: (
    options: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>;
};

type MeedModels = typeof db.models & {
  NativeInputCatalog: CatalogModel;
  MeedRanking: MeedRankingModel;
  MeedActionReport: MeedActionReportModel;
  MeedActionRanked: MeedActionModel;
  MeedActionRemoved: MeedActionModel;
};

function models(): MeedModels {
  return db.models as MeedModels;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

async function resolveScope(
  inventoryId: string | null | undefined,
  transaction?: Transaction,
): Promise<CatalogScope> {
  const inventory = inventoryId
    ? await db.models.Inventory.findByPk(inventoryId, {
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
    inventoryId: inventory?.inventoryId ?? inventoryId ?? null,
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

async function loadReport(
  reportId: string,
  transaction?: Transaction,
): Promise<MeedActionReportLike> {
  const report = await models().MeedActionReport.findByPk(reportId, {
    transaction,
  });
  if (!report) throw new Error("MEED output plan not found");
  return report;
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

  const scope = await resolveScope(ranking.inventoryId, transaction);
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

export async function buildMEEDOutputPlanInput(
  report: MeedActionReportLike,
  transaction?: Transaction,
): Promise<RegisterNativeInputInput> {
  if (!report.inventoryId) {
    throw new Error("MEED output plans require an inventory");
  }
  if (!report.actionId) {
    throw new Error("MEED output plans require an action");
  }
  if (
    !isCompleteMEEDOutputPlan({
      catalogEligible: report.catalogEligible,
      languages: report.languages,
      chapters: report.chapters,
    })
  ) {
    throw new Error("Only complete MEED output plans can enter the catalog");
  }

  const languages = report.languages ?? [];
  const chapters = report.chapters;
  const contentDigest = digest({
    actionId: report.actionId,
    languages,
    chapters,
    authorityScopeClassification: report.authorityScopeClassification ?? null,
  });
  const scope = await resolveScope(report.inventoryId, transaction);
  const chapterCount = Array.isArray(chapters)
    ? chapters.length
    : Object.keys((chapters as Record<string, unknown>) ?? {}).length;

  return {
    kind: "hiap_meed_output_plan",
    owningModule: MEED_MODULE,
    sourceType: MEED_OUTPUT_PLAN_SOURCE_TYPE,
    sourceId: report.id,
    ...scope,
    contentDigest,
    markdownReady: false,
    labels: {
      reportId: report.id,
      actionId: report.actionId,
      languages,
      chapterCount,
    },
  };
}

async function lockMEEDKey(
  transaction: Transaction,
  lockKey: string,
): Promise<void> {
  if (!db.sequelize) {
    throw new Error("Database is not initialized");
  }

  await db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext($1))", {
    bind: [lockKey],
    transaction,
    type: QueryTypes.SELECT,
  });
}

function compareSourceOrder(left: OrderedSource, right: OrderedSource): number {
  if (!left.created || !right.created) {
    throw new Error("MEED catalog sources require a created timestamp");
  }

  const createdDifference = left.created.getTime() - right.created.getTime();
  if (createdDifference !== 0) return createdDifference;
  if (left.id === right.id) return 0;
  return left.id > right.id ? 1 : -1;
}

async function findActiveMEEDEntries(
  sourceType: string,
  inventoryId: string | null | undefined,
  transaction: Transaction,
  actionId?: string | null,
): Promise<NativeInputCatalog[]> {
  const where: Record<string, unknown> = {
    owningModule: MEED_MODULE,
    sourceType,
    inventoryId,
    availability: "active",
  };
  if (actionId) {
    where.labels = { [Op.contains]: { actionId } };
  }

  return models().NativeInputCatalog.findAll({
    where,
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

async function reconcileMEEDCatalogInTransaction<T extends OrderedSource>(
  source: T,
  input: RegisterNativeInputInput,
  registration: NativeInputCatalogRegistration,
  transaction: Transaction,
  options: {
    sourceType: string;
    loadSource: (sourceId: string, transaction: Transaction) => Promise<T>;
    actionId?: string | null;
  },
): Promise<void> {
  const activeEntries = await findActiveMEEDEntries(
    options.sourceType,
    input.inventoryId,
    transaction,
    options.actionId,
  );
  const entries = activeEntries.some(
    (catalog) => catalog.id === registration.catalog.id,
  )
    ? activeEntries
    : [...activeEntries, registration.catalog];

  const rankedEntries = await Promise.all(
    entries.map(async (catalog) => ({
      catalog,
      source:
        catalog.id === registration.catalog.id
          ? source
          : await options.loadSource(String(catalog.sourceId), transaction),
    })),
  );
  const winner = rankedEntries.reduce((current, candidate) =>
    compareSourceOrder(candidate.source, current.source) > 0
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

function cursorFor(record: OrderedSource): MEEDCatalogBackfillCursor {
  if (!record.created) {
    throw new Error(
      `MEED catalog backfill source ${record.id} has no created timestamp`,
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
    await lockMEEDKey(
      transaction,
      `${MEED_RANKING_LOCK_PREFIX}${ranking.inventoryId}`,
    );

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
      {
        sourceType: MEED_RANKING_SOURCE_TYPE,
        loadSource: loadRanking,
      },
    );
    return registration;
  });
}

export async function registerMEEDOutputPlan(
  reportId: string,
): Promise<NativeInputCatalogRegistration> {
  if (!db.sequelize) {
    throw new Error("Database is not initialized");
  }

  return db.sequelize.transaction(async (transaction) => {
    const report = await loadReport(reportId, transaction);
    if (!report.inventoryId) {
      throw new Error("MEED output plans require an inventory");
    }
    if (!report.actionId) {
      throw new Error("MEED output plans require an action");
    }
    await lockMEEDKey(
      transaction,
      `${MEED_OUTPUT_PLAN_LOCK_PREFIX}${report.inventoryId}:${report.actionId}`,
    );

    const input = await buildMEEDOutputPlanInput(report, transaction);
    const existing = await models().NativeInputCatalog.findOne({
      where: {
        owningModule: MEED_MODULE,
        sourceType: MEED_OUTPUT_PLAN_SOURCE_TYPE,
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
      report,
      input,
      registration,
      transaction,
      {
        sourceType: MEED_OUTPUT_PLAN_SOURCE_TYPE,
        loadSource: loadReport,
        actionId: report.actionId,
      },
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

export async function backfillMissingMEEDOutputPlansPage(
  options: MEEDCatalogBackfillPageOptions,
): Promise<MEEDCatalogBackfillPage> {
  validateBackfillLimit(options.limit);

  const reports = await models().MeedActionReport.findAll({
    where: { ...cursorWhere(options.cursor) },
    order: [
      ["created", "ASC"],
      ["id", "ASC"],
    ],
    limit: options.limit,
  });

  let repaired = 0;
  let failed = 0;

  for (const report of reports) {
    if (
      !isCompleteMEEDOutputPlan({
        catalogEligible: report.catalogEligible,
        languages: report.languages,
        chapters: report.chapters,
      })
    ) {
      logger.warn(
        {
          reportId: report.id,
          inventoryId: report.inventoryId,
          actionId: report.actionId,
        },
        "Skipped ineligible MEED output plan during catalog backfill",
      );
      continue;
    }

    try {
      if (options.dryRun) {
        await buildMEEDOutputPlanInput(report);
        repaired++;
      } else {
        const registration = await registerMEEDOutputPlan(report.id);
        if (registration.created) {
          repaired++;
          logger.info(
            {
              reportId: report.id,
              inventoryId: report.inventoryId,
              actionId: report.actionId,
            },
            "Backfilled missing MEED output plan catalog entry",
          );
        }
      }
    } catch (error) {
      failed++;
      logger.error(
        {
          error,
          reportId: report.id,
          inventoryId: report.inventoryId,
          actionId: report.actionId,
        },
        "Failed to backfill MEED output plan catalog entry",
      );
    }
  }

  const hasMore = reports.length === options.limit;
  return {
    scanned: reports.length,
    repaired,
    failed,
    hasMore,
    nextCursor:
      reports.length > 0 ? cursorFor(reports[reports.length - 1]) : null,
  };
}

export async function withdrawMEEDOutputPlan(reportId: string): Promise<boolean> {
  const catalog = await models().NativeInputCatalog.findOne({
    where: {
      owningModule: MEED_MODULE,
      sourceType: MEED_OUTPUT_PLAN_SOURCE_TYPE,
      sourceId: reportId,
      availability: "active",
    },
  });
  if (!catalog) return false;
  await withdrawNativeInput(String(catalog.id));
  return true;
}

export async function withdrawMEEDCatalogForInventory(
  inventoryId: string,
): Promise<number> {
  const activeEntries = await models().NativeInputCatalog.findAll({
    where: {
      owningModule: MEED_MODULE,
      sourceType: {
        [Op.in]: [MEED_RANKING_SOURCE_TYPE, MEED_OUTPUT_PLAN_SOURCE_TYPE],
      },
      inventoryId,
      availability: "active",
    },
  });

  for (const catalog of activeEntries) {
    await withdrawNativeInput(String(catalog.id));
  }
  return activeEntries.length;
}
