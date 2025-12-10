import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { User, UserId } from "./User";
import type { GDP, GDPId } from "./GDP";
import type { Inventory, InventoryId } from "./Inventory";
import type { Population, PopulationId } from "./Population";
import { Project } from "@/models/Project";
import {CityInvite} from "@/models/CityInvite";

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
  declare cityId: string;
  declare locode?: string;
  declare name?: string;
  declare shape?: object;
  declare country?: string;
  declare region?: string;
  declare countryLocode?: string;
  declare regionLocode?: string;
  declare area?: number;
  declare created?: Date;
  declare lastUpdated?: Date;
  declare projectId?: string;

  // City hasMany CityInvites via cityId
  declare cityInvites: CityInvite[];
  declare getCityInvites: Sequelize.HasManyGetAssociationsMixin<CityInvite>;
  // City belongsToMany User via CityUser.cityId
  declare users: User[];
  declare getUsers: Sequelize.BelongsToManyGetAssociationsMixin<User>;
  declare setUsers: Sequelize.BelongsToManySetAssociationsMixin<User, UserId>;
  declare addUser: Sequelize.BelongsToManyAddAssociationMixin<User, UserId>;
  declare addUsers: Sequelize.BelongsToManyAddAssociationsMixin<User, UserId>;
  declare createUser: Sequelize.BelongsToManyCreateAssociationMixin<User>;
  declare removeUser: Sequelize.BelongsToManyRemoveAssociationMixin<User, UserId>;
  declare removeUsers: Sequelize.BelongsToManyRemoveAssociationsMixin<User, UserId>;
  declare hasUser: Sequelize.BelongsToManyHasAssociationMixin<User, UserId>;
  declare hasUsers: Sequelize.BelongsToManyHasAssociationsMixin<User, UserId>;
  declare countUsers: Sequelize.BelongsToManyCountAssociationsMixin;
  // City hasMany GDP via cityId
  declare gdps: GDP[];
  declare getGdps: Sequelize.HasManyGetAssociationsMixin<GDP>;
  declare setGdps: Sequelize.HasManySetAssociationsMixin<GDP, GDPId>;
  declare addGdp: Sequelize.HasManyAddAssociationMixin<GDP, GDPId>;
  declare addGdps: Sequelize.HasManyAddAssociationsMixin<GDP, GDPId>;
  declare createGdp: Sequelize.HasManyCreateAssociationMixin<GDP>;
  declare removeGdp: Sequelize.HasManyRemoveAssociationMixin<GDP, GDPId>;
  declare removeGdps: Sequelize.HasManyRemoveAssociationsMixin<GDP, GDPId>;
  declare hasGdp: Sequelize.HasManyHasAssociationMixin<GDP, GDPId>;
  declare hasGdps: Sequelize.HasManyHasAssociationsMixin<GDP, GDPId>;
  declare countGdps: Sequelize.HasManyCountAssociationsMixin;

  declare project: Project;
  declare getProject: Sequelize.BelongsToGetAssociationMixin<Project>;
  declare setProject: Sequelize.BelongsToSetAssociationMixin<Project, string>;
  declare createProject: Sequelize.BelongsToCreateAssociationMixin<Project>;
  // City hasMany Inventory via cityId
  declare inventories: Inventory[];
  declare getInventories: Sequelize.HasManyGetAssociationsMixin<Inventory>;
  declare setInventories: Sequelize.HasManySetAssociationsMixin<
    Inventory,
    InventoryId
  >;
  declare addInventory: Sequelize.HasManyAddAssociationMixin<Inventory, InventoryId>;
  declare addInventories: Sequelize.HasManyAddAssociationsMixin<
    Inventory,
    InventoryId
  >;
  declare createInventory: Sequelize.HasManyCreateAssociationMixin<Inventory>;
  declare removeInventory: Sequelize.HasManyRemoveAssociationMixin<
    Inventory,
    InventoryId
  >;
  declare removeInventories: Sequelize.HasManyRemoveAssociationsMixin<
    Inventory,
    InventoryId
  >;
  declare hasInventory: Sequelize.HasManyHasAssociationMixin<Inventory, InventoryId>;
  declare hasInventories: Sequelize.HasManyHasAssociationsMixin<
    Inventory,
    InventoryId
  >;
  declare countInventories: Sequelize.HasManyCountAssociationsMixin;
  // City hasMany Population via cityId
  declare populations: Population[];
  declare getPopulations: Sequelize.HasManyGetAssociationsMixin<Population>;
  declare setPopulations: Sequelize.HasManySetAssociationsMixin<
    Population,
    PopulationId
  >;
  declare addPopulation: Sequelize.HasManyAddAssociationMixin<
    Population,
    PopulationId
  >;
  declare addPopulations: Sequelize.HasManyAddAssociationsMixin<
    Population,
    PopulationId
  >;
  declare createPopulation: Sequelize.HasManyCreateAssociationMixin<Population>;
  declare removePopulation: Sequelize.HasManyRemoveAssociationMixin<
    Population,
    PopulationId
  >;
  declare removePopulations: Sequelize.HasManyRemoveAssociationsMixin<
    Population,
    PopulationId
  >;
  declare hasPopulation: Sequelize.HasManyHasAssociationMixin<
    Population,
    PopulationId
  >;
  declare hasPopulations: Sequelize.HasManyHasAssociationsMixin<
    Population,
    PopulationId
  >;
  declare countPopulations: Sequelize.HasManyCountAssociationsMixin;

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
