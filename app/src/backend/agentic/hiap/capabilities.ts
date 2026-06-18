import { Op } from "sequelize";

import { db } from "@/models";
import ActionPlanService from "@/backend/hiap/ActionPlanService";
import { hiapApiWrapper } from "@/backend/hiap/HiapApiService";
import { buildHiapContext } from "@/backend/agentic/hiap/context";
import type { Inventory } from "@/models/Inventory";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function updateHiapSelection(params: {
  inventory: Inventory;
  selectedActionIds: string[];
  actionType: "mitigation" | "adaptation";
  lng: string;
  authorId: string;
}) {
  const rankings = await db.models.HighImpactActionRanking.findAll({
    where: { inventoryId: params.inventory.inventoryId },
  });
  const rankingIds = rankings.map((ranking) => ranking.id);
  const rankedActionIds = params.selectedActionIds.filter((id) =>
    UUID_REGEX.test(id),
  );
  const unrankedActionIds = params.selectedActionIds.filter(
    (id) => !UUID_REGEX.test(id),
  );

  let updated = 0;

  if (rankingIds.length > 0) {
    await db.models.HighImpactActionRanked.update(
      { isSelected: false },
      {
        where: {
          id: { [Op.not]: rankedActionIds },
          hiaRankingId: rankingIds,
        },
      },
    );

    if (rankedActionIds.length > 0) {
      const [affected] = await db.models.HighImpactActionRanked.update(
        { isSelected: true },
        {
          where: {
            id: rankedActionIds,
            hiaRankingId: rankingIds,
          },
        },
      );
      updated += affected;
    }
  }

  await db.models.UnrankedActionSelection.destroy({
    where: { inventoryId: params.inventory.inventoryId },
  });

  if (unrankedActionIds.length > 0) {
    await db.models.UnrankedActionSelection.bulkCreate(
      unrankedActionIds.map((actionId) => ({
        inventoryId: params.inventory.inventoryId,
        actionId,
        actionType: params.actionType,
        lang: params.lng,
        isSelected: true,
      })),
    );
    updated += unrankedActionIds.length;
  }

  return {
    success: true,
    updated,
    selectedActionIds: params.selectedActionIds,
  };
}

export async function rerankHiapAction(params: {
  inventory: Inventory;
  actionId: string;
  actionType: "mitigation" | "adaptation";
  targetRank: number;
  lng: string;
}) {
  const ranking = await db.models.HighImpactActionRanking.findOne({
    where: {
      inventoryId: params.inventory.inventoryId,
      type: params.actionType,
    },
    order: [["last_updated", "DESC"]],
  });

  if (!ranking) {
    throw new Error("HIAP ranking not found for current inventory");
  }

  const rankedActions = await db.models.HighImpactActionRanked.findAll({
    where: {
      hiaRankingId: ranking.id,
      type: params.actionType,
      lang: params.lng,
    },
    order: [
      ["rank", "ASC"],
      ["name", "ASC"],
    ],
  });

  const currentIndex = rankedActions.findIndex(
    (action) =>
      action.id === params.actionId || action.actionId === params.actionId,
  );
  if (currentIndex < 0) {
    throw new Error("Only ranked HIAP actions can be reranked");
  }

  const targetIndex = Math.max(
    0,
    Math.min(params.targetRank - 1, rankedActions.length - 1),
  );
  const [movedAction] = rankedActions.splice(currentIndex, 1);
  rankedActions.splice(targetIndex, 0, movedAction);

  await Promise.all(
    rankedActions.map((action, index) =>
      action.update({
        rank: index + 1,
      }),
    ),
  );

  return {
    success: true,
    ui_event: "hiap_rerank_action_applied",
    actionId: movedAction.actionId,
    rankedActionId: movedAction.id,
    actionName: movedAction.name,
    actionType: params.actionType,
    previousRank: currentIndex + 1,
    newRank: targetIndex + 1,
  };
}

export async function generateHiapActionPlan(params: {
  inventory: Inventory;
  actionId: string;
  actionType: "mitigation" | "adaptation";
  lng: string;
  createdBy: string;
}) {
  const context = await buildHiapContext({
    inventory: params.inventory,
    lng: params.lng,
  });
  if (!params.inventory.cityId) {
    throw new Error(
      "HIAP action plan generation requires an inventory city id",
    );
  }
  const actionSet =
    params.actionType === "mitigation"
      ? context.mitigation
      : context.adaptation;
  const action = [
    ...actionSet.rankedActions,
    ...actionSet.unrankedActions,
  ].find((candidate: any) => candidate.actionId === params.actionId);

  if (!action) {
    throw new Error("HIAP action not found in current inventory context");
  }

  return hiapApiWrapper.startActionPlanJob({
    action: action as any,
    cityId: params.inventory.cityId,
    cityLocode: context.city.locode as string,
    lng: params.lng as any,
    inventoryId: params.inventory.inventoryId,
    createdBy: params.createdBy,
  });
}

export async function readHiapActionPlan(params: {
  cityId: string;
  actionId: string;
  lng: string;
}) {
  const plans = await ActionPlanService.fetchOrTranslateActionPlan(
    params.cityId,
    params.lng,
    params.actionId,
  );
  return {
    actionId: params.actionId,
    plans,
  };
}
