import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { SubCategory, SubCategoryId } from './SubCategory';

export interface DataSourceSubCategoryAttributes {
  datasource_id: string;
  subcategory_id: string;
  created?: Date;
  last_updated?: Date;
}

export type DataSourceSubCategoryPk = "datasource_id" | "subcategory_id";
export type DataSourceSubCategoryId = DataSourceSubCategory[DataSourceSubCategoryPk];
export type DataSourceSubCategoryOptionalAttributes = "created" | "last_updated";
export type DataSourceSubCategoryCreationAttributes = Optional<DataSourceSubCategoryAttributes, DataSourceSubCategoryOptionalAttributes>;

export class DataSourceSubCategory extends Model<DataSourceSubCategoryAttributes, DataSourceSubCategoryCreationAttributes> implements DataSourceSubCategoryAttributes {
  datasource_id!: string;
  subcategory_id!: string;
  created?: Date;
  last_updated?: Date;

  // DataSourceSubCategory belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceSubCategory belongsTo SubCategory via subcategory_id
  subcategory!: SubCategory;
  getSubcategory!: Sequelize.BelongsToGetAssociationMixin<SubCategory>;
  setSubcategory!: Sequelize.BelongsToSetAssociationMixin<SubCategory, SubCategoryId>;
  createSubcategory!: Sequelize.BelongsToCreateAssociationMixin<SubCategory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceSubCategory {
    return DataSourceSubCategory.init({
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      }
    },
    subcategory_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'SubCategory',
        key: 'subcategory_id'
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
    tableName: 'DataSourceSubCategory',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "DataSourceSubCategory_pkey",
        unique: true,
        fields: [
          { name: "datasource_id" },
          { name: "subcategory_id" },
        ]
      },
    ]
  });
  }
}
