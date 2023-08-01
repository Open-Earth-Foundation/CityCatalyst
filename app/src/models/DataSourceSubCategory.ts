import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { SubCategory, SubCategoryId } from './SubCategory';

export interface DataSourceSubCategoryAttributes {
  datasourceId: string;
  subcategoryId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceSubCategoryPk = "datasourceId" | "subcategoryId";
export type DataSourceSubCategoryId = DataSourceSubCategory[DataSourceSubCategoryPk];
export type DataSourceSubCategoryOptionalAttributes = "created" | "lastUpdated";
export type DataSourceSubCategoryCreationAttributes = Optional<DataSourceSubCategoryAttributes, DataSourceSubCategoryOptionalAttributes>;

export class DataSourceSubCategory extends Model<DataSourceSubCategoryAttributes, DataSourceSubCategoryCreationAttributes> implements DataSourceSubCategoryAttributes {
  datasourceId!: string;
  subcategoryId!: string;
  created?: Date;
  lastUpdated?: Date;

  // DataSourceSubCategory belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceSubCategory belongsTo SubCategory via subcategoryId
  subcategory!: SubCategory;
  getSubcategory!: Sequelize.BelongsToGetAssociationMixin<SubCategory>;
  setSubcategory!: Sequelize.BelongsToSetAssociationMixin<SubCategory, SubCategoryId>;
  createSubcategory!: Sequelize.BelongsToCreateAssociationMixin<SubCategory>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceSubCategory {
    return DataSourceSubCategory.init({
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
    subcategoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'SubCategory',
        key: 'subcategory_id'
      },
      field: 'subcategory_id'
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
