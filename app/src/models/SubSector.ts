import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceSubSector, DataSourceSubSectorId } from './DataSourceSubSector';
import type { Sector, SectorId } from './Sector';
import type { SubCategory, SubCategoryId } from './SubCategory';

export interface SubSectorAttributes {
  subsector_id: string;
  subsector_name?: string;
  created?: Date;
  last_updated?: Date;
  sector_id?: string;
}

export type SubSectorPk = "subsector_id";
export type SubSectorId = SubSector[SubSectorPk];
export type SubSectorOptionalAttributes = "subsector_name" | "created" | "last_updated" | "sector_id";
export type SubSectorCreationAttributes = Optional<SubSectorAttributes, SubSectorOptionalAttributes>;

export class SubSector extends Model<SubSectorAttributes, SubSectorCreationAttributes> implements SubSectorAttributes {
  subsector_id!: string;
  subsector_name?: string;
  created?: Date;
  last_updated?: Date;
  sector_id?: string;

  // SubSector belongsTo Sector via sector_id
  sector!: Sector;
  getSector!: Sequelize.BelongsToGetAssociationMixin<Sector>;
  setSector!: Sequelize.BelongsToSetAssociationMixin<Sector, SectorId>;
  createSector!: Sequelize.BelongsToCreateAssociationMixin<Sector>;
  // SubSector belongsToMany DataSource via subsector_id and datasource_id
  datasource_id_DataSource_DataSourceSubSectors!: DataSource[];
  getDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceSubSector!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceSubSector!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceSubSector!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceSubSector!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceSubSectors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // SubSector hasMany DataSourceSubSector via subsector_id
  DataSourceSubSectors!: DataSourceSubSector[];
  getDataSourceSubSectors!: Sequelize.HasManyGetAssociationsMixin<DataSourceSubSector>;
  setDataSourceSubSectors!: Sequelize.HasManySetAssociationsMixin<DataSourceSubSector, DataSourceSubSectorId>;
  addDataSourceSubSector!: Sequelize.HasManyAddAssociationMixin<DataSourceSubSector, DataSourceSubSectorId>;
  addDataSourceSubSectors!: Sequelize.HasManyAddAssociationsMixin<DataSourceSubSector, DataSourceSubSectorId>;
  createDataSourceSubSector!: Sequelize.HasManyCreateAssociationMixin<DataSourceSubSector>;
  removeDataSourceSubSector!: Sequelize.HasManyRemoveAssociationMixin<DataSourceSubSector, DataSourceSubSectorId>;
  removeDataSourceSubSectors!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceSubSector, DataSourceSubSectorId>;
  hasDataSourceSubSector!: Sequelize.HasManyHasAssociationMixin<DataSourceSubSector, DataSourceSubSectorId>;
  hasDataSourceSubSectors!: Sequelize.HasManyHasAssociationsMixin<DataSourceSubSector, DataSourceSubSectorId>;
  countDataSourceSubSectors!: Sequelize.HasManyCountAssociationsMixin;
  // SubSector hasMany SubCategory via subsector_id
  SubCategories!: SubCategory[];
  getSubCategories!: Sequelize.HasManyGetAssociationsMixin<SubCategory>;
  setSubCategories!: Sequelize.HasManySetAssociationsMixin<SubCategory, SubCategoryId>;
  addSubCategory!: Sequelize.HasManyAddAssociationMixin<SubCategory, SubCategoryId>;
  addSubCategories!: Sequelize.HasManyAddAssociationsMixin<SubCategory, SubCategoryId>;
  createSubCategory!: Sequelize.HasManyCreateAssociationMixin<SubCategory>;
  removeSubCategory!: Sequelize.HasManyRemoveAssociationMixin<SubCategory, SubCategoryId>;
  removeSubCategories!: Sequelize.HasManyRemoveAssociationsMixin<SubCategory, SubCategoryId>;
  hasSubCategory!: Sequelize.HasManyHasAssociationMixin<SubCategory, SubCategoryId>;
  hasSubCategories!: Sequelize.HasManyHasAssociationsMixin<SubCategory, SubCategoryId>;
  countSubCategories!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubSector {
    return SubSector.init({
    subsector_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    subsector_name: {
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
    },
    sector_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Sector',
        key: 'sector_id'
      }
    }
  }, {
    sequelize,
    tableName: 'SubSector',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "SubSector_pkey",
        unique: true,
        fields: [
          { name: "subsector_id" },
        ]
      },
    ]
  });
  }
}
