import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { ActivityData, ActivityDataId } from './ActivityData';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceSubCategory, DataSourceSubCategoryId } from './DataSourceSubCategory';
import type { SubSector, SubSectorId } from './SubSector';

export interface SubCategoryAttributes {
  subcategory_id: string;
  subcategory_name?: string;
  created?: Date;
  last_updated?: Date;
  subsector_id?: string;
}

export type SubCategoryPk = "subcategory_id";
export type SubCategoryId = SubCategory[SubCategoryPk];
export type SubCategoryOptionalAttributes = "subcategory_name" | "created" | "last_updated" | "subsector_id";
export type SubCategoryCreationAttributes = Optional<SubCategoryAttributes, SubCategoryOptionalAttributes>;

export class SubCategory extends Model<SubCategoryAttributes, SubCategoryCreationAttributes> implements SubCategoryAttributes {
  subcategory_id!: string;
  subcategory_name?: string;
  created?: Date;
  last_updated?: Date;
  subsector_id?: string;

  // SubCategory hasMany ActivityData via subcategory_id
  ActivityData!: ActivityData[];
  getActivityData!: Sequelize.HasManyGetAssociationsMixin<ActivityData>;
  setActivityData!: Sequelize.HasManySetAssociationsMixin<ActivityData, ActivityDataId>;
  addActivityDatum!: Sequelize.HasManyAddAssociationMixin<ActivityData, ActivityDataId>;
  addActivityData!: Sequelize.HasManyAddAssociationsMixin<ActivityData, ActivityDataId>;
  createActivityDatum!: Sequelize.HasManyCreateAssociationMixin<ActivityData>;
  removeActivityDatum!: Sequelize.HasManyRemoveAssociationMixin<ActivityData, ActivityDataId>;
  removeActivityData!: Sequelize.HasManyRemoveAssociationsMixin<ActivityData, ActivityDataId>;
  hasActivityDatum!: Sequelize.HasManyHasAssociationMixin<ActivityData, ActivityDataId>;
  hasActivityData!: Sequelize.HasManyHasAssociationsMixin<ActivityData, ActivityDataId>;
  countActivityData!: Sequelize.HasManyCountAssociationsMixin;
  // SubCategory belongsToMany DataSource via subcategory_id and datasource_id
  datasource_id_DataSource_DataSourceSubCategories!: DataSource[];
  getDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceSubCategory!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceSubCategory!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceSubCategory!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceSubCategory!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceSubCategories!: Sequelize.BelongsToManyCountAssociationsMixin;
  // SubCategory hasMany DataSourceSubCategory via subcategory_id
  DataSourceSubCategories!: DataSourceSubCategory[];
  getDataSourceSubCategories!: Sequelize.HasManyGetAssociationsMixin<DataSourceSubCategory>;
  setDataSourceSubCategories!: Sequelize.HasManySetAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  addDataSourceSubCategory!: Sequelize.HasManyAddAssociationMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  addDataSourceSubCategories!: Sequelize.HasManyAddAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  createDataSourceSubCategory!: Sequelize.HasManyCreateAssociationMixin<DataSourceSubCategory>;
  removeDataSourceSubCategory!: Sequelize.HasManyRemoveAssociationMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  removeDataSourceSubCategories!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  hasDataSourceSubCategory!: Sequelize.HasManyHasAssociationMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  hasDataSourceSubCategories!: Sequelize.HasManyHasAssociationsMixin<DataSourceSubCategory, DataSourceSubCategoryId>;
  countDataSourceSubCategories!: Sequelize.HasManyCountAssociationsMixin;
  // SubCategory belongsTo SubSector via subsector_id
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubCategory {
    return SubCategory.init({
    subcategory_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    subcategory_name: {
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
    subsector_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'SubSector',
        key: 'subsector_id'
      }
    }
  }, {
    sequelize,
    tableName: 'SubCategory',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "SubCategory_pkey",
        unique: true,
        fields: [
          { name: "subcategory_id" },
        ]
      },
    ]
  });
  }
}
