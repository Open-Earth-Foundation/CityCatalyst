import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { SubSector, SubSectorId } from './SubSector';

export interface DataSourceSubSectorAttributes {
  datasource_id: string;
  subsector_id: string;
  created?: Date;
  last_updated?: Date;
}

export type DataSourceSubSectorPk = "datasource_id" | "subsector_id";
export type DataSourceSubSectorId = DataSourceSubSector[DataSourceSubSectorPk];
export type DataSourceSubSectorOptionalAttributes = "created" | "last_updated";
export type DataSourceSubSectorCreationAttributes = Optional<DataSourceSubSectorAttributes, DataSourceSubSectorOptionalAttributes>;

export class DataSourceSubSector extends Model<DataSourceSubSectorAttributes, DataSourceSubSectorCreationAttributes> implements DataSourceSubSectorAttributes {
  datasource_id!: string;
  subsector_id!: string;
  created?: Date;
  last_updated?: Date;

  // DataSourceSubSector belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceSubSector belongsTo SubSector via subsector_id
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceSubSector {
    return DataSourceSubSector.init({
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      }
    },
    subsector_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'SubSector',
        key: 'subsector_id'
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
    tableName: 'DataSourceSubSector',
    schema: 'public',
    timestamps: false,
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
