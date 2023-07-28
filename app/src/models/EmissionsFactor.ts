import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceEmissionsFactor, DataSourceEmissionsFactorId } from './DataSourceEmissionsFactor';

export interface EmissionsFactorAttributes {
  emissions_factor_id: string;
  emissions_factor?: string;
  emissions_factor_link?: string;
  created?: Date;
  last_updated?: Date;
}

export type EmissionsFactorPk = "emissions_factor_id";
export type EmissionsFactorId = EmissionsFactor[EmissionsFactorPk];
export type EmissionsFactorOptionalAttributes = "emissions_factor" | "emissions_factor_link" | "created" | "last_updated";
export type EmissionsFactorCreationAttributes = Optional<EmissionsFactorAttributes, EmissionsFactorOptionalAttributes>;

export class EmissionsFactor extends Model<EmissionsFactorAttributes, EmissionsFactorCreationAttributes> implements EmissionsFactorAttributes {
  emissions_factor_id!: string;
  emissions_factor?: string;
  emissions_factor_link?: string;
  created?: Date;
  last_updated?: Date;

  // EmissionsFactor belongsToMany DataSource via emissions_factor_id and datasource_id
  datasource_id_DataSource_DataSourceEmissionsFactors!: DataSource[];
  getDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceEmissionsFactor!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceEmissionsFactor!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceEmissionsFactor!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceEmissionsFactor!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // EmissionsFactor hasMany DataSourceEmissionsFactor via emissions_factor_id
  DataSourceEmissionsFactors!: DataSourceEmissionsFactor[];
  getDataSourceEmissionsFactors!: Sequelize.HasManyGetAssociationsMixin<DataSourceEmissionsFactor>;
  setDataSourceEmissionsFactors!: Sequelize.HasManySetAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  addDataSourceEmissionsFactor!: Sequelize.HasManyAddAssociationMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  addDataSourceEmissionsFactors!: Sequelize.HasManyAddAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  createDataSourceEmissionsFactor!: Sequelize.HasManyCreateAssociationMixin<DataSourceEmissionsFactor>;
  removeDataSourceEmissionsFactor!: Sequelize.HasManyRemoveAssociationMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  removeDataSourceEmissionsFactors!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  hasDataSourceEmissionsFactor!: Sequelize.HasManyHasAssociationMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  hasDataSourceEmissionsFactors!: Sequelize.HasManyHasAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  countDataSourceEmissionsFactors!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof EmissionsFactor {
    return EmissionsFactor.init({
    emissions_factor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    emissions_factor: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    emissions_factor_link: {
      type: DataTypes.STRING(255),
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
    tableName: 'EmissionsFactor',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "EmissionsFactor_pkey",
        unique: true,
        fields: [
          { name: "emissions_factor_id" },
        ]
      },
    ]
  });
  }
}
