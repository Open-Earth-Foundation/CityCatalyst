import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type {
  DataSourceMethodology,
  DataSourceMethodologyId,
} from "./DataSourceMethodology";
import { EmissionsFactor, EmissionsFactorId } from "./EmissionsFactor";

export interface MethodologyAttributes {
  methodologyId: string;
  methodology?: string;
  methodologyUrl?: string;
  datasourceId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type MethodologyPk = "methodologyId";
export type MethodologyId = Methodology[MethodologyPk];
export type MethodologyOptionalAttributes =
  | "methodology"
  | "methodologyUrl"
  | "datasourceId"
  | "created"
  | "lastUpdated";
export type MethodologyCreationAttributes = Optional<
  MethodologyAttributes,
  MethodologyOptionalAttributes
>;

export class Methodology
  extends Model<MethodologyAttributes, MethodologyCreationAttributes>
  implements Partial<MethodologyAttributes>
{
  declare methodologyId: string;
  declare methodology?: string;
  declare methodologyUrl?: string;
  declare datasourceId?: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // Methodology belongsTo DataSource via datasourceId
  declare datasource: DataSource;
  declare getDatasource: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  declare setDatasource: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare createDatasource: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // Methodology belongsToMany DataSource via methodologyId and datasourceId
  declare datasourceIdDataSourceDataSourceMethodologies: DataSource[];
  declare getDatasourceIdDataSourceDataSourceMethodologies: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  declare setDatasourceIdDataSourceDataSourceMethodologies: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare addDatasourceIdDataSourceDataSourceMethodology: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare addDatasourceIdDataSourceDataSourceMethodologies: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare createDatasourceIdDataSourceDataSourceMethodology: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  declare removeDatasourceIdDataSourceDataSourceMethodology: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare removeDatasourceIdDataSourceDataSourceMethodologies: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDatasourceIdDataSourceDataSourceMethodology: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDatasourceIdDataSourceDataSourceMethodologies: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare countDatasourceIdDataSourceDataSourceMethodologies: Sequelize.BelongsToManyCountAssociationsMixin;
  // Methodology hasMany DataSourceMethodology via methodologyId
  declare dataSourceMethodologies: DataSourceMethodology[];
  declare getDataSourceMethodologies: Sequelize.HasManyGetAssociationsMixin<DataSourceMethodology>;
  declare setDataSourceMethodologies: Sequelize.HasManySetAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare addDataSourceMethodology: Sequelize.HasManyAddAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare addDataSourceMethodologies: Sequelize.HasManyAddAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare createDataSourceMethodology: Sequelize.HasManyCreateAssociationMixin<DataSourceMethodology>;
  declare removeDataSourceMethodology: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare removeDataSourceMethodologies: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare hasDataSourceMethodology: Sequelize.HasManyHasAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare hasDataSourceMethodologies: Sequelize.HasManyHasAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  declare countDataSourceMethodologies: Sequelize.HasManyCountAssociationsMixin;

  // EmissionsFactor belongsTo Methodology via methodologyId
  declare getEmissionsFactors: Sequelize.HasManyGetAssociationsMixin<EmissionsFactor>;
  declare addEmissionsFactor: Sequelize.HasManyAddAssociationMixin<
    EmissionsFactor,
    number
  >;
  declare hasEmissionsFactor: Sequelize.HasManyHasAssociationMixin<
    EmissionsFactor,
    number
  >;
  declare countEmissionsFactors: Sequelize.HasManyCountAssociationsMixin;
  declare createEmissionsFactor: Sequelize.HasManyCreateAssociationMixin<EmissionsFactor>;

  static initModel(sequelize: Sequelize.Sequelize): typeof Methodology {
    return Methodology.init(
      {
        methodologyId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "methodology_id",
        },
        methodology: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        methodologyUrl: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "methodology_url",
        },
        datasourceId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "DataSource",
            key: "datasource_id",
          },
          field: "datasource_id",
        },
      },
      {
        sequelize,
        tableName: "Methodology",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "Methodology_pkey",
            unique: true,
            fields: [{ name: "methodology_id" }],
          },
        ],
      },
    );
  }
}
