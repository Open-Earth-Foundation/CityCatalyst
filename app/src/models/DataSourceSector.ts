import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { Sector, SectorId } from './Sector';

export interface DataSourceSectorAttributes {
  datasourceId: string;
  sectorId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceSectorPk = "datasourceId" | "sectorId";
export type DataSourceSectorId = DataSourceSector[DataSourceSectorPk];
export type DataSourceSectorOptionalAttributes = "created" | "lastUpdated";
export type DataSourceSectorCreationAttributes = Optional<DataSourceSectorAttributes, DataSourceSectorOptionalAttributes>;

export class DataSourceSector extends Model<DataSourceSectorAttributes, DataSourceSectorCreationAttributes> implements DataSourceSectorAttributes {
  datasourceId!: string;
  sectorId!: string;
  created?: Date;
  lastUpdated?: Date;

  // DataSourceSector belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceSector belongsTo Sector via sectorId
  sector!: Sector;
  getSector!: Sequelize.BelongsToGetAssociationMixin<Sector>;
  setSector!: Sequelize.BelongsToSetAssociationMixin<Sector, SectorId>;
  createSector!: Sequelize.BelongsToCreateAssociationMixin<Sector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceSector {
    return DataSourceSector.init({
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
    sectorId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'Sector',
        key: 'sector_id'
      },
      field: 'sector_id'
    }
  }, {
    sequelize,
    tableName: 'DataSourceSector',
    schema: 'public',
    timestamps: true,
    createdAt: 'created',
    updatedAt: 'last_updated',
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
