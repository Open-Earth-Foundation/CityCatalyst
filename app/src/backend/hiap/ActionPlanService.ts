import createHttpError from "http-errors";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/models";
import { ActionPlan } from "@/models/ActionPlan";
import { logger } from "@/services/logger";
import { translateActionPlan } from "./HiapApiService";
// Interfaces updated to work with new table structure

export interface CreateActionPlanInput {
  actionId: string;
  highImpactActionRankedId?: string;
  cityLocode: string;
  actionName: string;
  language: string;

  // Plan metadata
  cityName?: string;
  createdAtTimestamp?: string;

  // Plan content from introduction
  cityDescription?: string;
  actionDescription?: string;
  nationalStrategyExplanation?: string;

  // Structured plan data
  subactions?: any;
  institutions?: any;
  milestones?: any;
  timeline?: any;
  costBudget?: any;
  merIndicators?: any;
  mitigations?: any;
  adaptations?: any;
  sdgs?: any;

  // Tracking
  createdBy?: string;
}

export interface UpdateActionPlanInput {
  id: string;
  actionName?: string;
  language?: string;

  // Plan metadata
  cityName?: string;
  createdAtTimestamp?: string;

  // Plan content
  cityDescription?: string;
  actionDescription?: string;
  nationalStrategyExplanation?: string;

  // Structured plan data
  subactions?: any;
  institutions?: any;
  milestones?: any;
  timeline?: any;
  costBudget?: any;
  merIndicators?: any;
  mitigations?: any;
  adaptations?: any;
  sdgs?: any;
}

export interface UpsertActionPlanInput {
  actionId: string;
  highImpactActionRankedId?: string;
  cityId: string;
  cityLocode: string;
  actionName: string;
  language: string;
  planData: any; // Legacy HIAP API format - will be transformed
  createdBy?: string;
}

export default class ActionPlanService {
  /**
   * Transform legacy planData format to new column structure
   */
  private static transformPlanData(
    planData: any,
  ): Partial<CreateActionPlanInput> {
    const result: Partial<CreateActionPlanInput> = {};

    // Extract metadata
    if (planData.metadata) {
      result.cityName = planData.metadata.cityName;
      result.createdAtTimestamp = planData.metadata.createdAt;
      result.actionName = planData.metadata.actionName;
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
  private static transformToLegacyFormat(actionPlan: ActionPlan): any {
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

      return actionPlan;
    } catch (error: any) {
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
    } catch (error: any) {
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
      const actionPlans = await db.models.ActionPlan.findAll({
        where: {
          language,
          actionId,
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
                    where: { cityId: cityId },
                  },
                ],
              },
            ],
          },
        ],
        order: [["created", "DESC"]],
      });
      return actionPlans;
    } catch (error: any) {
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

      return await this.getActionPlanById(input.id);
    } catch (error: any) {
      logger.error({ err: error }, "Failed to update action plan");
      throw createHttpError.InternalServerError("Failed to update action plan");
    }
  }

  /**
   * Delete an action plan
   */
  public static async deleteActionPlan(id: string): Promise<boolean> {
    try {
      const deletedRowsCount = await db.models.ActionPlan.destroy({
        where: { id },
      });

      return deletedRowsCount > 0;
    } catch (error: any) {
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
          actionName: input.actionName,
          language: input.language,
          createdBy: input.createdBy,
          ...transformedData,
        });

        return { actionPlan: newPlan, created: true };
      }
    } catch (error: any) {
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
  ): Promise<{ planData: any } | null> {
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
    } catch (error: any) {
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
        // Get plans in any language for this action
        const basePlans = await db.models.ActionPlan.findAll({
          where: {
            actionId,
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
                      where: { cityId: cityId },
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
              const translated = await translateActionPlan(
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
    } catch (error: any) {
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
