import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Inventory, InventoryId } from "./Inventory";

export interface MeedActionRankedAttributes {
  id: string;
  inventoryId?: string;
  actionId?: string;
  rank?: number;
  finalScore?: number;
  impactScore?: number;
  alignmentScore?: number;
  feasibilityScore?: number;
  explanations?: Record<string, string>;
  weights?: Record<string, number>;
  created?: Date;
  lastUpdated?: Date;
}

export type MeedActionRankedPk = "id";
export type MeedActionRankedId = MeedActionRanked[MeedActionRankedPk];
export type MeedActionRankedOptionalAttributes =
  "explanations" | "created" | "lastUpdated";
export type MeedActionRankedCreationAttributes = Optional<
  MeedActionRankedAttributes,
  MeedActionRankedOptionalAttributes
>;

export class MeedActionRanked
  extends Model<MeedActionRankedAttributes, MeedActionRankedCreationAttributes>
  implements MeedActionRankedAttributes
{
  declare id: string;
  declare inventoryId?: string;
  declare actionId?: string;
  declare rank?: number;
  declare finalScore?: number;
  declare impactScore?: number;
  declare alignmentScore?: number;
  declare feasibilityScore?: number;
  declare explanations?: Record<string, string>;
  declare weights?: Record<string, number>;
  declare created?: Date;
  declare lastUpdated?: Date;

  // MeedActionRanked belongsTo Inventory via inventoryId
  declare inventory: Inventory;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;
  declare createInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof MeedActionRanked {
    return MeedActionRanked.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "Inventory",
            key: "inventory_id",
          },
          field: "inventory_id",
        },
        actionId: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "action_id",
        },
        rank: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        finalScore: {
          type: DataTypes.DOUBLE,
          allowNull: false,
          field: "final_score",
        },
        impactScore: {
          type: DataTypes.DOUBLE,
          allowNull: false,
          field: "impact_score",
        },
        alignmentScore: {
          type: DataTypes.DOUBLE,
          allowNull: false,
          field: "alignment_score",
        },
        feasibilityScore: {
          type: DataTypes.DOUBLE,
          allowNull: false,
        },
        explanations: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        weights: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        lastUpdated: {
          field: "last_updated",
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        tableName: "MeedActionRanked",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "MeedActionRanked_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
}
