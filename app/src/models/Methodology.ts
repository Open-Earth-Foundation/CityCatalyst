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
  methodologyId!: string;
  methodology?: string;
  methodologyUrl?: string;
  datasourceId?: string;
  created?: Date;
  lastUpdated?: Date;

  // Methodology belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // Methodology belongsToMany DataSource via methodologyId and datasourceId
  datasourceIdDataSourceDataSourceMethodologies!: DataSource[];
  getDatasourceIdDataSourceDataSourceMethodologies!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasourceIdDataSourceDataSourceMethodologies!: Sequelize.BelongsToManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSourceDataSourceMethodology!: Sequelize.BelongsToManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  addDatasourceIdDataSourceDataSourceMethodologies!: Sequelize.BelongsToManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  createDatasourceIdDataSourceDataSourceMethodology!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasourceIdDataSourceDataSourceMethodology!: Sequelize.BelongsToManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  removeDatasourceIdDataSourceDataSourceMethodologies!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSourceDataSourceMethodology!: Sequelize.BelongsToManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  hasDatasourceIdDataSourceDataSourceMethodologies!: Sequelize.BelongsToManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  countDatasourceIdDataSourceDataSourceMethodologies!: Sequelize.BelongsToManyCountAssociationsMixin;
  // Methodology hasMany DataSourceMethodology via methodologyId
  dataSourceMethodologies!: DataSourceMethodology[];
  getDataSourceMethodologies!: Sequelize.HasManyGetAssociationsMixin<DataSourceMethodology>;
  setDataSourceMethodologies!: Sequelize.HasManySetAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  addDataSourceMethodology!: Sequelize.HasManyAddAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  addDataSourceMethodologies!: Sequelize.HasManyAddAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  createDataSourceMethodology!: Sequelize.HasManyCreateAssociationMixin<DataSourceMethodology>;
  removeDataSourceMethodology!: Sequelize.HasManyRemoveAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  removeDataSourceMethodologies!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  hasDataSourceMethodology!: Sequelize.HasManyHasAssociationMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  hasDataSourceMethodologies!: Sequelize.HasManyHasAssociationsMixin<
    DataSourceMethodology,
    DataSourceMethodologyId
  >;
  countDataSourceMethodologies!: Sequelize.HasManyCountAssociationsMixin;

  // EmissionsFactor belongsTo Methodology via methodologyId
  getEmissionsFactors!: Sequelize.HasManyGetAssociationsMixin<EmissionsFactor>;
  addEmissionsFactor!: Sequelize.HasManyAddAssociationMixin<
    EmissionsFactor,
    number
  >;
  hasEmissionsFactor!: Sequelize.HasManyHasAssociationMixin<
    EmissionsFactor,
    number
  >;
  countEmissionsFactors!: Sequelize.HasManyCountAssociationsMixin;
  createEmissionsFactor!: Sequelize.HasManyCreateAssociationMixin<EmissionsFactor>;

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
