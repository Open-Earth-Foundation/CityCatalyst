import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { Sector, SectorId } from './Sector';

export interface DataSourceSectorAttributes {
  datasource_id: string;
  sector_id: string;
  created?: Date;
  last_updated?: Date;
}

export type DataSourceSectorPk = "datasource_id" | "sector_id";
export type DataSourceSectorId = DataSourceSector[DataSourceSectorPk];
export type DataSourceSectorOptionalAttributes = "created" | "last_updated";
export type DataSourceSectorCreationAttributes = Optional<DataSourceSectorAttributes, DataSourceSectorOptionalAttributes>;

export class DataSourceSector extends Model<DataSourceSectorAttributes, DataSourceSectorCreationAttributes> implements DataSourceSectorAttributes {
  datasource_id!: string;
  sector_id!: string;
  created?: Date;
  last_updated?: Date;

  // DataSourceSector belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceSector belongsTo Sector via sector_id
  sector!: Sector;
  getSector!: Sequelize.BelongsToGetAssociationMixin<Sector>;
  setSector!: Sequelize.BelongsToSetAssociationMixin<Sector, SectorId>;
  createSector!: Sequelize.BelongsToCreateAssociationMixin<Sector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceSector {
    return DataSourceSector.init({
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      }
    },
    sector_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'Sector',
        key: 'sector_id'
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
    tableName: 'DataSourceSector',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "DataSourceSector_pkey",
        unique: true,
        fields: [
          { name: "datasource_id" },
          { name: "sector_id" },
        ]
      },
    ]
  });
  }
}
