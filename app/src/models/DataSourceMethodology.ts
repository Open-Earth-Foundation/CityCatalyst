import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type { Methodology, MethodologyId } from "./Methodology";

export interface DataSourceMethodologyAttributes {
  datasourceId: string;
  methodologyId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceMethodologyPk = "datasourceId" | "methodologyId";
export type DataSourceMethodologyId =
  DataSourceMethodology[DataSourceMethodologyPk];
export type DataSourceMethodologyOptionalAttributes = "created" | "lastUpdated";
export type DataSourceMethodologyCreationAttributes = Optional<
  DataSourceMethodologyAttributes,
  DataSourceMethodologyOptionalAttributes
>;

export class DataSourceMethodology
  extends Model<
    DataSourceMethodologyAttributes,
    DataSourceMethodologyCreationAttributes
  >
  implements Partial<DataSourceMethodologyAttributes>
{
  datasourceId!: string;
  methodologyId!: string;
  created?: Date;
  lastUpdated?: Date;

  // DataSourceMethodology belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceMethodology belongsTo Methodology via methodologyId
  methodology!: Methodology;
  getMethodology!: Sequelize.BelongsToGetAssociationMixin<Methodology>;
  setMethodology!: Sequelize.BelongsToSetAssociationMixin<
    Methodology,
    MethodologyId
  >;
  createMethodology!: Sequelize.BelongsToCreateAssociationMixin<Methodology>;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof DataSourceMethodology {
    return DataSourceMethodology.init(
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
        methodologyId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "Methodology",
            key: "methodology_id",
          },
          field: "methodology_id",
        },
      },
      {
        sequelize,
        tableName: "DataSourceMethodology",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "DataSourceMethodology_pkey",
            unique: true,
            fields: [{ name: "datasource_id" }, { name: "methodology_id" }],
          },
        ],
      },
    );
  }
}
