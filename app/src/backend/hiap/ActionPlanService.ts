import createHttpError from "http-errors";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/models";
import { ActionPlan } from "@/models/ActionPlan";
import { logger } from "@/services/logger";
import { HighImpactActionRankingStatus } from "@/util/types";
import { hiapApiWrapper } from "./HiapApiService";
import { LegacyActionPlanData } from "./types";
import {
  syncHIAPActionPlan,
  withdrawHIAPActionPlanCatalog,
} from "./HiapNativeInputCatalogService";

// Interfaces updated to work with new table structure

export interface CreateActionPlanInput {
  actionId: string;
  highImpactActionRankedId?: string;
  cityLocode: string;
  cityId?: string;
  inventoryId?: string;
  actionName: string;
  language: string;

  // Plan metadata
  cityName?: string | null;
  createdAtTimestamp?: string | null;

  // Plan content from introduction
  cityDescription?: string | null;
  actionDescription?: string | null;
  nationalStrategyExplanation?: string | null;

  // Structured plan data
  subactions?: object | null;
  institutions?: object | null;
  milestones?: object | null;
  timeline?: object | null;
  costBudget?: object | null;
  merIndicators?: object | null;
  mitigations?: object | null;
  adaptations?: object | null;
  sdgs?: object | null;

  // Tracking
  createdBy?: string;
}

export interface UpdateActionPlanInput {
  id: string;
  cityId: string;
  actionName?: string;
  language?: string;

  // Plan metadata
  cityName?: string | null;
  createdAtTimestamp?: string | null;

  // Plan content
  cityDescription?: string | null;
  actionDescription?: string | null;
  nationalStrategyExplanation?: string | null;

  // Structured plan data
  subactions?: object | null;
  institutions?: object | null;
  milestones?: object | null;
  timeline?: object | null;
  costBudget?: object | null;
  merIndicators?: object | null;
  mitigations?: object | null;
  adaptations?: object | null;
  sdgs?: object | null;
}

export interface UpsertActionPlanInput {
  actionId: string;
  highImpactActionRankedId?: string;
  cityId: string;
  cityLocode: string;
  inventoryId?: string;
  actionName: string;
  language: string;
  planData: LegacyActionPlanData; // Legacy HIAP API format - will be transformed
  createdBy?: string;
}

type HIAPActionPlanContext = Pick<
  UpsertActionPlanInput,
  | "actionId"
  | "highImpactActionRankedId"
  | "cityId"
  | "cityLocode"
  | "inventoryId"
>;

export default class ActionPlanService {
  private static async validateHIAPActionPlanContext(
    input: HIAPActionPlanContext,
  ): Promise<void> {
    if (!input.inventoryId || !input.highImpactActionRankedId) {
      throw new createHttpError.BadRequest(
        "Inventory and ranked HIAP action are required",
      );
    }

    const inventory = await db.models.Inventory.findByPk(input.inventoryId, {
      include: [{ model: db.models.City, as: "city" }],
    });

    if (!inventory || inventory.cityId !== input.cityId) {
      throw new createHttpError.BadRequest(
        "Inventory does not belong to the requested city",
      );
    }

    if (inventory.city?.locode && inventory.city.locode !== input.cityLocode) {
      throw new createHttpError.BadRequest(
        "City locode does not match the requested inventory",
      );
    }

    const rankedAction = await db.models.HighImpactActionRanked.findByPk(
      input.highImpactActionRankedId,
    );
    if (!rankedAction) {
      throw new createHttpError.NotFound("Ranked HIAP action not found");
    }

    if (rankedAction.actionId !== input.actionId) {
      throw new createHttpError.BadRequest(
        "Action does not match the ranked HIAP action",
      );
    }

    const ranking = await db.models.HighImpactActionRanking.findByPk(
      rankedAction.hiaRankingId,
    );
    if (
      !ranking ||
      ranking.inventoryId !== input.inventoryId ||
      ranking.status !== HighImpactActionRankingStatus.SUCCESS
    ) {
      throw new createHttpError.BadRequest(
        "Ranked HIAP action does not belong to a successful ranking for the requested inventory",
      );
    }
  }

  private static async getValidatedActionPlanForMutation(
    id: string,
    cityId: string,
  ): Promise<ActionPlan> {
    const actionPlan = await db.models.ActionPlan.findByPk(id);
    if (!actionPlan) {
      throw new createHttpError.NotFound(`Action plan with id ${id} not found`);
    }

    if (actionPlan.cityId !== cityId) {
      throw new createHttpError.BadRequest(
        "Action plan does not belong to the requested city",
      );
    }

    await this.validateHIAPActionPlanContext({
      actionId: actionPlan.actionId,
      highImpactActionRankedId:
        actionPlan.highImpactActionRankedId ?? undefined,
      cityId,
      cityLocode: actionPlan.cityLocode,
      inventoryId: actionPlan.inventoryId ?? undefined,
    });

    return actionPlan;
  }

  public static async getActionPlanForMutation(
    id: string,
    cityId: string,
  ): Promise<ActionPlan> {
    return this.getValidatedActionPlanForMutation(id, cityId);
  }

  /**
   * Transform legacy planData format to new column structure
   */
  private static transformPlanData(
    planData: LegacyActionPlanData,
  ): Partial<CreateActionPlanInput> {
    const result: Partial<CreateActionPlanInput> = {};

    // Extract metadata
    if (planData.metadata) {
      result.cityName = planData.metadata.cityName;
      result.createdAtTimestamp = planData.metadata.createdAt;
      result.actionName = planData.metadata.actionName ?? undefined;
    }

    // Extract introduction content
    if (planData.content?.introduction) {
      result.cityDescription = planData.content.introduction.city_description;
      result.actionDescription =
        planData.content.introduction.action_description;
      result.nationalStrategyExplanation =
        planData.content.introduction.national_strategy_explanation;
    }

    // Extract structured data
    if (planData.content) {
      result.subactions = planData.content.subactions;
      result.institutions = planData.content.institutions;
      result.milestones = planData.content.milestones;
      result.timeline = planData.content.timeline;
      result.costBudget = planData.content.costBudget;
      result.merIndicators = planData.content.merIndicators;
      result.mitigations = planData.content.mitigations;
      result.adaptations = planData.content.adaptations;
      result.sdgs = planData.content.sdgs;
    }

    return result;
  }

  /**
   * Transform database record back to legacy planData format for API compatibility
   */
  private static transformToLegacyFormat(
    actionPlan: ActionPlan,
  ): LegacyActionPlanData {
    return {
      metadata: {
        cityName: actionPlan.cityName,
        createdAt: actionPlan.createdAtTimestamp,
        locode: actionPlan.cityLocode,
        actionId: actionPlan.actionId,
        actionName: actionPlan.actionName,
        language: actionPlan.language,
      },
      content: {
        introduction: {
          city_description: actionPlan.cityDescription,
          action_description: actionPlan.actionDescription,
          national_strategy_explanation: actionPlan.nationalStrategyExplanation,
        },
        subactions: actionPlan.subactions,
        institutions: actionPlan.institutions,
        milestones: actionPlan.milestones,
        timeline: actionPlan.timeline,
        costBudget: actionPlan.costBudget,
        merIndicators: actionPlan.merIndicators,
        mitigations: actionPlan.mitigations,
        adaptations: actionPlan.adaptations,
        sdgs: actionPlan.sdgs,
      },
    };
  }

  /**
   * Create a new action plan
   */
  public static async createActionPlan(
    input: CreateActionPlanInput,
  ): Promise<ActionPlan> {
    try {
      const actionPlan = await db.models.ActionPlan.create({
        id: uuidv4(),
        actionId: input.actionId,
        highImpactActionRankedId: input.highImpactActionRankedId,
        cityLocode: input.cityLocode,
        cityId: input.cityId,
        inventoryId: input.inventoryId,
        actionName: input.actionName,
        language: input.language,
        cityName: input.cityName,
        createdAtTimestamp: input.createdAtTimestamp,
        cityDescription: input.cityDescription,
        actionDescription: input.actionDescription,
        nationalStrategyExplanation: input.nationalStrategyExplanation,
        subactions: input.subactions,
        institutions: input.institutions,
        milestones: input.milestones,
        timeline: input.timeline,
        costBudget: input.costBudget,
        merIndicators: input.merIndicators,
        mitigations: input.mitigations,
        adaptations: input.adaptations,
        sdgs: input.sdgs,
        createdBy: input.createdBy,
      });

      await syncHIAPActionPlan(actionPlan);

      return actionPlan;
    } catch (error: unknown) {
      logger.error({ err: error }, "Failed to create action plan");
      throw createHttpError.InternalServerError("Failed to create action plan");
    }
  }

  /**
   * Get action plan by ID
   */
  public static async getActionPlanById(
    id: string,
  ): Promise<ActionPlan | null> {
    try {
      const actionPlan = await db.models.ActionPlan.findByPk(id, {
        include: [
          {
            model: db.models.HighImpactActionRanked,
            as: "highImpactActionRanked",
          },
        ],
      });

      return actionPlan;
    } catch (error: unknown) {
      logger.error({ err: error }, "Failed to get action plan by ID");
      throw createHttpError.InternalServerError(
        "Failed to retrieve action plan",
      );
    }
  }

  /**
   * Get action plans by city ID
   */
  public static async getActionPlansByCityId(
    cityId: string,
    language: string,
    actionId: string,
  ): Promise<ActionPlan[]> {
    try {
      const city = await db.models.City.findByPk(cityId);
      if (!city?.locode) {
        logger.warn({ cityId }, "City not found or has no locode");
        return [];
      }

      const actionPlans = await db.models.ActionPlan.findAll({
        where: {
          language,
          actionId,
          cityLocode: city.locode, // Direct filter by city locode
          cityId,
        },
        include: [
          {
            model: db.models.HighImpactActionRanked,
            as: "highImpactActionRanked",
            include: [
              {
                model: db.models.HighImpactActionRanking,
                as: "highImpactActionRanking",
                include: [
                  {
                    model: db.models.Inventory,
                    as: "inventory",
                  },
                ],
              },
            ],
          },
        ],
        order: [["created", "DESC"]],
      });
      return actionPlans;
    } catch (error: unknown) {
      logger.error({ err: error }, "Failed to get action plans by city ID");
      throw createHttpError.InternalServerError(
        "Failed to retrieve action plans",
      );
    }
  }

  /**
   * Update an action plan
   */
  public static async updateActionPlan(
    input: UpdateActionPlanInput,
  ): Promise<ActionPlan | null> {
    try {
      await this.getValidatedActionPlanForMutation(input.id, input.cityId);

      const [updatedRowsCount] = await db.models.ActionPlan.update(
        {
          actionName: input.actionName,
          language: input.language,
          cityName: input.cityName,
          createdAtTimestamp: input.createdAtTimestamp,
          cityDescription: input.cityDescription,
          actionDescription: input.actionDescription,
          nationalStrategyExplanation: input.nationalStrategyExplanation,
          subactions: input.subactions,
          institutions: input.institutions,
          milestones: input.milestones,
          timeline: input.timeline,
          costBudget: input.costBudget,
          merIndicators: input.merIndicators,
          mitigations: input.mitigations,
          adaptations: input.adaptations,
          sdgs: input.sdgs,
          lastUpdated: new Date(),
        },
        {
          where: { id: input.id },
          returning: true,
        },
      );

      if (updatedRowsCount === 0) {
        return null;
      }

      const actionPlan = await this.getActionPlanById(input.id);
      if (actionPlan) await syncHIAPActionPlan(actionPlan);
      return actionPlan;
    } catch (error: unknown) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }

      logger.error({ err: error }, "Failed to update action plan");
      throw createHttpError.InternalServerError("Failed to update action plan");
    }
  }

  /**
   * Delete an action plan
   */
  public static async deleteActionPlan(
    id: string,
    cityId: string,
  ): Promise<boolean> {
    try {
      await this.getValidatedActionPlanForMutation(id, cityId);
      await withdrawHIAPActionPlanCatalog(id);
      const deletedRowsCount = await db.models.ActionPlan.destroy({
        where: { id },
      });

      return deletedRowsCount > 0;
    } catch (error: unknown) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }

      logger.error({ err: error }, "Failed to delete action plan");
      throw createHttpError.InternalServerError("Failed to delete action plan");
    }
  }

  /**
   * Legacy method for backwards compatibility - transforms planData to new format
   */
  public static async upsertActionPlan(
    input: UpsertActionPlanInput,
  ): Promise<{ actionPlan: ActionPlan; created: boolean }> {
    try {
      // make sure no zero-length strings are written to UUID fields in the database
      if (input.highImpactActionRankedId?.length === 0) {
        input.highImpactActionRankedId = undefined;
      }

      // Ranked plans must resolve against HighImpactActionRanked. Unranked plans
      // (no ranked-row FK) skip this check so inventoryId alone does not fail save.
      if (input.highImpactActionRankedId) {
        await this.validateHIAPActionPlanContext(input);
      }

      // Transform legacy planData to new structure
      const transformedData = this.transformPlanData(input.planData);

      // Check if action plan already exists
      const existingPlans = await this.getActionPlansByCityId(
        input.cityId,
        input.language,
        input.actionId,
      );

      const existingPlan = existingPlans.find(
        (plan) =>
          plan.actionId === input.actionId && plan.language === input.language,
      );

      if (existingPlan) {
        // Update existing plan
        const updatedPlan = await this.updateActionPlan({
          id: existingPlan.id,
          cityId: input.cityId,
          actionName: input.actionName,
          language: input.language,
          ...transformedData,
        });

        return { actionPlan: updatedPlan!, created: false };
      } else {
        // Create new plan
        const newPlan = await this.createActionPlan({
          actionId: input.actionId,
          highImpactActionRankedId: input.highImpactActionRankedId,
          cityLocode: input.cityLocode,
          cityId: input.cityId,
          inventoryId: input.inventoryId,
          actionName: input.actionName,
          language: input.language,
          createdBy: input.createdBy,
          ...transformedData,
        });

        return { actionPlan: newPlan, created: true };
      }
    } catch (error: unknown) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }

      logger.error({ err: error }, "Failed to upsert action plan");
      throw createHttpError.InternalServerError("Failed to upsert action plan");
    }
  }

  /**
   * Get action plan by key (for backwards compatibility)
   */
  public static async getActionPlanByKey(
    actionId: string,
    language: string,
    cityId: string,
  ): Promise<{ planData: LegacyActionPlanData } | null> {
    try {
      const actionPlans = await this.getActionPlansByCityId(
        cityId,
        language,
        actionId,
      );

      const actionPlan = actionPlans[0];
      if (!actionPlan) {
        return null;
      }

      // Transform back to legacy format
      const planData = this.transformToLegacyFormat(actionPlan);
      return { planData };
    } catch (error: unknown) {
      logger.error({ err: error }, "Failed to get action plan by key");
      throw createHttpError.InternalServerError(
        "Failed to retrieve action plan",
      );
    }
  }

  /**
   * - Returns existing plan if it exists in the requested language
   * - Translates from another language if available
   * - Returns empty array if no plan exists in any language
   */
  public static async fetchOrTranslateActionPlan(
    cityId: string,
    language: string,
    actionId: string,
  ): Promise<ActionPlan[]> {
    try {
      // First, try to get plans in the requested language
      let actionPlans = await this.getActionPlansByCityId(
        cityId,
        language,
        actionId,
      );

      // If no plans found in requested language, try to find plans in other languages and translate them
      if (!actionPlans || actionPlans.length === 0) {
        // Get the city's locode first
        const city = await db.models.City.findByPk(cityId);
        if (!city?.locode) {
          logger.warn(
            { cityId },
            "City not found or has no locode for translation",
          );
          return [];
        }

        // Get plans in any language for this action and city
        const basePlans = await db.models.ActionPlan.findAll({
          where: {
            actionId,
            cityId,
          },
          include: [
            {
              model: db.models.HighImpactActionRanked,
              as: "highImpactActionRanked",
              include: [
                {
                  model: db.models.HighImpactActionRanking,
                  as: "highImpactActionRanking",
                  include: [
                    {
                      model: db.models.Inventory,
                      as: "inventory",
                    },
                  ],
                },
              ],
            },
          ],
          order: [["created", "DESC"]],
        });

        const sourcePlan = basePlans && basePlans[0];
        if (sourcePlan && sourcePlan.language !== language) {
          try {
            // Get the plan data in legacy format for translation
            const keyResult = await this.getActionPlanByKey(
              sourcePlan.actionId,
              sourcePlan.language,
              cityId,
            );
            if (keyResult) {
              // Translate the plan
              const translated = await hiapApiWrapper.translateActionPlan(
                keyResult.planData,
                sourcePlan.language,
                language,
              );

              // Transform the translated plan data to extract the translated action name
              const transformedData = this.transformPlanData(translated);

              // Save the translated plan
              await this.upsertActionPlan({
                actionId: sourcePlan.actionId,
                highImpactActionRankedId:
                  sourcePlan.highImpactActionRankedId || undefined,
                cityId: cityId,
                cityLocode: sourcePlan.cityLocode,
                inventoryId: sourcePlan.inventoryId || undefined,
                actionName: transformedData.actionName || sourcePlan.actionName,
                language,
                planData: translated,
              });

              // Get the newly created/updated plan
              actionPlans = await this.getActionPlansByCityId(
                cityId,
                language,
                actionId,
              );
            }
          } catch (translationError) {
            logger.error(
              { err: translationError, actionId, language },
              "Failed to translate action plan, returning empty result",
            );
            // Return empty array if translation fails
            actionPlans = [];
          }
        }
      }

      return actionPlans;
    } catch (error: unknown) {
      logger.error(
        { err: error, cityId, language, actionId },
        "Failed to get action plans",
      );
      throw createHttpError.InternalServerError(
        "Failed to retrieve action plans",
      );
    }
  }
}
