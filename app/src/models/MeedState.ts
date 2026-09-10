import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Inventory, InventoryId } from "./Inventory";

export interface MeedStateAttributes {
  id: string;
  inventoryId?: string;

  exclusions: string[];
  sectors: string[];
  strategicPriorities: string[];
  timeline: string[];

  impactWeight?: number;
  alignmentWeight?: number;
  feasibilityWeight?: number;

  excludedSectors: string[];
  excludedCoBenefits: string[];
  excludeText: string;

  created?: Date;
  lastUpdated?: Date;
}

export type MeedStatePk = "id";
export type MeedStateId = MeedState[MeedStatePk];
export type MeedStateOptionalAttributes =
  | "exclusions"
  | "sectors"
  | "strategicPriorities"
  | "timeline"
  | "impactWeight"
  | "alignmentWeight"
  | "feasibilityWeight"
  | "excludedSectors"
  | "excludedCoBenefits"
  | "excludeText"
  | "created"
  | "lastUpdated";
export type MeedStateCreationAttributes = Optional<
  MeedStateAttributes,
  MeedStateOptionalAttributes
>;

export class MeedState
  extends Model<MeedStateAttributes, MeedStateCreationAttributes>
  implements MeedStateAttributes
{
  declare id: string;
  declare inventoryId?: string;

  declare exclusions: string[];
  declare sectors: string[];
  declare strategicPriorities: string[];
  declare timeline: string[];

  declare impactWeight?: number;
  declare alignmentWeight?: number;
  declare feasibilityWeight?: number;

  declare excludedSectors: string[];
  declare excludedCoBenefits: string[];
  declare excludeText: string;

  declare created?: Date;
  declare lastUpdated?: Date;

  // MeedState belongsTo Inventory via inventoryId
  declare inventory: Inventory;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;
  declare createInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof MeedState {
    return MeedState.init(
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

        exclusions: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false },
        sectors: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false },
        strategicPriorities: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: false,
          field: "strategic_priorities",
        },
        timeline: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false },
        impactWeight: {
          type: DataTypes.FLOAT,
          allowNull: true,
          field: "impact_weight",
        },
        alignmentWeight: {
          type: DataTypes.FLOAT,
          allowNull: true,
          field: "alignment_weight",
        },
        feasibilityWeight: {
          type: DataTypes.FLOAT,
          allowNull: true,
          field: "feasibility_weight",
        },

        excludedSectors: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: false,
        },
        excludedCoBenefits: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: false,
        },
        excludeText: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "exclude_text",
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
        tableName: "MeedState",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "MeedState_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "MeedState_unique",
            unique: true,
            fields: [{ name: "inventory_id" }],
          },
        ],
      },
    );
  }
}
