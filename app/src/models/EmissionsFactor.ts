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
  /**
   * Indicates whether this emissions factor was removed from seed data and should not be used for new calculations.
   * Deprecated emissions factors are maintained for historical data consistency (of existing inventories).
   */
  deprecated?: boolean;
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
  | "deprecated"
  | "created"
  | "lastUpdated";
export type EmissionsFactorCreationAttributes = Optional<
  EmissionsFactorAttributes,
  EmissionsFactorOptionalAttributes
>;

export class EmissionsFactor
  extends Model<EmissionsFactorAttributes, EmissionsFactorCreationAttributes>
  implements Partial<EmissionsFactorAttributes>
{
  declare id: string;
  declare gpcReferenceNumber?: string;
  declare emissionsPerActivity?: number;
  declare url?: string;
  declare gas?: string;
  declare units?: string;
  declare inventoryId?: string | null;
  declare region?: string | null;
  declare actorId?: string | null;
  declare methodologyName?: string | null;
  declare methodologyId?: string | null;
  declare metadata?: Record<string, any>;
  declare reference?: string | null;
  declare deprecated?: boolean;
  declare created?: Date;
  declare lastUpdated?: Date;

  // EmissionsFactor belongsTo Inventory via inventoryId
  declare inventory: Inventory;
  declare getInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setInventory: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  declare createInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;

  // EmissionsFactor belongsTo Methodology via methodologyId
  declare methodology: Methodology;
  declare getMethodology: Sequelize.BelongsToGetAssociationMixin<Methodology>;
  declare setMethodology: Sequelize.BelongsToSetAssociationMixin<
    Methodology,
    MethodologyId
  >;
  declare createMethodology: Sequelize.BelongsToCreateAssociationMixin<Methodology>;

  // EmissionsFactor belongsToMany DataSource via emissionsFactorId and datasourceId
  declare dataSources: DataSource[];
  declare getDataSources: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  declare setDataSources: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare addDataSource: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare addDataSources: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare createDataSource: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  declare removeDataSource: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare removeDataSources: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDataSource: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDataSources: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare countDataSources: Sequelize.BelongsToManyCountAssociationsMixin;
  // EmissionsFactor hasMany DataSourceEmissionsFactor via emissionsFactorId
  declare dataSourceEmissionsFactors: DataSourceEmissionsFactor[];
  declare getDataSourceEmissionsFactors: Sequelize.HasManyGetAssociationsMixin<DataSourceEmissionsFactor>;
  declare setDataSourceEmissionsFactors: Sequelize.HasManySetAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare addDataSourceEmissionsFactor: Sequelize.HasManyAddAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare addDataSourceEmissionsFactors: Sequelize.HasManyAddAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare createDataSourceEmissionsFactor: Sequelize.HasManyCreateAssociationMixin<DataSourceEmissionsFactor>;
  declare removeDataSourceEmissionsFactor: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare removeDataSourceEmissionsFactors: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare hasDataSourceEmissionsFactor: Sequelize.HasManyHasAssociationMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare hasDataSourceEmissionsFactors: Sequelize.HasManyHasAssociationsMixin<
    DataSourceEmissionsFactor,
    DataSourceEmissionsFactorId
  >;
  declare countDataSourceEmissionsFactors: Sequelize.HasManyCountAssociationsMixin;
  // EmissionsFactor hasMany GasValue via emissionsFactorId
  declare gasValues: GasValue[];
  declare getGasValues: Sequelize.HasManyGetAssociationsMixin<GasValue>;
  declare setGasValues: Sequelize.HasManySetAssociationsMixin<GasValue, GasValueId>;
  declare addGasValue: Sequelize.HasManyAddAssociationMixin<GasValue, GasValueId>;
  declare addGasValues: Sequelize.HasManyAddAssociationsMixin<GasValue, GasValueId>;
  declare createGasValue: Sequelize.HasManyCreateAssociationMixin<GasValue>;
  declare removeGasValue: Sequelize.HasManyRemoveAssociationMixin<
    GasValue,
    GasValueId
  >;
  declare removeGasValues: Sequelize.HasManyRemoveAssociationsMixin<
    GasValue,
    GasValueId
  >;
  declare hasGasValue: Sequelize.HasManyHasAssociationMixin<GasValue, GasValueId>;
  declare hasGasValues: Sequelize.HasManyHasAssociationsMixin<GasValue, GasValueId>;
  declare countGasValues: Sequelize.HasManyCountAssociationsMixin;

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
        deprecated: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false,
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
