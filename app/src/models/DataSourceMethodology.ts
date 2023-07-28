import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { Methodology, MethodologyId } from './Methodology';

export interface DataSourceMethodologyAttributes {
  datasource_id: string;
  methodology_id: string;
  created?: Date;
  last_updated?: Date;
}

export type DataSourceMethodologyPk = "datasource_id" | "methodology_id";
export type DataSourceMethodologyId = DataSourceMethodology[DataSourceMethodologyPk];
export type DataSourceMethodologyOptionalAttributes = "created" | "last_updated";
export type DataSourceMethodologyCreationAttributes = Optional<DataSourceMethodologyAttributes, DataSourceMethodologyOptionalAttributes>;

export class DataSourceMethodology extends Model<DataSourceMethodologyAttributes, DataSourceMethodologyCreationAttributes> implements DataSourceMethodologyAttributes {
  datasource_id!: string;
  methodology_id!: string;
  created?: Date;
  last_updated?: Date;

  // DataSourceMethodology belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceMethodology belongsTo Methodology via methodology_id
  methodology!: Methodology;
  getMethodology!: Sequelize.BelongsToGetAssociationMixin<Methodology>;
  setMethodology!: Sequelize.BelongsToSetAssociationMixin<Methodology, MethodologyId>;
  createMethodology!: Sequelize.BelongsToCreateAssociationMixin<Methodology>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceMethodology {
    return DataSourceMethodology.init({
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      }
    },
    methodology_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'Methodology',
        key: 'methodology_id'
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
    tableName: 'DataSourceMethodology',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "DataSourceMethodology_pkey",
        unique: true,
        fields: [
          { name: "datasource_id" },
          { name: "methodology_id" },
        ]
      },
    ]
  });
  }
}
