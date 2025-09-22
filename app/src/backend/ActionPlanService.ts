import { db } from "@/models";
import {
  ActionPlan,
  ActionPlanAttributes,
  ActionPlanCreationAttributes,
} from "@/models/ActionPlan";
import { HIAction } from "@/util/types";
import createHttpError from "http-errors";
import { logger } from "@/services/logger";

export interface CreateActionPlanInput {
  actionId: string;
  inventoryId: string;
  hiActionRankingId?: string;
  cityLocode: string;
  actionName: string;
  language: string;
  planData: any; // The full plan JSON from HIAP API
  createdBy?: string;
}

export interface UpdateActionPlanInput {
  id: string;
  planData?: any;
  actionName?: string;
}

export default class ActionPlanService {
  /**
   * Create a new action plan
   */
  public static async createActionPlan(
    input: CreateActionPlanInput,
  ): Promise<ActionPlan> {
    try {
      logger.info("Creating action plan", {
        actionId: input.actionId,
        inventoryId: input.inventoryId,
        language: input.language,
      });

      const actionPlan = await db.models.ActionPlan.create({
        actionId: input.actionId,
        inventoryId: input.inventoryId,
        hiActionRankingId: input.hiActionRankingId,
        cityLocode: input.cityLocode,
        actionName: input.actionName,
        language: input.language,
        planData: input.planData,
        createdBy: input.createdBy,
      } as ActionPlanCreationAttributes);

      logger.info("Action plan created successfully", { id: actionPlan.id });
      return actionPlan;
    } catch (error: any) {
      // Handle unique constraint violations
      if (error.name === "SequelizeUniqueConstraintError") {
        throw createHttpError.Conflict(
          `Action plan already exists for action ${input.actionId} in inventory ${input.inventoryId} for language ${input.language}`,
        );
      }

      logger.error({ err: error }, "Failed to create action plan");
      throw createHttpError.InternalServerError("Failed to create action plan");
    }
  }

  /**
   * Update an existing action plan
   */
  public static async updateActionPlan(
    input: UpdateActionPlanInput,
  ): Promise<ActionPlan> {
    try {
      logger.info("Updating action plan", { id: input.id });

      const actionPlan = await db.models.ActionPlan.findByPk(input.id);
      if (!actionPlan) {
        throw createHttpError.NotFound(
          `Action plan with id ${input.id} not found`,
        );
      }

      const updateData: Partial<ActionPlanAttributes> = {};
      if (input.planData !== undefined) {
        updateData.planData = input.planData;
      }
      if (input.actionName !== undefined) {
        updateData.actionName = input.actionName;
      }

      await actionPlan.update(updateData);

      logger.info("Action plan updated successfully", { id: input.id });
      return actionPlan;
    } catch (error: any) {
      if (error.statusCode) {
        throw error; // Re-throw HTTP errors
      }

      logger.error({ err: error }, "Failed to update action plan");
      throw createHttpError.InternalServerError("Failed to update action plan");
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
          { model: db.models.User, as: "createdByUser" },
          { model: db.models.Inventory, as: "inventory" },
          { model: db.models.HighImpactActionRanking, as: "hiActionRanking" },
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
   * Get action plans by inventory ID
   */
  public static async getActionPlansByInventoryId(
    inventoryId: string,
    language?: string,
  ): Promise<ActionPlan[]> {
    try {
      const whereClause: any = { inventoryId };
      if (language) {
        whereClause.language = language;
      }

      const actionPlans = await db.models.ActionPlan.findAll({
        where: whereClause,
        include: [
          { model: db.models.User, as: "createdByUser" },
          { model: db.models.HighImpactActionRanking, as: "hiActionRanking" },
        ],
        order: [["created", "DESC"]],
      });

      return actionPlans;
    } catch (error: any) {
      logger.error(
        { err: error },
        "Failed to get action plans by inventory ID",
      );
      throw createHttpError.InternalServerError(
        "Failed to retrieve action plans",
      );
    }
  }

  /**
   * Get action plan by action ID, inventory ID, and language
   */
  public static async getActionPlanByKey(
    actionId: string,
    inventoryId: string,
    language: string,
  ): Promise<ActionPlan | null> {
    try {
      const actionPlan = await db.models.ActionPlan.findOne({
        where: {
          actionId,
          inventoryId,
          language,
        },
        include: [
          { model: db.models.User, as: "createdByUser" },
          { model: db.models.Inventory, as: "inventory" },
          { model: db.models.HighImpactActionRanking, as: "hiActionRanking" },
        ],
      });

      return actionPlan;
    } catch (error: any) {
      logger.error({ err: error }, "Failed to get action plan by key");
      throw createHttpError.InternalServerError(
        "Failed to retrieve action plan",
      );
    }
  }

  /**
   * Delete action plan by ID
   */
  public static async deleteActionPlan(id: string): Promise<boolean> {
    try {
      logger.info("Deleting action plan", { id });

      const result = await db.models.ActionPlan.destroy({
        where: { id },
      });

      if (result === 0) {
        throw createHttpError.NotFound(`Action plan with id ${id} not found`);
      }

      logger.info("Action plan deleted successfully", { id });
      return true;
    } catch (error: any) {
      if (error.statusCode) {
        throw error; // Re-throw HTTP errors
      }

      logger.error({ err: error }, "Failed to delete action plan");
      throw createHttpError.InternalServerError("Failed to delete action plan");
    }
  }

  /**
   * Create or update action plan (upsert operation)
   */
  public static async upsertActionPlan(
    input: CreateActionPlanInput,
  ): Promise<{ actionPlan: ActionPlan; created: boolean }> {
    try {
      // Check if action plan already exists
      const existingPlan = await this.getActionPlanByKey(
        input.actionId,
        input.inventoryId,
        input.language,
      );

      if (existingPlan) {
        // Update existing plan
        const updatedPlan = await this.updateActionPlan({
          id: existingPlan.id,
          planData: input.planData,
          actionName: input.actionName,
        });

        return { actionPlan: updatedPlan, created: false };
      } else {
        // Create new plan
        const newPlan = await this.createActionPlan(input);
        return { actionPlan: newPlan, created: true };
      }
    } catch (error: any) {
      logger.error({ err: error }, "Failed to upsert action plan");
      throw error;
    }
  }
}
