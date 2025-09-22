import { DataTypes, Model, Sequelize, Optional } from "sequelize";
import { User } from "./User";
import { Inventory } from "./Inventory";
import { HighImpactActionRanking } from "./HighImpactActionRanking";

export interface ActionPlanMetadata {
  locode: string;
  cityName: string;
  actionId: string;
  actionName: string;
  language: string;
  createdAt: string;
}

export interface ActionPlanIntroduction {
  city_description?: string;
  action_description?: string;
  national_strategy_explanation?: string;
}

export interface ActionPlanSubaction {
  number: number;
  title: string;
  description: string;
}

export interface ActionPlanInstitution {
  name: string;
  description: string;
  url?: string;
}

export interface ActionPlanMilestone {
  number: number;
  title: string;
  description: string;
}

export interface ActionPlanIndicator {
  description: string;
}

export interface ActionPlanMitigation {
  title: string;
  description: string;
}

export interface ActionPlanAdaptation {
  title: string;
  description: string;
}

export interface ActionPlanSDG {
  title: string;
  description: string;
}

export interface ActionPlanContent {
  introduction?: ActionPlanIntroduction;
  subactions?: {
    items: ActionPlanSubaction[];
  };
  institutions?: {
    items: ActionPlanInstitution[];
  };
  milestones?: {
    items: ActionPlanMilestone[];
  };
  timeline?: Array<any>; // Can be empty array
  costBudget?: Array<any>; // Can be empty array
  merIndicators?: {
    items: ActionPlanIndicator[];
  };
  mitigations?: {
    items: ActionPlanMitigation[];
  };
  adaptations?: {
    items: ActionPlanAdaptation[];
  };
  sdgs?: {
    items: ActionPlanSDG[];
  };
}

export interface ActionPlanData {
  metadata: ActionPlanMetadata;
  content: ActionPlanContent;
}

export interface ActionPlanAttributes {
  id: string;
  actionId: string;
  inventoryId: string;
  hiActionRankingId?: string;
  cityLocode: string;
  actionName: string;
  language: string;
  planData: ActionPlanData;
  createdBy?: string;
  created: Date;
  lastUpdated: Date;
}

export type ActionPlanCreationAttributes = Optional<
  ActionPlanAttributes,
  "id" | "created" | "lastUpdated"
>;

export class ActionPlan
  extends Model<ActionPlanAttributes, ActionPlanCreationAttributes>
  implements ActionPlanAttributes
{
  public id!: string;
  public actionId!: string;
  public inventoryId!: string;
  public hiActionRankingId?: string;
  public cityLocode!: string;
  public actionName!: string;
  public language!: string;
  public planData!: ActionPlanData;
  public createdBy?: string;
  public created!: Date;
  public lastUpdated!: Date;

  // Associations
  public readonly createdByUser?: User;
  public readonly inventory?: Inventory;
  public readonly hiActionRanking?: HighImpactActionRanking;

  static initModel(sequelize: Sequelize): typeof ActionPlan {
    ActionPlan.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        actionId: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "action_id",
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "inventory_id",
          references: {
            model: "Inventory",
            key: "id",
          },
        },
        hiActionRankingId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "hi_action_ranking_id",
          references: {
            model: "HighImpactActionRanking",
            key: "id",
          },
        },
        cityLocode: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "city_locode",
        },
        actionName: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "action_name",
        },
        language: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        planData: {
          type: DataTypes.JSONB,
          allowNull: false,
          field: "plan_data",
        },
        createdBy: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "created_by",
          references: {
            model: "User",
            key: "id",
          },
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
        timestamps: true,
        createdAt: "created",
        updatedAt: "lastUpdated",
        indexes: [
          {
            fields: ["inventory_id"],
          },
          {
            fields: ["action_id"],
          },
          {
            fields: ["city_locode"],
          },
          {
            fields: ["language"],
          },
          {
            fields: ["created_by"],
          },
          {
            unique: true,
            fields: ["action_id", "inventory_id", "language"],
          },
        ],
      },
    );
    return ActionPlan;
  }

  static associate() {
    ActionPlan.belongsTo(User, {
      foreignKey: "createdBy",
      as: "createdByUser",
    });
    ActionPlan.belongsTo(Inventory, {
      foreignKey: "inventoryId",
      as: "inventory",
    });
    ActionPlan.belongsTo(HighImpactActionRanking, {
      foreignKey: "hiActionRankingId",
      as: "hiActionRanking",
    });
  }
}
