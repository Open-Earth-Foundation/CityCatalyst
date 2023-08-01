import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceSector, DataSourceSectorId } from './DataSourceSector';
import type { SectorValue, SectorValueId } from './SectorValue';
import type { SubSector, SubSectorId } from './SubSector';

export interface SectorAttributes {
  sector_id: string;
  sector_name?: string;
  created?: Date;
  last_updated?: Date;
}

export type SectorPk = "sector_id";
export type SectorId = Sector[SectorPk];
export type SectorOptionalAttributes = "sector_name" | "created" | "last_updated";
export type SectorCreationAttributes = Optional<SectorAttributes, SectorOptionalAttributes>;

export class Sector extends Model<SectorAttributes, SectorCreationAttributes> implements SectorAttributes {
  sector_id!: string;
  sector_name?: string;
  created?: Date;
  last_updated?: Date;

  // Sector belongsToMany DataSource via sector_id and datasource_id
  datasource_id_DataSource_DataSourceSectors!: DataSource[];
  getDatasource_id_DataSource_DataSourceSectors!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceSectors!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceSector!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceSectors!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceSector!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceSector!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceSectors!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceSector!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceSectors!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceSectors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // Sector hasMany DataSourceSector via sector_id
  DataSourceSectors!: DataSourceSector[];
  getDataSourceSectors!: Sequelize.HasManyGetAssociationsMixin<DataSourceSector>;
  setDataSourceSectors!: Sequelize.HasManySetAssociationsMixin<DataSourceSector, DataSourceSectorId>;
  addDataSourceSector!: Sequelize.HasManyAddAssociationMixin<DataSourceSector, DataSourceSectorId>;
  addDataSourceSectors!: Sequelize.HasManyAddAssociationsMixin<DataSourceSector, DataSourceSectorId>;
  createDataSourceSector!: Sequelize.HasManyCreateAssociationMixin<DataSourceSector>;
  removeDataSourceSector!: Sequelize.HasManyRemoveAssociationMixin<DataSourceSector, DataSourceSectorId>;
  removeDataSourceSectors!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceSector, DataSourceSectorId>;
  hasDataSourceSector!: Sequelize.HasManyHasAssociationMixin<DataSourceSector, DataSourceSectorId>;
  hasDataSourceSectors!: Sequelize.HasManyHasAssociationsMixin<DataSourceSector, DataSourceSectorId>;
  countDataSourceSectors!: Sequelize.HasManyCountAssociationsMixin;
  // Sector hasMany SectorValue via sector_id
  SectorValues!: SectorValue[];
  getSectorValues!: Sequelize.HasManyGetAssociationsMixin<SectorValue>;
  setSectorValues!: Sequelize.HasManySetAssociationsMixin<SectorValue, SectorValueId>;
  addSectorValue!: Sequelize.HasManyAddAssociationMixin<SectorValue, SectorValueId>;
  addSectorValues!: Sequelize.HasManyAddAssociationsMixin<SectorValue, SectorValueId>;
  createSectorValue!: Sequelize.HasManyCreateAssociationMixin<SectorValue>;
  removeSectorValue!: Sequelize.HasManyRemoveAssociationMixin<SectorValue, SectorValueId>;
  removeSectorValues!: Sequelize.HasManyRemoveAssociationsMixin<SectorValue, SectorValueId>;
  hasSectorValue!: Sequelize.HasManyHasAssociationMixin<SectorValue, SectorValueId>;
  hasSectorValues!: Sequelize.HasManyHasAssociationsMixin<SectorValue, SectorValueId>;
  countSectorValues!: Sequelize.HasManyCountAssociationsMixin;
  // Sector hasMany SubSector via sector_id
  SubSectors!: SubSector[];
  getSubSectors!: Sequelize.HasManyGetAssociationsMixin<SubSector>;
  setSubSectors!: Sequelize.HasManySetAssociationsMixin<SubSector, SubSectorId>;
  addSubSector!: Sequelize.HasManyAddAssociationMixin<SubSector, SubSectorId>;
  addSubSectors!: Sequelize.HasManyAddAssociationsMixin<SubSector, SubSectorId>;
  createSubSector!: Sequelize.HasManyCreateAssociationMixin<SubSector>;
  removeSubSector!: Sequelize.HasManyRemoveAssociationMixin<SubSector, SubSectorId>;
  removeSubSectors!: Sequelize.HasManyRemoveAssociationsMixin<SubSector, SubSectorId>;
  hasSubSector!: Sequelize.HasManyHasAssociationMixin<SubSector, SubSectorId>;
  hasSubSectors!: Sequelize.HasManyHasAssociationsMixin<SubSector, SubSectorId>;
  countSubSectors!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof Sector {
    return Sector.init({
    sector_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    sector_name: {
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
    tableName: 'Sector',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "Sector_pkey",
        unique: true,
        fields: [
          { name: "sector_id" },
        ]
      },
    ]
  });
  }
}
