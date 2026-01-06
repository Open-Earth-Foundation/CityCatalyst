import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Inventory, InventoryId } from "./Inventory";
import { User, UserId } from "./User";

export interface VersionAttributes {
  versionId: string;
  inventoryId?: string;
  authorId?: string;
  entryId?: string;
  previousVersionId?: string;
  table?: string;
  data?: Record<string, any>;
  created?: Date;
  lastUpdated?: Date;
}

export type VersionPk = "versionId";
export type VersionId = Version[VersionPk];
export type VersionOptionalAttributes =
  | "inventoryId"
  | "authorId"
  | "entryId"
  | "previousVersionId"
  | "table"
  | "data"
  | "created"
  | "lastUpdated";
export type VersionCreationAttributes = Optional<
  VersionAttributes,
  VersionOptionalAttributes
>;

export class Version
  extends Model<VersionAttributes, VersionCreationAttributes>
  implements Partial<VersionAttributes>
{
  declare versionId: string;
  declare inventoryId?: string;
  declare authorId?: string;
  declare entryId?: string;
  declare previousVersionId?: string;
  declare table?: string;
  declare data?: Record<string, any>;
  declare created?: Date;
  declare lastUpdated?: Date;

  // Version belongsTo Inventory via inventoryId
  declare inventory: Inventory;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;
  declare createInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  // Version belongsTo User via authorId
  declare author: User;
  declare getAuthor: Sequelize.BelongsToGetAssociationMixin<User>;
  declare setAuthor: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

  // Version hasOne Version via previousVersionId
  declare previousVersion: Version;
  declare getPreviousVersion: Sequelize.BelongsToGetAssociationMixin<Version>;
  declare setPreviousVersion: Sequelize.BelongsToSetAssociationMixin<
    Version,
    VersionId
  >;

  static initModel(sequelize: Sequelize.Sequelize): typeof Version {
    return Version.init(
      {
        versionId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "version_id",
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
        authorId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "User",
            key: "user_id",
          },
          field: "author_id",
        },
        entryId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "entry_id",
        },
        previousVersionId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Version",
            key: "version_id",
          },
          field: "previous_version_id",
        },
        table: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        data: {
          type: DataTypes.JSONB,
          allowNull: false,
        },
      },
      {
        sequelize,
        tableName: "Version",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "Version_pkey",
            unique: true,
            fields: [{ name: "version_id" }],
          },
        ],
      },
    );
  }
}
