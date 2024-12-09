import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { City, CityId } from "./City";
import type { InventoryValue, InventoryValueId } from "./InventoryValue";
import type { Version, VersionId } from "./Version";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

export interface InventoryAttributes {
  inventoryId: string;
  inventoryName?: string;
  year?: number;
  totalEmissions?: number;
  cityId?: string;
  totalCountryEmissions?: number;
  isPublic?: boolean;
  publishedAt?: Date | null;
  inventoryType?: InventoryTypeEnum;
  globalWarmingPotentialType?: GlobalWarmingPotentialTypeEnum;
  lastUpdated?: Date | null;
}

export type InventoryPk = "inventoryId";
export type InventoryId = Inventory[InventoryPk];
export type InventoryOptionalAttributes =
  | "inventoryName"
  | "year"
  | "totalEmissions"
  | "cityId"
  | "totalCountryEmissions"
  | "isPublic"
  | "publishedAt"
  | "inventoryType"
  | "globalWarmingPotentialType"
  | "lastUpdated";

export type InventoryCreationAttributes = Optional<
  InventoryAttributes,
  InventoryOptionalAttributes
>;

export class Inventory
  extends Model<InventoryAttributes, InventoryCreationAttributes>
  implements InventoryAttributes
{
  inventoryId!: string;
  inventoryName?: string;
  year?: number;
  totalEmissions?: number;
  cityId?: string;
  totalCountryEmissions?: number;
  isPublic?: boolean;
  publishedAt?: Date | null;
  lastUpdated?: Date | null;
  inventoryType?: InventoryTypeEnum;
  globalWarmingPotentialType?: GlobalWarmingPotentialTypeEnum;
  // Inventory belongsTo City via cityId
  city!: City;
  getCity!: Sequelize.BelongsToGetAssociationMixin<City>;
  setCity!: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  createCity!: Sequelize.BelongsToCreateAssociationMixin<City>;
  // Inventory hasMany InventoryValue via inventoryId
  inventoryValues!: InventoryValue[];
  getInventoryValues!: Sequelize.HasManyGetAssociationsMixin<InventoryValue>;
  setInventoryValues!: Sequelize.HasManySetAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  addInventoryValue!: Sequelize.HasManyAddAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  addInventoryValues!: Sequelize.HasManyAddAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  createInventoryValue!: Sequelize.HasManyCreateAssociationMixin<InventoryValue>;
  removeInventoryValue!: Sequelize.HasManyRemoveAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  removeInventoryValues!: Sequelize.HasManyRemoveAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  hasInventoryValue!: Sequelize.HasManyHasAssociationMixin<
    InventoryValue,
    InventoryValueId
  >;
  hasInventoryValues!: Sequelize.HasManyHasAssociationsMixin<
    InventoryValue,
    InventoryValueId
  >;
  countInventoryValues!: Sequelize.HasManyCountAssociationsMixin;
  // Inventory hasMany Version via inventoryId
  versions!: Version[];
  getVersions!: Sequelize.HasManyGetAssociationsMixin<Version>;
  setVersions!: Sequelize.HasManySetAssociationsMixin<Version, VersionId>;
  addVersion!: Sequelize.HasManyAddAssociationMixin<Version, VersionId>;
  addVersions!: Sequelize.HasManyAddAssociationsMixin<Version, VersionId>;
  createVersion!: Sequelize.HasManyCreateAssociationMixin<Version>;
  removeVersion!: Sequelize.HasManyRemoveAssociationMixin<Version, VersionId>;
  removeVersions!: Sequelize.HasManyRemoveAssociationsMixin<Version, VersionId>;
  hasVersion!: Sequelize.HasManyHasAssociationMixin<Version, VersionId>;
  hasVersions!: Sequelize.HasManyHasAssociationsMixin<Version, VersionId>;
  countVersions!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof Inventory {
    return Inventory.init(
      {
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "inventory_id",
        },
        inventoryName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "inventory_name",
        },
        year: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        totalEmissions: {
          type: DataTypes.BIGINT,
          allowNull: true,
          field: "total_emissions",
        },
        cityId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "City",
            key: "city_id",
          },
          field: "city_id",
        },
        totalCountryEmissions: {
          type: DataTypes.BIGINT,
          allowNull: true,
          field: "total_country_emissions",
        },
        isPublic: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          field: "is_public",
        },
        publishedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "published_at",
        },
        inventoryType: {
          type: DataTypes.ENUM(...Object.values(InventoryTypeEnum)),
          allowNull: true,
          field: "inventory_type",
        },
        globalWarmingPotentialType: {
          type: DataTypes.ENUM(
            ...Object.values(GlobalWarmingPotentialTypeEnum),
          ),
          allowNull: true,
          field: "global_warming_potential_type",
        },
        lastUpdated: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "last_updated",
        },
      },
      {
        sequelize,
        tableName: "Inventory",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "Inventory_pkey",
            unique: true,
            fields: [{ name: "inventory_id" }],
          },
        ],
        hooks: {
          beforeCreate: (inventory) => {
            inventory.lastUpdated = new Date();
          },
        },
      },
    );
  }
}
