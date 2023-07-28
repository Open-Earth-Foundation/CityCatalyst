import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { ReportingLevel, ReportingLevelId } from './ReportingLevel';

export interface DataSourceReportingLevelAttributes {
  datasource_id: string;
  reportinglevel_id: string;
  created?: Date;
  last_updated?: Date;
}

export type DataSourceReportingLevelPk = "datasource_id" | "reportinglevel_id";
export type DataSourceReportingLevelId = DataSourceReportingLevel[DataSourceReportingLevelPk];
export type DataSourceReportingLevelOptionalAttributes = "created" | "last_updated";
export type DataSourceReportingLevelCreationAttributes = Optional<DataSourceReportingLevelAttributes, DataSourceReportingLevelOptionalAttributes>;

export class DataSourceReportingLevel extends Model<DataSourceReportingLevelAttributes, DataSourceReportingLevelCreationAttributes> implements DataSourceReportingLevelAttributes {
  datasource_id!: string;
  reportinglevel_id!: string;
  created?: Date;
  last_updated?: Date;

  // DataSourceReportingLevel belongsTo DataSource via datasource_id
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<DataSource, DataSourceId>;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceReportingLevel belongsTo ReportingLevel via reportinglevel_id
  reportinglevel!: ReportingLevel;
  getReportinglevel!: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  setReportinglevel!: Sequelize.BelongsToSetAssociationMixin<ReportingLevel, ReportingLevelId>;
  createReportinglevel!: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;

  static initModel(sequelize: Sequelize.Sequelize): typeof DataSourceReportingLevel {
    return DataSourceReportingLevel.init({
    datasource_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'DataSource',
        key: 'datasource_id'
      }
    },
    reportinglevel_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'ReportingLevel',
        key: 'reportinglevel_id'
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
    tableName: 'DataSourceReportingLevel',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "DataSourceReportingLevel_pkey",
        unique: true,
        fields: [
          { name: "datasource_id" },
          { name: "reportinglevel_id" },
        ]
      },
    ]
  });
  }
}
