import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Inventory, InventoryId } from "./Inventory";

export interface MeedActionReportAttributes {
  id: string;
  inventoryId?: string;
  actionId?: string;
  languages?: string[];
  chapters?: object;
  created?: Date;
  lastUpdated?: Date;
}

export type MeedActionReportPk = "id";
export type MeedActionReportId = MeedActionReport[MeedActionReportPk];
export type MeedActionReportOptionalAttributes =
  "actionId" | "languages" | "chapters" | "created" | "lastUpdated";
export type MeedActionReportCreationAttributes = Optional<
  MeedActionReportAttributes,
  MeedActionReportOptionalAttributes
>;

export class MeedActionReport
  extends Model<MeedActionReportAttributes, MeedActionReportCreationAttributes>
  implements MeedActionReportAttributes
{
  declare id: string;
  declare inventoryId?: string;
  declare actionId?: string;
  declare languages?: string[];
  declare chapters?: object;
  declare created?: Date;
  declare lastUpdated?: Date;

  // MeedActionReport belongsTo Inventory via inventoryId
  declare inventory: Inventory;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;
  declare createInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof MeedActionReport {
    return MeedActionReport.init(
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
          field: "action_id",
          allowNull: false,
        },
        languages: {
          type: DataTypes.ARRAY(DataTypes.TEXT),
          allowNull: false,
          defaultValue: [],
        },
        chapters: {
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
        tableName: "MeedActionReport",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "MeedActionReport_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
}
