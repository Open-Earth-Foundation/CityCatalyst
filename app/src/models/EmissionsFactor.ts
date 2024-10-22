import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type {
  DataSourceEmissionsFactor,
  DataSourceEmissionsFactorId,
} from "./DataSourceEmissionsFactor";
import type { GasValue, GasValueId } from "./GasValue";
import { Inventory, InventoryId } from "./Inventory";
import { Methodology, MethodologyId } from "./Methodology";

export interface EmissionsFactorAttributes {
  id: string;
  gpcReferenceNumber?: string;
  emissionsPerActivity?: number;
  metadata?: Record<string, any>;
  url?: string;
  gas?: string;
  units?: string;
  inventoryId?: string | null;
  region?: string | null;
  actorId?: string | null;
  methodologyName?: string | null;
  methodologyId?: string | null;
  reference?: string | null;
  created?: Date;
  lastUpdated?: Date;
}

export type EmissionsFactorPk = "id";
export type EmissionsFactorId = EmissionsFactor[EmissionsFactorPk];
export type EmissionsFactorOptionalAttributes =
  | "gpcReferenceNumber"
  | "emissionsPerActivity"
  | "url"
  | "gas"
  | "units"
  | "inventoryId"
  | "region"
  | "actorId"
  | "methodologyName"
  | "metadata"
  | "methodologyId"
  | "reference"
  | "created"
  | "lastUpdated";
export type EmissionsFactorCreationAttributes = Optional<
  EmissionsFactorAttributes,
  EmissionsFactorOptionalAttributes
>;

export class EmissionsFactor
  extends Model<EmissionsFactorAttributes, EmissionsFactorCreationAttributes>
  implements EmissionsFactorAttributes
{
  id!: string;
  gpcReferenceNumber?: string;
  emissionsPerActivity?: number;
  url?: string;
  gas?: string;
  units?: string;
  inventoryId?: string | null;
  region?: string | null;
  actorId?: string | null;
  methodologyName?: string | null;
  methodologyId?: string | null;
  metadata?: Record<string, any>;
  reference?: string | null;
  created?: Date;
  lastUpdated?: Date;

  // EmissionsFactor belongsTo Inventory via inventoryId
  inventory!: Inventory;
  getInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setInventory!: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  // EmissionsFactor belongsTo Methodology via methodologyId
  methodology!: Methodology;
  getMethodology!: Sequelize.BelongsToGetAssociationMixin<Methodology>;
  setMethodology!: Sequelize.BelongsToSetAssociationMixin<
    Methodology,
    MethodologyId
  >;
  createMethodology!: Sequelize.BelongsToCreateAssociationMixin<Methodology>;

  // EmissionsFactor belongsToMany DataSource via emissionsFactorId and datasourceId
  dataSources!: DataSource[];
  getDataSources!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDataSources!: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  addDataSource!: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  addDataSources!: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  createDataSource!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDataSource!: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  removeDataSources!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  hasDataSource!: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  hasDataSources!: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  countDataSources!: Sequelize.BelongsToManyCountAssociationsMixin;
  // EmissionsFactor hasMany DataSourceEmissionsFactor via emissionsFactorId
  dataSourceEmissionsFactors!: DataSourceEmissionsFactor[];
  getDataSourceEmissionsFactors!: Sequelize.HasManyGetAssociationsMixin<DataSourceEmissionsFactor>;
  setDataSourceEmissionsFactors!: Sequelize.HasManySetAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  addDataSourceEmissionsFactor!: Sequelize.HasManyAddAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  addDataSourceEmissionsFactors!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  createDataSourceEmissionsFactor!: Sequelize.HasManyCreateAssociationMixin<DataSourceEmissionsFactor>;
  removeDataSourceEmissionsFactor!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  removeDataSourceEmissionsFactors!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  hasDataSourceEmissionsFactor!: Sequelize.HasManyHasAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  hasDataSourceEmissionsFactors!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  countDataSourceEmissionsFactors!: Sequelize.HasManyCountAssociationsMixin;
  // EmissionsFactor hasMany GasValue via emissionsFactorId
  gasValues!: GasValue[];
  getGasValues!: Sequelize.HasManyGetAssociationsMixin<GasValue>;
  setGasValues!: Sequelize.HasManySetAssociationsMixin<GasValue, GasValueId>;
  addGasValue!: Sequelize.HasManyAddAssociationMixin<GasValue, GasValueId>;
  addGasValues!: Sequelize.HasManyAddAssociationsMixin<GasValue, GasValueId>;
  createGasValue!: Sequelize.HasManyCreateAssociationMixin<GasValue>;
  removeGasValue!: Sequelize.HasManyRemoveAssociationMixin<
    GasValue,
    GasValueId
  >;
  removeGasValues!: Sequelize.HasManyRemoveAssociationsMixin<
    GasValue,
    GasValueId
  >;
  hasGasValue!: Sequelize.HasManyHasAssociationMixin<GasValue, GasValueId>;
  hasGasValues!: Sequelize.HasManyHasAssociationsMixin<GasValue, GasValueId>;
  countGasValues!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof EmissionsFactor {
    return EmissionsFactor.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
        },
        gpcReferenceNumber: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "gpc_reference_number",
        },
        emissionsPerActivity: {
          type: DataTypes.DECIMAL,
          allowNull: true,
          field: "emissions_per_activity",
        },
        url: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        gas: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        units: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Inventory",
            key: "inventory_id",
          },
          field: "inventory_id",
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        region: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        actorId: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "actor_id",
        },
        methodologyName: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "methodology_name",
        },
        methodologyId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Methodology",
            key: "methodology_id",
          },
          field: "methodology_id",
        },
        reference: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: "EmissionsFactor",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "EmissionsFactor_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
}
