import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Inventory, InventoryId } from "./Inventory";
import type { MeedActionRanked } from "./MeedActionRanked";
import type { MeedActionRemoved } from "./MeedActionRemoved";

export type MeedRankingStatus = "running" | "completed" | "failed";

export interface MeedRankingAttributes {
  id: string;
  inventoryId: string;
  userId?: string | null;
  inputDigest: string;
  contentDigest: string;
  status: MeedRankingStatus;
  actionCount: number;
  requestedLanguages: string[];
  topN?: number | null;
  created?: Date;
  lastUpdated?: Date;
}

export type MeedRankingCreationAttributes = Optional<
  MeedRankingAttributes,
  | "id"
  | "userId"
  | "status"
  | "actionCount"
  | "requestedLanguages"
  | "topN"
  | "created"
  | "lastUpdated"
>;

export class MeedRanking
  extends Model<MeedRankingAttributes, MeedRankingCreationAttributes>
  implements MeedRankingAttributes
{
  declare id: string;
  declare inventoryId: string;
  declare userId?: string | null;
  declare inputDigest: string;
  declare contentDigest: string;
  declare status: MeedRankingStatus;
  declare actionCount: number;
  declare requestedLanguages: string[];
  declare topN?: number | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  declare inventory: Inventory;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;
  declare createInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  declare meedActionRanked: MeedActionRanked[];
  declare meedActionRemoved: MeedActionRemoved[];

  static initModel(sequelize: Sequelize.Sequelize): typeof MeedRanking {
    return MeedRanking.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "inventory_id",
          references: { model: "Inventory", key: "inventory_id" },
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "user_id",
          references: { model: "User", key: "user_id" },
        },
        inputDigest: {
          type: DataTypes.STRING(128),
          allowNull: false,
          field: "input_digest",
        },
        contentDigest: {
          type: DataTypes.STRING(128),
          allowNull: false,
          field: "content_digest",
        },
        status: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: "running",
        },
        actionCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          field: "action_count",
        },
        requestedLanguages: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: false,
          defaultValue: [],
          field: "requested_languages",
        },
        topN: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "top_n",
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
        tableName: "MeedRanking",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "MeedRanking_inventory_user_input_content_unique",
            unique: true,
            fields: [
              { name: "inventory_id" },
              { name: "user_id" },
              { name: "input_digest" },
              { name: "content_digest" },
            ],
          },
        ],
      },
    );
  }
}
