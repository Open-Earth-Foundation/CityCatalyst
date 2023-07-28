import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { EmissionsFactor, EmissionsFactorId } from './EmissionsFactor';

export interface DataSourceEmissionsFactorAttributes {
  datasource_id: string;
  emissions_factor_id: string;
  created?: Date;
  last_updated?: Date;
}

export type DataSourceEmissionsFactorPk = "datasource_id" | "emissions_factor_id";
export type DataSourceEmissionsFactorId = DataSourceEmissionsFactor[DataSourceEmissionsFactorPk];
export type DataSourceEmissionsFactorOptionalAttributes = "created" | "last_updated";
export type DataSourceEmissionsFactorCreationAttributes = Optional<DataSourceEmissionsFactorAttributes, DataSourceEmissionsFactorOptionalAttributes>;

export class DataSourceEmissionsFactor extends Model<DataSourceEmissionsFactorAttributes, DataSourceEmissionsFactorCreationAttributes> implements DataSourceEmissionsFactorAttributes {
  datasource_id!: string;
  emissions_factor_id!: string;
  created?: Date;
  last_updated?: Date;

  // DataSourceEmissionsFactor belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceEmissionsFactor belongsTo EmissionsFactor via emissions_factor_id
  emissions_factor!: EmissionsFactor;
  getEmissions_factor!: Sequelize.BelongsToGetAssociationMixin<EmissionsFactor>;
  setEmissions_factor!: Sequelize.BelongsToSetAssociationMixin<EmissionsFactor, EmissionsFactorId>;
  createEmissions_factor!: Sequelize.BelongsToCreateAssociationMixin<EmissionsFactor>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceEmissionsFactor {
    return DataSourceEmissionsFactor.init({
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      }
    },
    emissions_factor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'EmissionsFactor',
        key: 'emissions_factor_id'
      }
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
    tableName: 'DataSourceEmissionsFactor',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "DataSourceEmissionsFactor_pkey",
        unique: true,
        fields: [
          { name: "datasource_id" },
          { name: "emissions_factor_id" },
        ]
      },
    ]
  });
  }
}
