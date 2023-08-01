import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';
import type { DataSourceEmissionsFactor, DataSourceEmissionsFactorId } from './DataSourceEmissionsFactor';
import type { SubCategoryValue, SubCategoryValueId } from './SubCategoryValue';
import type { SubSectorValue, SubSectorValueId } from './SubSectorValue';

export interface EmissionsFactorAttributes {
  emissions_factor_id: string;
  emissions_factor?: number;
  emissions_factor_url?: string;
  units?: string;
  created?: Date;
  last_updated?: Date;
}

export type EmissionsFactorPk = "emissions_factor_id";
export type EmissionsFactorId = EmissionsFactor[EmissionsFactorPk];
export type EmissionsFactorOptionalAttributes = "emissions_factor" | "emissions_factor_url" | "units" | "created" | "last_updated";
export type EmissionsFactorCreationAttributes = Optional<EmissionsFactorAttributes, EmissionsFactorOptionalAttributes>;

export class EmissionsFactor extends Model<EmissionsFactorAttributes, EmissionsFactorCreationAttributes> implements EmissionsFactorAttributes {
  emissions_factor_id!: string;
  emissions_factor?: number;
  emissions_factor_url?: string;
  units?: string;
  created?: Date;
  last_updated?: Date;

  // EmissionsFactor belongsToMany DataSource via emissions_factor_id and datasource_id
  datasource_id_DataSource_DataSourceEmissionsFactors!: DataSource[];
  getDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManyGetAssociationsMixin<DataSource>;
  setDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManySetAssociationsMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceEmissionsFactor!: Sequelize.BelongsToManyAddAssociationMixin<DataSource, DataSourceId>;
  addDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDatasource_id_DataSource_DataSourceEmissionsFactor!: Sequelize.BelongsToManyCreateAssociationMixin<DataSource>;
  removeDatasource_id_DataSource_DataSourceEmissionsFactor!: Sequelize.BelongsToManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceEmissionsFactor!: Sequelize.BelongsToManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDatasource_id_DataSource_DataSourceEmissionsFactors!: Sequelize.BelongsToManyCountAssociationsMixin;
  // EmissionsFactor hasMany DataSourceEmissionsFactor via emissions_factor_id
  DataSourceEmissionsFactors!: DataSourceEmissionsFactor[];
  getDataSourceEmissionsFactors!: Sequelize.HasManyGetAssociationsMixin<DataSourceEmissionsFactor>;
  setDataSourceEmissionsFactors!: Sequelize.HasManySetAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  addDataSourceEmissionsFactor!: Sequelize.HasManyAddAssociationMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  addDataSourceEmissionsFactors!: Sequelize.HasManyAddAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  createDataSourceEmissionsFactor!: Sequelize.HasManyCreateAssociationMixin<DataSourceEmissionsFactor>;
  removeDataSourceEmissionsFactor!: Sequelize.HasManyRemoveAssociationMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  removeDataSourceEmissionsFactors!: Sequelize.HasManyRemoveAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  hasDataSourceEmissionsFactor!: Sequelize.HasManyHasAssociationMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  hasDataSourceEmissionsFactors!: Sequelize.HasManyHasAssociationsMixin<DataSourceEmissionsFactor, DataSourceEmissionsFactorId>;
  countDataSourceEmissionsFactors!: Sequelize.HasManyCountAssociationsMixin;
  // EmissionsFactor hasMany SubCategoryValue via emissions_factor_id
  SubCategoryValues!: SubCategoryValue[];
  getSubCategoryValues!: Sequelize.HasManyGetAssociationsMixin<SubCategoryValue>;
  setSubCategoryValues!: Sequelize.HasManySetAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  addSubCategoryValue!: Sequelize.HasManyAddAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  addSubCategoryValues!: Sequelize.HasManyAddAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  createSubCategoryValue!: Sequelize.HasManyCreateAssociationMixin<SubCategoryValue>;
  removeSubCategoryValue!: Sequelize.HasManyRemoveAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  removeSubCategoryValues!: Sequelize.HasManyRemoveAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  hasSubCategoryValue!: Sequelize.HasManyHasAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  hasSubCategoryValues!: Sequelize.HasManyHasAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  countSubCategoryValues!: Sequelize.HasManyCountAssociationsMixin;
  // EmissionsFactor hasMany SubSectorValue via emissions_factor_id
  SubSectorValues!: SubSectorValue[];
  getSubSectorValues!: Sequelize.HasManyGetAssociationsMixin<SubSectorValue>;
  setSubSectorValues!: Sequelize.HasManySetAssociationsMixin<SubSectorValue, SubSectorValueId>;
  addSubSectorValue!: Sequelize.HasManyAddAssociationMixin<SubSectorValue, SubSectorValueId>;
  addSubSectorValues!: Sequelize.HasManyAddAssociationsMixin<SubSectorValue, SubSectorValueId>;
  createSubSectorValue!: Sequelize.HasManyCreateAssociationMixin<SubSectorValue>;
  removeSubSectorValue!: Sequelize.HasManyRemoveAssociationMixin<SubSectorValue, SubSectorValueId>;
  removeSubSectorValues!: Sequelize.HasManyRemoveAssociationsMixin<SubSectorValue, SubSectorValueId>;
  hasSubSectorValue!: Sequelize.HasManyHasAssociationMixin<SubSectorValue, SubSectorValueId>;
  hasSubSectorValues!: Sequelize.HasManyHasAssociationsMixin<SubSectorValue, SubSectorValueId>;
  countSubSectorValues!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof EmissionsFactor {
    return EmissionsFactor.init({
    emissions_factor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    emissions_factor: {
      type: DataTypes.DECIMAL,
      allowNull: true
    },
    emissions_factor_url: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    units: {
      type: DataTypes.STRING(255),
      allowNull: true
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
    tableName: 'EmissionsFactor',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "EmissionsFactor_pkey",
        unique: true,
        fields: [
          { name: "emissions_factor_id" },
        ]
      },
    ]
  });
  }
}
