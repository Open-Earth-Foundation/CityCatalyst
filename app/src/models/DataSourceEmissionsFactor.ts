import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type { EmissionsFactor, EmissionsFactorId } from "./EmissionsFactor";

export interface DataSourceEmissionsFactorAttributes {
  datasourceId: string;
  emissionsFactorId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceEmissionsFactorPk = "datasourceId" | "emissionsFactorId";
export type DataSourceEmissionsFactorId =
  DataSourceEmissionsFactor[DataSourceEmissionsFactorPk];
export type DataSourceEmissionsFactorOptionalAttributes =
  | "created"
  | "lastUpdated";
export type DataSourceEmissionsFactorCreationAttributes = Optional<
  DataSourceEmissionsFactorAttributes,
  DataSourceEmissionsFactorOptionalAttributes
>;

export class DataSourceEmissionsFactor
  extends Model<
    DataSourceEmissionsFactorAttributes,
    DataSourceEmissionsFactorCreationAttributes
  >
  implements Partial<DataSourceEmissionsFactorAttributes>
{
  datasourceId!: string;
  emissionsFactorId!: string;
  created?: Date;
  lastUpdated?: Date;

  // DataSourceEmissionsFactor belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceEmissionsFactor belongsTo EmissionsFactor via emissionsFactorId
  emissionsFactor!: EmissionsFactor;
  getEmissionsFactor!: Sequelize.BelongsToGetAssociationMixin<EmissionsFactor>;
  setEmissionsFactor!: Sequelize.BelongsToSetAssociationMixin<
    EmissionsFactor,
    EmissionsFactorId
  >;
  createEmissionsFactor!: Sequelize.BelongsToCreateAssociationMixin<EmissionsFactor>;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof DataSourceEmissionsFactor {
    return DataSourceEmissionsFactor.init(
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
        emissionsFactorId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "EmissionsFactor",
            key: "emissions_factor_id",
          },
          field: "emissions_factor_id",
        },
      },
      {
        sequelize,
        tableName: "DataSourceEmissionsFactor",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "DataSourceEmissionsFactor_pkey",
            unique: true,
            fields: [
              { name: "datasource_id" },
              { name: "emissions_factor_id" },
            ],
          },
        ],
      },
    );
  }
}
