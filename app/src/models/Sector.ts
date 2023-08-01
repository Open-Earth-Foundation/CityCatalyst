import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceSector, DataSourceSectorId } from './DataSourceSector';
import type { SectorValue, SectorValueId } from './SectorValue';
import type { SubSector, SubSectorId } from './SubSector';

export interface SectorAttributes {
  sectorId: string;
  sectorName?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SectorPk = "sectorId";
export type SectorId = Sector[SectorPk];
export type SectorOptionalAttributes = "sectorName" | "created" | "lastUpdated";
export type SectorCreationAttributes = Optional<SectorAttributes, SectorOptionalAttributes>;

export class Sector extends Model<SectorAttributes, SectorCreationAttributes> implements SectorAttributes {
  sectorId!: string;
  sectorName?: string;
  created?: Date;
  lastUpdated?: Date;

  // Sector belongsToMany DataSource via sectorId and datasourceId
  datasourceIdDataSourceDataSourceSectors!: DataSource[];
  getDatasourceIdDataSourceDataSourceSectors!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasourceIdDataSourceDataSourceSectors!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasourceIdDataSourceDataSourceSector!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasourceIdDataSourceDataSourceSectors!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasourceIdDataSourceDataSourceSector!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasourceIdDataSourceDataSourceSector!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasourceIdDataSourceDataSourceSectors!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasourceIdDataSourceDataSourceSector!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasourceIdDataSourceDataSourceSectors!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasourceIdDataSourceDataSourceSectors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // Sector hasMany DataSourceSector via sectorId
  dataSourceSectors!: DataSourceSector[];
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
  // Sector hasMany SectorValue via sectorId
  sectorValues!: SectorValue[];
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
  // Sector hasMany SubSector via sectorId
  subSectors!: SubSector[];
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
    sectorId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'sector_id'
    },
    sectorName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'sector_name'
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lastUpdated: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_updated'
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
