import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { CityUser, CityUserId } from './CityUser';
import type { GDP, GDPId } from './GDP';
import type { Inventory, InventoryId } from './Inventory';
import type { Population, PopulationId } from './Population';

export interface CityAttributes {
  city_id: string;
  name?: string;
  shape?: object;
  country?: string;
  region?: string;
  area?: number;
  created?: Date;
  last_updated?: Date;
}

export type CityPk = "city_id";
export type CityId = City[CityPk];
export type CityOptionalAttributes = "name" | "shape" | "country" | "region" | "area" | "created" | "last_updated";
export type CityCreationAttributes = Optional<CityAttributes, CityOptionalAttributes>;

export class City extends Model<CityAttributes, CityCreationAttributes> implements CityAttributes {
  city_id!: string;
  name?: string;
  shape?: object;
  country?: string;
  region?: string;
  area?: number;
  created?: Date;
  last_updated?: Date;

  // City hasMany CityUser via city_id
  CityUsers!: CityUser[];
  getCityUsers!: Sequelize.HasManyGetAssociationsMixin<CityUser>;
  setCityUsers!: Sequelize.HasManySetAssociationsMixin<CityUser, CityUserId>;
  addCityUser!: Sequelize.HasManyAddAssociationMixin<CityUser, CityUserId>;
  addCityUsers!: Sequelize.HasManyAddAssociationsMixin<CityUser, CityUserId>;
  createCityUser!: Sequelize.HasManyCreateAssociationMixin<CityUser>;
  removeCityUser!: Sequelize.HasManyRemoveAssociationMixin<CityUser, CityUserId>;
  removeCityUsers!: Sequelize.HasManyRemoveAssociationsMixin<CityUser, CityUserId>;
  hasCityUser!: Sequelize.HasManyHasAssociationMixin<CityUser, CityUserId>;
  hasCityUsers!: Sequelize.HasManyHasAssociationsMixin<CityUser, CityUserId>;
  countCityUsers!: Sequelize.HasManyCountAssociationsMixin;
  // City hasMany GDP via city_id
  GDPs!: GDP[];
  getGDPs!: Sequelize.HasManyGetAssociationsMixin<GDP>;
  setGDPs!: Sequelize.HasManySetAssociationsMixin<GDP, GDPId>;
  addGDP!: Sequelize.HasManyAddAssociationMixin<GDP, GDPId>;
  addGDPs!: Sequelize.HasManyAddAssociationsMixin<GDP, GDPId>;
  createGDP!: Sequelize.HasManyCreateAssociationMixin<GDP>;
  removeGDP!: Sequelize.HasManyRemoveAssociationMixin<GDP, GDPId>;
  removeGDPs!: Sequelize.HasManyRemoveAssociationsMixin<GDP, GDPId>;
  hasGDP!: Sequelize.HasManyHasAssociationMixin<GDP, GDPId>;
  hasGDPs!: Sequelize.HasManyHasAssociationsMixin<GDP, GDPId>;
  countGDPs!: Sequelize.HasManyCountAssociationsMixin;
  // City hasMany Inventory via city_id
  Inventories!: Inventory[];
  getInventories!: Sequelize.HasManyGetAssociationsMixin<Inventory>;
  setInventories!: Sequelize.HasManySetAssociationsMixin<Inventory, InventoryId>;
  addInventory!: Sequelize.HasManyAddAssociationMixin<Inventory, InventoryId>;
  addInventories!: Sequelize.HasManyAddAssociationsMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.HasManyCreateAssociationMixin<Inventory>;
  removeInventory!: Sequelize.HasManyRemoveAssociationMixin<Inventory, InventoryId>;
  removeInventories!: Sequelize.HasManyRemoveAssociationsMixin<Inventory, InventoryId>;
  hasInventory!: Sequelize.HasManyHasAssociationMixin<Inventory, InventoryId>;
  hasInventories!: Sequelize.HasManyHasAssociationsMixin<Inventory, InventoryId>;
  countInventories!: Sequelize.HasManyCountAssociationsMixin;
  // City hasMany Population via city_id
  Populations!: Population[];
  getPopulations!: Sequelize.HasManyGetAssociationsMixin<Population>;
  setPopulations!: Sequelize.HasManySetAssociationsMixin<Population, PopulationId>;
  addPopulation!: Sequelize.HasManyAddAssociationMixin<Population, PopulationId>;
  addPopulations!: Sequelize.HasManyAddAssociationsMixin<Population, PopulationId>;
  createPopulation!: Sequelize.HasManyCreateAssociationMixin<Population>;
  removePopulation!: Sequelize.HasManyRemoveAssociationMixin<Population, PopulationId>;
  removePopulations!: Sequelize.HasManyRemoveAssociationsMixin<Population, PopulationId>;
  hasPopulation!: Sequelize.HasManyHasAssociationMixin<Population, PopulationId>;
  hasPopulations!: Sequelize.HasManyHasAssociationsMixin<Population, PopulationId>;
  countPopulations!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof City {
    return City.init({
    city_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    shape: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    region: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    area: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'City',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "City_pkey",
        unique: true,
        fields: [
          { name: "city_id" },
        ]
      },
    ]
  });
  }
}
