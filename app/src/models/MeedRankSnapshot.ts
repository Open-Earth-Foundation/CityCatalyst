import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Inventory, InventoryId } from "./Inventory";

export interface MeedRankSnapshotAttributes {
  id: string;
  inventoryId?: string;
  request?: object;
  response?: object;
  created?: Date;
  lastUpdated?: Date;
}

export type MeedRankSnapshotPk = "id";
export type MeedRankSnapshotId = MeedRankSnapshot[MeedRankSnapshotPk];
export type MeedRankSnapshotOptionalAttributes =
  "request" | "response" | "created" | "lastUpdated";
export type MeedRankSnapshotCreationAttributes = Optional<
  MeedRankSnapshotAttributes,
  MeedRankSnapshotOptionalAttributes
>;

export class MeedRankSnapshot
  extends Model<MeedRankSnapshotAttributes, MeedRankSnapshotCreationAttributes>
  implements MeedRankSnapshotAttributes
{
  declare id: string;
  declare inventoryId?: string;
  declare request?: object;
  declare response?: object;
  declare created?: Date;
  declare lastUpdated?: Date;

  // MeedRankSnapshot belongsTo Inventory via inventoryId
  declare inventory: Inventory;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;
  declare createInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof MeedRankSnapshot {
    return MeedRankSnapshot.init(
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
        request: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        response: {
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
        tableName: "MeedRankSnapshot",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "MeedRankSnapshot_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
}
