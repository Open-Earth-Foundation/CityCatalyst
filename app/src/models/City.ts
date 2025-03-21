import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { User, UserId } from "./User";
import type { GDP, GDPId } from "./GDP";
import type { Inventory, InventoryId } from "./Inventory";
import type { Population, PopulationId } from "./Population";

export interface CityAttributes {
  cityId: string;
  locode?: string;
  name?: string;
  shape?: object;
  country?: string;
  region?: string;
  countryLocode?: string;
  regionLocode?: string;
  area?: number;
  created?: Date;
  lastUpdated?: Date;
  projectId?: string;
}

export type CityPk = "cityId";
export type CityId = City[CityPk];
export type CityOptionalAttributes =
  | "locode"
  | "name"
  | "shape"
  | "country"
  | "region"
  | "countryLocode"
  | "regionLocode"
  | "area"
  | "projectId"
  | "created"
  | "lastUpdated";
export type CityCreationAttributes = Optional<
  CityAttributes,
  CityOptionalAttributes
>;

export class City
  extends Model<CityAttributes, CityCreationAttributes>
  implements Partial<CityAttributes>
{
  cityId!: string;
  locode?: string;
  name?: string;
  shape?: object;
  country?: string;
  region?: string;
  countryLocode?: string;
  regionLocode?: string;
  area?: number;
  created?: Date;
  lastUpdated?: Date;
  projectId?: string;

  // City belongsToMany User via CityUser.cityId
  users!: User[];
  getUsers!: Sequelize.BelongsToManyGetAssociationsMixin<User>;
  setUsers!: Sequelize.BelongsToManySetAssociationsMixin<User, UserId>;
  addUser!: Sequelize.BelongsToManyAddAssociationMixin<User, UserId>;
  addUsers!: Sequelize.BelongsToManyAddAssociationsMixin<User, UserId>;
  createUser!: Sequelize.BelongsToManyCreateAssociationMixin<User>;
  removeUser!: Sequelize.BelongsToManyRemoveAssociationMixin<User, UserId>;
  removeUsers!: Sequelize.BelongsToManyRemoveAssociationsMixin<User, UserId>;
  hasUser!: Sequelize.BelongsToManyHasAssociationMixin<User, UserId>;
  hasUsers!: Sequelize.BelongsToManyHasAssociationsMixin<User, UserId>;
  countUsers!: Sequelize.BelongsToManyCountAssociationsMixin;
  // City hasMany GDP via cityId
  gdps!: GDP[];
  getGdps!: Sequelize.HasManyGetAssociationsMixin<GDP>;
  setGdps!: Sequelize.HasManySetAssociationsMixin<GDP, GDPId>;
  addGdp!: Sequelize.HasManyAddAssociationMixin<GDP, GDPId>;
  addGdps!: Sequelize.HasManyAddAssociationsMixin<GDP, GDPId>;
  createGdp!: Sequelize.HasManyCreateAssociationMixin<GDP>;
  removeGdp!: Sequelize.HasManyRemoveAssociationMixin<GDP, GDPId>;
  removeGdps!: Sequelize.HasManyRemoveAssociationsMixin<GDP, GDPId>;
  hasGdp!: Sequelize.HasManyHasAssociationMixin<GDP, GDPId>;
  hasGdps!: Sequelize.HasManyHasAssociationsMixin<GDP, GDPId>;
  countGdps!: Sequelize.HasManyCountAssociationsMixin;
  // City hasMany Inventory via cityId
  inventories!: Inventory[];
  getInventories!: Sequelize.HasManyGetAssociationsMixin<Inventory>;
  setInventories!: Sequelize.HasManySetAssociationsMixin<
    Inventory,
    InventoryId
  >;
  addInventory!: Sequelize.HasManyAddAssociationMixin<Inventory, InventoryId>;
  addInventories!: Sequelize.HasManyAddAssociationsMixin<
    Inventory,
    InventoryId
  >;
  createInventory!: Sequelize.HasManyCreateAssociationMixin<Inventory>;
  removeInventory!: Sequelize.HasManyRemoveAssociationMixin<
    Inventory,
    InventoryId
  >;
  removeInventories!: Sequelize.HasManyRemoveAssociationsMixin<
    Inventory,
    InventoryId
  >;
  hasInventory!: Sequelize.HasManyHasAssociationMixin<Inventory, InventoryId>;
  hasInventories!: Sequelize.HasManyHasAssociationsMixin<
    Inventory,
    InventoryId
  >;
  countInventories!: Sequelize.HasManyCountAssociationsMixin;
  // City hasMany Population via cityId
  populations!: Population[];
  getPopulations!: Sequelize.HasManyGetAssociationsMixin<Population>;
  setPopulations!: Sequelize.HasManySetAssociationsMixin<
    Population,
    PopulationId
  >;
  addPopulation!: Sequelize.HasManyAddAssociationMixin<
    Population,
    PopulationId
  >;
  addPopulations!: Sequelize.HasManyAddAssociationsMixin<
    Population,
    PopulationId
  >;
  createPopulation!: Sequelize.HasManyCreateAssociationMixin<Population>;
  removePopulation!: Sequelize.HasManyRemoveAssociationMixin<
    Population,
    PopulationId
  >;
  removePopulations!: Sequelize.HasManyRemoveAssociationsMixin<
    Population,
    PopulationId
  >;
  hasPopulation!: Sequelize.HasManyHasAssociationMixin<
    Population,
    PopulationId
  >;
  hasPopulations!: Sequelize.HasManyHasAssociationsMixin<
    Population,
    PopulationId
  >;
  countPopulations!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof City {
    return City.init(
      {
        cityId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "city_id",
        },
        locode: {
          type: DataTypes.STRING(255),
          allowNull: true,
          unique: "City_locode_key",
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        shape: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        country: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        region: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        countryLocode: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "country_locode",
        },
        regionLocode: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "region_locode",
        },
        area: {
          type: DataTypes.BIGINT,
          allowNull: true,
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Project",
            key: "project_id",
          },
          field: "project_id",
        },
      },
      {
        sequelize,
        tableName: "City",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "City_locode_key",
            unique: true,
            fields: [{ name: "locode" }],
          },
          {
            name: "City_pkey",
            unique: true,
            fields: [{ name: "city_id" }],
          },
        ],
      },
    );
  }
}
