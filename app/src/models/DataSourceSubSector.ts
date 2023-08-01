import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { SubSector, SubSectorId } from './SubSector';

export interface DataSourceSubSectorAttributes {
  datasourceId: string;
  subsectorId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceSubSectorPk = "datasourceId" | "subsectorId";
export type DataSourceSubSectorId = DataSourceSubSector[DataSourceSubSectorPk];
export type DataSourceSubSectorOptionalAttributes = "created" | "lastUpdated";
export type DataSourceSubSectorCreationAttributes = Optional<DataSourceSubSectorAttributes, DataSourceSubSectorOptionalAttributes>;

export class DataSourceSubSector extends Model<DataSourceSubSectorAttributes, DataSourceSubSectorCreationAttributes> implements DataSourceSubSectorAttributes {
  datasourceId!: string;
  subsectorId!: string;
  created?: Date;
  lastUpdated?: Date;

  // DataSourceSubSector belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceSubSector belongsTo SubSector via subsectorId
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceSubSector {
    return DataSourceSubSector.init({
    datasourceId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      },
      field: 'datasource_id'
    },
    subsectorId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'SubSector',
        key: 'subsector_id'
      },
      field: 'subsector_id'
    }
  }, {
    sequelize,
    tableName: 'DataSourceSubSector',
    schema: 'public',
    timestamps: true,
    createdAt: 'created',
    updatedAt: 'last_updated',
    indexes: [
      {
        name: "DataSourceSubSector_pkey",
        unique: true,
        fields: [
          { name: "datasource_id" },
          { name: "subsector_id" },
        ]
      },
    ]
  });
  }
}
