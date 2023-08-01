import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { Methodology, MethodologyId } from './Methodology';

export interface DataSourceMethodologyAttributes {
  datasourceId: string;
  methodologyId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceMethodologyPk = "datasourceId" | "methodologyId";
export type DataSourceMethodologyId = DataSourceMethodology[DataSourceMethodologyPk];
export type DataSourceMethodologyOptionalAttributes = "created" | "lastUpdated";
export type DataSourceMethodologyCreationAttributes = Optional<DataSourceMethodologyAttributes, DataSourceMethodologyOptionalAttributes>;

export class DataSourceMethodology extends Model<DataSourceMethodologyAttributes, DataSourceMethodologyCreationAttributes> implements DataSourceMethodologyAttributes {
  datasourceId!: string;
  methodologyId!: string;
  created?: Date;
  lastUpdated?: Date;

  // DataSourceMethodology belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceMethodology belongsTo Methodology via methodologyId
  methodology!: Methodology;
  getMethodology!: Sequelize.BelongsToGetAssociationMixin<Methodology>;
  setMethodology!: Sequelize.BelongsToSetAssociationMixin<Methodology, MethodologyId>;
  createMethodology!: Sequelize.BelongsToCreateAssociationMixin<Methodology>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceMethodology {
    return DataSourceMethodology.init({
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
    methodologyId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'Methodology',
        key: 'methodology_id'
      },
      field: 'methodology_id'
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
