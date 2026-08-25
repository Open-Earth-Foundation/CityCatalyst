import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Inventory, InventoryId } from "./Inventory";

export interface MeedActionRemovedAttributes {
  id: string;
  inventoryId?: string;
  actionId?: string;
  actionName?: string;
  removalReason?: string;
  removalSource?: string;
  verdictCategory?: string;
  ownershipCategory?: string;
  restrictionsCategory?: string;
  ownershipDescription?: object;
  restrictionsDescription?: object;
  legalJustification?: object;
  legalReferences?: string[];
  created?: Date;
  lastUpdated?: Date;
}

export type MeedActionRemovedPk = "id";
export type MeedActionRemovedId = MeedActionRemoved[MeedActionRemovedPk];
export type MeedActionRemovedOptionalAttributes =
  | "ownershipDescription"
  | "restrictionsDescription"
  | "legalJustification"
  | "legalReferences"
  | "created"
  | "lastUpdated";
export type MeedActionRemovedCreationAttributes = Optional<
  MeedActionRemovedAttributes,
  MeedActionRemovedOptionalAttributes
>;

export class MeedActionRemoved
  extends Model<
    MeedActionRemovedAttributes,
    MeedActionRemovedCreationAttributes
  >
  implements MeedActionRemovedAttributes
{
  declare id: string;
  declare inventoryId?: string;
  declare actionId?: string;
  declare actionName?: string;
  declare removalReason?: string;
  declare removalSource?: string;
  declare verdictCategory?: string;
  declare ownershipCategory?: string;
  declare restrictionsCategory?: string;
  declare ownershipDescription?: object;
  declare restrictionsDescription?: object;
  declare legalJustification?: object;
  declare legalReferences?: string[];
  declare created?: Date;
  declare lastUpdated?: Date;

  // MeedActionRemoved belongsTo Inventory via inventoryId
  declare inventory: Inventory;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;
  declare createInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof MeedActionRemoved {
    return MeedActionRemoved.init(
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
        actionName: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "action_name",
        },
        removalReason: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "removal_reason",
        },
        removalSource: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "removal_source",
        },
        verdictCategory: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "verdict_category",
        },
        ownershipCategory: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "ownership_category",
        },
        restrictionsCategory: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "restrictions_category",
        },
        ownershipDescription: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
          field: "ownership_description",
        },
        restrictionsDescription: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
          field: "restrictions_description",
        },
        legalJustification: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
          field: "legal_justification",
        },
        legalReferences: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: false,
          defaultValue: ["ARRAY[]"],
          field: "legal_references",
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
        tableName: "MeedActionRemoved",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "MeedActionRemoved_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
}
