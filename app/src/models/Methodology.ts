import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceMethodology, DataSourceMethodologyId } from './DataSourceMethodology';

export interface MethodologyAttributes {
  methodology_id: string;
  methodology?: string;
  methodology_url?: string;
  datasource_id?: string;
  created?: Date;
  last_updated?: Date;
}

export type MethodologyPk = "methodology_id";
export type MethodologyId = Methodology[MethodologyPk];
export type MethodologyOptionalAttributes = "methodology" | "methodology_url" | "datasource_id" | "created" | "last_updated";
export type MethodologyCreationAttributes = Optional<MethodologyAttributes, MethodologyOptionalAttributes>;

export class Methodology extends Model<MethodologyAttributes, MethodologyCreationAttributes> implements MethodologyAttributes {
  methodology_id!: string;
  methodology?: string;
  methodology_url?: string;
  datasource_id?: string;
  created?: Date;
  last_updated?: Date;

  // Methodology belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // Methodology belongsToMany DataSource via methodology_id and datasource_id
  datasource_id_DataSource_DataSourceMethodologies!: DataSource[];
  getDatasource_id_DataSource_DataSourceMethodologies!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceMethodologies!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceMethodology!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceMethodologies!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceMethodology!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceMethodology!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceMethodologies!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceMethodology!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceMethodologies!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceMethodologies!: Sequelize.BelongsToManyCountAssociationsMixin;
  // Methodology hasMany DataSourceMethodology via methodology_id
  DataSourceMethodologies!: DataSourceMethodology[];
  getDataSourceMethodologies!: Sequelize.HasManyGetAssociationsMixin<DataSourceMethodology>;
  setDataSourceMethodologies!: Sequelize.HasManySetAssociationsMixin<DataSourceMethodology, DataSourceMethodologyId>;
  addDataSourceMethodology!: Sequelize.HasManyAddAssociationMixin<DataSourceMethodology, DataSourceMethodologyId>;
  addDataSourceMethodologies!: Sequelize.HasManyAddAssociationsMixin<DataSourceMethodology, DataSourceMethodologyId>;
  createDataSourceMethodology!: Sequelize.HasManyCreateAssociationMixin<DataSourceMethodology>;
  removeDataSourceMethodology!: Sequelize.HasManyRemoveAssociationMixin<DataSourceMethodology, DataSourceMethodologyId>;
  removeDataSourceMethodologies!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceMethodology, DataSourceMethodologyId>;
  hasDataSourceMethodology!: Sequelize.HasManyHasAssociationMixin<DataSourceMethodology, DataSourceMethodologyId>;
  hasDataSourceMethodologies!: Sequelize.HasManyHasAssociationsMixin<DataSourceMethodology, DataSourceMethodologyId>;
  countDataSourceMethodologies!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof Methodology {
    return Methodology.init({
    methodology_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    methodology: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    methodology_url: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
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
    tableName: 'Methodology',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "Methodology_pkey",
        unique: true,
        fields: [
          { name: "methodology_id" },
        ]
      },
    ]
  });
  }
}
