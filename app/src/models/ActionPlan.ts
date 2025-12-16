import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface ActionPlanAttributes {
  id: string;
  actionId: string;
  highImpactActionRankedId?: string | null;
  cityLocode: string;
  cityId?: string | null;
  inventoryId?: string | null;
  actionName: string;
  language: string;

  // Plan metadata
  cityName?: string | null;
  createdAtTimestamp?: string | null;

  // Plan content - Introduction section
  cityDescription?: string | null;
  actionDescription?: string | null;
  nationalStrategyExplanation?: string | null;

  // Structured plan data (JSON arrays)
  subactions?: any | null;
  institutions?: any | null;
  milestones?: any | null;
  timeline?: any | null;
  costBudget?: any | null;
  merIndicators?: any | null;
  mitigations?: any | null;
  adaptations?: any | null;
  sdgs?: any | null;

  // Tracking fields
  createdBy?: string | null;
  created: Date;
  lastUpdated: Date;
}

export type ActionPlanPk = "id";
export type ActionPlanId = ActionPlan[ActionPlanPk];
export type ActionPlanOptionalAttributes =
  | "id"
  | "highImpactActionRankedId"
  | "cityId"
  | "inventoryId"
  | "cityName"
  | "createdAtTimestamp"
  | "cityDescription"
  | "actionDescription"
  | "nationalStrategyExplanation"
  | "subactions"
  | "institutions"
  | "milestones"
  | "timeline"
  | "costBudget"
  | "merIndicators"
  | "mitigations"
  | "adaptations"
  | "sdgs"
  | "createdBy"
  | "created"
  | "lastUpdated";
export type ActionPlanCreationAttributes = Optional<
  ActionPlanAttributes,
  ActionPlanOptionalAttributes
>;

export class ActionPlan
  extends Model<ActionPlanAttributes, ActionPlanCreationAttributes>
  implements ActionPlanAttributes
{
  declare id: string;
  declare actionId: string;
  declare highImpactActionRankedId?: string | null;
  declare cityLocode: string;
  declare cityId?: string | null;
  declare inventoryId?: string | null;
  declare actionName: string;
  declare language: string;

  // Plan metadata
  declare cityName?: string | null;
  declare createdAtTimestamp?: string | null;

  // Plan content - Introduction section
  declare cityDescription?: string | null;
  declare actionDescription?: string | null;
  declare nationalStrategyExplanation?: string | null;

  // Structured plan data (JSON arrays)
  declare subactions?: any | null;
  declare institutions?: any | null;
  declare milestones?: any | null;
  declare timeline?: any | null;
  declare costBudget?: any | null;
  declare merIndicators?: any | null;
  declare mitigations?: any | null;
  declare adaptations?: any | null;
  declare sdgs?: any | null;

  // Tracking fields
  declare createdBy?: string | null;
  declare created: Date;
  declare lastUpdated: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof ActionPlan {
    return ActionPlan.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        actionId: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "action_id",
        },
        highImpactActionRankedId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "high_impact_action_ranked_id",
        },
        cityLocode: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "city_locode",
        },
        cityId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "city_id",
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "inventory_id",
        },
        actionName: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "action_name",
        },
        language: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: "en",
        },

        // Plan metadata
        cityName: {
          type: DataTypes.STRING,
          allowNull: true,
          field: "city_name",
        },
        createdAtTimestamp: {
          type: DataTypes.STRING,
          allowNull: true,
          field: "created_at_timestamp",
        },

        // Plan content - Introduction section
        cityDescription: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "city_description",
        },
        actionDescription: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "action_description",
        },
        nationalStrategyExplanation: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "national_strategy_explanation",
        },

        // Structured plan data (JSON arrays)
        subactions: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        institutions: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        milestones: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        timeline: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        costBudget: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "cost_budget",
        },
        merIndicators: {
          type: DataTypes.JSONB,
          allowNull: true,
          field: "mer_indicators",
        },
        mitigations: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        adaptations: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        sdgs: {
          type: DataTypes.JSONB,
          allowNull: true,
        },

        // Tracking fields
        createdBy: {
          type: DataTypes.STRING,
          allowNull: true,
          field: "created_by",
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        lastUpdated: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: "last_updated",
        },
      },
      {
        sequelize,
        tableName: "ActionPlan",
        schema: "public",
        timestamps: false,
        indexes: [
          {
            name: "idx_action_plan_action_id",
            fields: [{ name: "action_id" }],
          },
          {
            name: "idx_action_plan_language",
            fields: [{ name: "language" }],
          },
        ],
      },
    );
  }
}
