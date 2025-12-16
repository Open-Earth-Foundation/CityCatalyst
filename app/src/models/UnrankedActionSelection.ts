import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface UnrankedActionSelectionAttributes {
  id: string;
  inventoryId: string;
  actionId: string;
  actionType: string;
  lang: string;
  isSelected: boolean;
  created?: Date;
  lastUpdated?: Date;
}

export type UnrankedActionSelectionPk = "id";
export type UnrankedActionSelectionId = UnrankedActionSelection[UnrankedActionSelectionPk];
export type UnrankedActionSelectionCreationAttributes = Optional<UnrankedActionSelectionAttributes, "id">;

export class UnrankedActionSelection
  extends Model<
    UnrankedActionSelectionAttributes,
    UnrankedActionSelectionCreationAttributes
  >
  implements UnrankedActionSelectionAttributes
{
  declare id: string;
  declare inventoryId: string;
  declare actionId: string;
  declare actionType: string;
  declare lang: string;
  declare isSelected: boolean;
  declare created?: Date;
  declare lastUpdated?: Date;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof UnrankedActionSelection {
    return UnrankedActionSelection.init(
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
        },
        actionId: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "action_id",
        },
        actionType: {
          type: DataTypes.ENUM("mitigation", "adaptation"),
          allowNull: false,
          field: "action_type",
        },
        lang: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        isSelected: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          field: "is_selected",
        },
      },
      {
        sequelize,
        tableName: "UnrankedActionSelection",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "UnrankedActionSelection_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "UnrankedActionSelection_unique",
            unique: true,
            fields: [{ name: "inventory_id" }, { name: "action_id" }, { name: "lang" }],
          },
        ],
      },
    );
  }
}