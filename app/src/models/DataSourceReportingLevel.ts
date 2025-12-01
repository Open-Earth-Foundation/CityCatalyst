import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type { ReportingLevel, ReportingLevelId } from "./ReportingLevel";

export interface DataSourceReportingLevelAttributes {
  datasourceId: string;
  reportinglevelId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceReportingLevelPk = "datasourceId" | "reportinglevelId";
export type DataSourceReportingLevelId =
  DataSourceReportingLevel[DataSourceReportingLevelPk];
export type DataSourceReportingLevelOptionalAttributes =
  | "created"
  | "lastUpdated";
export type DataSourceReportingLevelCreationAttributes = Optional<
  DataSourceReportingLevelAttributes,
  DataSourceReportingLevelOptionalAttributes
>;

export class DataSourceReportingLevel
  extends Model<
    DataSourceReportingLevelAttributes,
    DataSourceReportingLevelCreationAttributes
  >
  implements Partial<DataSourceReportingLevelAttributes>
{
  declare datasourceId: string;
  declare reportinglevelId: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // DataSourceReportingLevel belongsTo DataSource via datasourceId
  declare datasource: DataSource;
  declare getDatasource: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  declare setDatasource: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare createDatasource: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceReportingLevel belongsTo ReportingLevel via reportinglevelId
  declare reportinglevel: ReportingLevel;
  declare getReportinglevel: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  declare setReportinglevel: Sequelize.BelongsToSetAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare createReportinglevel: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof DataSourceReportingLevel {
    return DataSourceReportingLevel.init(
      {
        datasourceId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "DataSource",
            key: "datasource_id",
          },
          field: "datasource_id",
        },
        reportinglevelId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "ReportingLevel",
            key: "reportinglevel_id",
          },
          field: "reportinglevel_id",
        },
      },
      {
        sequelize,
        tableName: "DataSourceReportingLevel",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "DataSourceReportingLevel_pkey",
            unique: true,
            fields: [{ name: "datasource_id" }, { name: "reportinglevel_id" }],
          },
        ],
      },
    );
  }
}
