import { createHash } from "node:crypto";
import { Op } from "sequelize";

import { db } from "@/models";
import type { ActionPlan } from "@/models/ActionPlan";
import type { HighImpactActionRanking } from "@/models/HighImpactActionRanking";
import {
  registerNativeInput,
  supersedeNativeInput,
  withdrawNativeInput,
  type RegisterNativeInputInput,
} from "@/backend/NativeInputCatalogService";
import { HighImpactActionRankingStatus, type ACTION_TYPES } from "@/util/types";
import { logger } from "@/services/logger";

const HIAP_MODULE = "hiap" as const;
const RANKING_SOURCE_TYPE = "hiap_ranking" as const;
const RANKED_SELECTION_SOURCE_TYPE = "hiap_ranked_selection" as const;
const UNRANKED_SELECTION_SOURCE_TYPE = "hiap_unranked_selection" as const;
const ACTION_PLAN_SOURCE_TYPE = "action_plan" as const;

type HiapCatalogScope = {
  userId: string | null;
  inventoryId: string | null;
  cityId: string | null;
  projectId: string | null;
  organizationId: string | null;
};

type SelectionRegistration = {
  input: RegisterNativeInputInput;
  catalogId: string;
  actionId: string;
};

type SelectionSourceType =
  typeof RANKED_SELECTION_SOURCE_TYPE | typeof UNRANKED_SELECTION_SOURCE_TYPE;

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
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

async function resolveScope({
  inventoryId,
  cityId,
  userId,
}: {
  inventoryId?: string | null;
  cityId?: string | null;
  userId?: string | null;
}): Promise<HiapCatalogScope> {
  let inventory = inventoryId
    ? await db.models.Inventory.findByPk(inventoryId, {
        include: [
          {
            model: db.models.City,
            as: "city",
            include: [
              {
                model: db.models.Project,
                as: "project",
                include: [
                  {
                    model: db.models.Organization,
                    as: "organization",
                  },
                ],
              },
            ],
          },
        ],
      })
    : null;

  const city =
    inventory?.city ??
    (cityId && db.models.City
      ? await db.models.City.findByPk(cityId, {
          include: [
            {
              model: db.models.Project,
              as: "project",
              include: [
                {
                  model: db.models.Organization,
                  as: "organization",
                },
              ],
            },
          ],
        })
      : null);

  inventory = inventory ?? null;
  const project = city?.project;
  const organization = project?.organization;

  return {
    userId: userId ?? null,
    inventoryId: inventory?.inventoryId ?? inventoryId ?? null,
    cityId: inventory?.cityId ?? city?.cityId ?? cityId ?? null,
    projectId: city?.projectId ?? project?.projectId ?? null,
    organizationId:
      project?.organizationId ?? organization?.organizationId ?? null,
  };
}

function ensureScope(scope: HiapCatalogScope): void {
  if (
    !scope.userId &&
    !scope.inventoryId &&
    !scope.cityId &&
    !scope.projectId &&
    !scope.organizationId
  ) {
    throw new Error("HIAP catalog registration requires a scope identifier");
  }
}

export async function resolveHIAPCatalogScope(input: {
  inventoryId?: string | null;
  cityId?: string | null;
  userId?: string | null;
}): Promise<HiapCatalogScope> {
  const scope = await resolveScope(input);
  ensureScope(scope);
  return scope;
}

async function supersedePreviousVersions(
  sourceType: string,
  sourcePrefix: string,
  replacement: RegisterNativeInputInput,
  replacementCatalogId: string,
): Promise<void> {
  const previous = await db.models.NativeInputCatalog.findAll({
    where: {
      owningModule: HIAP_MODULE,
      sourceType,
      sourceId: { [Op.like]: `${sourcePrefix}%` },
      availability: "active",
    },
  });

  for (const catalog of previous) {
    if (catalog.id === replacementCatalogId) continue;
    await supersedeNativeInput(catalog.id, replacement);
  }
}

export async function buildHIAPRankingInput(
  ranking: HighImpactActionRanking,
): Promise<RegisterNativeInputInput> {
  if (ranking.status !== HighImpactActionRankingStatus.SUCCESS) {
    throw new Error("Only successful HIAP rankings can enter the catalog");
  }

  const rankedActions = await db.models.HighImpactActionRanked.findAll({
    where: { hiaRankingId: ranking.id },
    attributes: ["actionId", "rank", "lang", "type", "isSelected"],
    order: [
      ["actionId", "ASC"],
      ["lang", "ASC"],
    ],
  });
  if (rankedActions.length === 0) {
    throw new Error("Only persisted HIAP rankings can enter the catalog");
  }

  const scope = await resolveScope({
    inventoryId: ranking.inventoryId,
    userId: ranking.userId,
  });
  ensureScope(scope);

  const contentDigest = digest(
    rankedActions.map((action) => ({
      actionId: action.actionId,
      rank: action.rank,
      lang: action.lang,
      type: action.type,
      isSelected: action.isSelected,
    })),
  );
  const input: RegisterNativeInputInput = {
    kind: "hiap_ranking",
    owningModule: HIAP_MODULE,
    sourceType: RANKING_SOURCE_TYPE,
    sourceId: `${ranking.id}:${contentDigest}`,
    ...scope,
    contentDigest,
    markdownReady: false,
    labels: {
      rankingId: ranking.id,
      actionType: ranking.type,
      locode: ranking.locode,
      languages: ranking.langs,
      actionCount: rankedActions.length,
    },
  };

  return input;
}

export async function registerHIAPRanking(ranking: HighImpactActionRanking) {
  const input = await buildHIAPRankingInput(ranking);
  const registration = await registerNativeInput(input);
  await supersedePreviousVersions(
    RANKING_SOURCE_TYPE,
    `${ranking.id}:`,
    input,
    registration.catalog.id,
  );
  return registration;
}

export async function backfillMissingHIAPRankings(): Promise<number> {
  const successfulRankings = await db.models.HighImpactActionRanking.findAll({
    where: { status: HighImpactActionRankingStatus.SUCCESS },
    include: [
      {
        model: db.models.Inventory,
        as: "inventory",
        required: true,
      },
      {
        model: db.models.HighImpactActionRanked,
        as: "highImpactActionRanked",
        attributes: ["id"],
        required: true,
      },
    ],
    order: [["created", "ASC"]],
  });

  let backfilledCount = 0;

  for (const ranking of successfulRankings) {
    const existingCatalogEntry = await db.models.NativeInputCatalog.findOne({
      where: {
        owningModule: HIAP_MODULE,
        sourceType: RANKING_SOURCE_TYPE,
        sourceId: { [Op.like]: `${ranking.id}:%` },
        availability: "active",
      },
    });

    if (existingCatalogEntry) continue;

    const registration = await syncHIAPRanking(ranking);
    if (registration) {
      backfilledCount++;
      logger.info(
        { rankingId: ranking.id, inventoryId: ranking.inventoryId },
        "Backfilled missing HIAP ranking catalog entry",
      );
    }
  }

  return backfilledCount;
}

function planContent(plan: ActionPlan): Record<string, unknown> {
  return {
    actionId: plan.actionId,
    highImpactActionRankedId: plan.highImpactActionRankedId,
    cityLocode: plan.cityLocode,
    cityId: plan.cityId,
    inventoryId: plan.inventoryId,
    actionName: plan.actionName,
    language: plan.language,
    cityName: plan.cityName,
    createdAtTimestamp: plan.createdAtTimestamp,
    cityDescription: plan.cityDescription,
    actionDescription: plan.actionDescription,
    nationalStrategyExplanation: plan.nationalStrategyExplanation,
    subactions: plan.subactions,
    institutions: plan.institutions,
    milestones: plan.milestones,
    timeline: plan.timeline,
    costBudget: plan.costBudget,
    merIndicators: plan.merIndicators,
    mitigations: plan.mitigations,
    adaptations: plan.adaptations,
    sdgs: plan.sdgs,
  };
}

function actionPlanSourceId(plan: ActionPlan): string {
  return `${plan.id}:${digest(planContent(plan))}`;
}

export async function buildHIAPActionPlanInput(
  plan: ActionPlan,
): Promise<RegisterNativeInputInput> {
  if (!plan.id)
    throw new Error("Only persisted HIAP action plans can enter the catalog");

  const contentDigest = digest(planContent(plan));
  const scope = await resolveScope({
    inventoryId: plan.inventoryId,
    cityId: plan.cityId,
    userId: plan.createdBy,
  });
  ensureScope(scope);

  const input: RegisterNativeInputInput = {
    kind: "hiap_action_plan",
    owningModule: HIAP_MODULE,
    sourceType: ACTION_PLAN_SOURCE_TYPE,
    sourceId: actionPlanSourceId(plan),
    ...scope,
    contentDigest,
    markdownReady: false,
    labels: {
      actionPlanId: plan.id,
      actionId: plan.actionId,
      language: plan.language,
    },
  };

  return input;
}

export async function registerHIAPActionPlan(plan: ActionPlan) {
  const input = await buildHIAPActionPlanInput(plan);

  const registration = await registerNativeInput(input);
  await supersedePreviousVersions(
    ACTION_PLAN_SOURCE_TYPE,
    `${plan.id}:`,
    input,
    registration.catalog.id,
  );
  return registration;
}

export async function backfillMissingHIAPActionPlans(): Promise<number> {
  const actionPlans = await db.models.ActionPlan.findAll({
    where: {
      inventoryId: { [Op.ne]: null },
      highImpactActionRankedId: { [Op.ne]: null },
    },
    order: [["created", "ASC"]],
  });

  let backfilledCount = 0;

  for (const actionPlan of actionPlans) {
    const existingCatalogEntry = await db.models.NativeInputCatalog.findOne({
      where: {
        owningModule: HIAP_MODULE,
        sourceType: ACTION_PLAN_SOURCE_TYPE,
        sourceId: actionPlanSourceId(actionPlan),
        availability: "active",
      },
    });

    if (existingCatalogEntry) continue;

    const registration = await syncHIAPActionPlan(actionPlan);
    if (registration) {
      backfilledCount++;
      logger.info(
        { actionPlanId: actionPlan.id, inventoryId: actionPlan.inventoryId },
        "Backfilled missing HIAP action-plan catalog entry",
      );
    }
  }

  return backfilledCount;
}

function selectionSourceId(
  sourceType: SelectionSourceType,
  inventoryId: string,
  actionType: ACTION_TYPES,
  actionId: string,
  rankingId?: string,
): string {
  if (sourceType === RANKED_SELECTION_SOURCE_TYPE) {
    if (!rankingId) throw new Error("Ranked HIAP selections require a ranking");
    return `${rankingId}:${actionId}`;
  }
  return `${inventoryId}:${actionType}:${actionId}`;
}

export function buildHIAPSelectionInput(
  sourceType: SelectionSourceType,
  inventoryId: string,
  actionType: ACTION_TYPES,
  actionId: string,
  scope: HiapCatalogScope,
  rankingId?: string,
): RegisterNativeInputInput {
  return {
    kind: "hiap_selection",
    owningModule: HIAP_MODULE,
    sourceType,
    sourceId: selectionSourceId(
      sourceType,
      inventoryId,
      actionType,
      actionId,
      rankingId,
    ),
    ...scope,
    markdownReady: false,
    labels: {
      inventoryId,
      actionType,
      actionId,
      rankingId: rankingId ?? null,
    },
  };
}

async function registerSelection(
  sourceType: SelectionSourceType,
  inventoryId: string,
  actionType: ACTION_TYPES,
  actionId: string,
  scope: HiapCatalogScope,
  rankingId?: string,
): Promise<SelectionRegistration> {
  const input = buildHIAPSelectionInput(
    sourceType,
    inventoryId,
    actionType,
    actionId,
    scope,
    rankingId,
  );
  const registration = await registerNativeInput(input);
  return {
    input,
    catalogId: registration.catalog.id,
    actionId,
  };
}

function selectionKey(
  sourceType: SelectionSourceType,
  actionId: string,
): string {
  return `${sourceType}:${actionId}`;
}

async function withdrawOrSupersedeStaleSelections(
  inventoryId: string,
  actionType: ACTION_TYPES,
  registrations: SelectionRegistration[],
): Promise<void> {
  const replacementByKey = new Map(
    registrations.map((registration) => [
      selectionKey(
        registration.input.sourceType as SelectionSourceType,
        registration.actionId,
      ),
      registration,
    ]),
  );
  const activeSelections = await db.models.NativeInputCatalog.findAll({
    where: {
      owningModule: HIAP_MODULE,
      inventoryId,
      sourceType: {
        [Op.in]: [RANKED_SELECTION_SOURCE_TYPE, UNRANKED_SELECTION_SOURCE_TYPE],
      },
      availability: "active",
    },
  });

  for (const catalog of activeSelections) {
    if (catalog.labels?.actionType !== actionType) continue;

    const actionId =
      typeof catalog.labels?.actionId === "string"
        ? catalog.labels.actionId
        : null;
    const key = actionId
      ? selectionKey(catalog.sourceType as SelectionSourceType, actionId)
      : null;
    const replacement = key ? replacementByKey.get(key) : undefined;

    if (replacement && replacement.catalogId !== catalog.id) {
      await supersedeNativeInput(catalog.id, replacement.input);
    } else if (!replacement) {
      await withdrawNativeInput(catalog.id);
    }
  }
}

export async function registerHIAPSelections({
  inventoryId,
  actionType,
  authorId,
}: {
  inventoryId: string;
  actionType: ACTION_TYPES;
  authorId: string;
}) {
  const ranking = await db.models.HighImpactActionRanking.findOne({
    where: {
      inventoryId,
      type: actionType,
      status: HighImpactActionRankingStatus.SUCCESS,
    },
    order: [["created", "DESC"]],
  });
  const scope = await resolveScope({ inventoryId, userId: authorId });
  ensureScope(scope);
  const registrations: SelectionRegistration[] = [];

  if (ranking) {
    const rankedActions = await db.models.HighImpactActionRanked.findAll({
      where: {
        hiaRankingId: ranking.id,
        type: actionType,
        isSelected: true,
      },
      attributes: ["actionId"],
    });
    const rankedActionIds = [
      ...new Set(rankedActions.map((action) => action.actionId)),
    ];
    for (const actionId of rankedActionIds) {
      registrations.push(
        await registerSelection(
          RANKED_SELECTION_SOURCE_TYPE,
          inventoryId,
          actionType,
          actionId,
          scope,
          ranking.id,
        ),
      );
    }
  }

  const unrankedActions = await db.models.UnrankedActionSelection.findAll({
    where: { inventoryId, actionType, isSelected: true },
    attributes: ["actionId"],
  });
  const unrankedActionIds = [
    ...new Set(unrankedActions.map((action) => action.actionId)),
  ];
  for (const actionId of unrankedActionIds) {
    registrations.push(
      await registerSelection(
        UNRANKED_SELECTION_SOURCE_TYPE,
        inventoryId,
        actionType,
        actionId,
        scope,
      ),
    );
  }

  await withdrawOrSupersedeStaleSelections(
    inventoryId,
    actionType,
    registrations,
  );
  return registrations;
}

export async function withdrawHIAPActionPlanCatalog(
  actionPlanId: string,
): Promise<number> {
  const [updated] = await db.models.NativeInputCatalog.update(
    { availability: "withdrawn" },
    {
      where: {
        owningModule: HIAP_MODULE,
        sourceType: ACTION_PLAN_SOURCE_TYPE,
        sourceId: { [Op.like]: `${actionPlanId}:%` },
        availability: "active",
      },
    },
  );
  return updated;
}

export async function withdrawHIAPCatalogForInventory(
  inventoryId: string,
): Promise<number> {
  const [updated] = await db.models.NativeInputCatalog.update(
    { availability: "withdrawn" },
    {
      where: {
        owningModule: HIAP_MODULE,
        inventoryId,
        availability: "active",
      },
    },
  );
  logger.info(
    { inventoryId, withdrawn: updated },
    "Withdrew HIAP catalog entries for inventory",
  );
  return updated;
}

export async function withdrawHIAPCatalogForCity(
  cityId: string,
): Promise<number> {
  const [updated] = await db.models.NativeInputCatalog.update(
    { availability: "withdrawn" },
    {
      where: {
        owningModule: HIAP_MODULE,
        cityId,
        availability: "active",
      },
    },
  );
  logger.info(
    { cityId, withdrawn: updated },
    "Withdrew HIAP catalog entries for city",
  );
  return updated;
}

async function tryCatalogSync<T>(
  operation: () => Promise<T>,
  context: Record<string, unknown>,
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    logger.error(
      { err: error, ...context },
      "HIAP NativeInputCatalog synchronization failed; it can be retried",
    );
    return null;
  }
}

export function syncHIAPRanking(ranking: HighImpactActionRanking) {
  return tryCatalogSync(() => registerHIAPRanking(ranking), {
    rankingId: ranking.id,
    inventoryId: ranking.inventoryId,
    catalogKind: "hiap_ranking",
  });
}

export function syncHIAPSelections(input: {
  inventoryId: string;
  actionType: ACTION_TYPES;
  authorId: string;
}) {
  return tryCatalogSync(() => registerHIAPSelections(input), {
    inventoryId: input.inventoryId,
    actionType: input.actionType,
    catalogKind: "hiap_selection",
  });
}

export function syncHIAPActionPlan(plan: ActionPlan) {
  return tryCatalogSync(() => registerHIAPActionPlan(plan), {
    actionPlanId: plan.id,
    inventoryId: plan.inventoryId,
    catalogKind: "hiap_action_plan",
  });
}
