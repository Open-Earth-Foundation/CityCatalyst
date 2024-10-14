import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceId,
} from "./DataSourceI18n";
import type { FormulaInput, FormulaInputId } from "./FormulaInput";

export interface DataSourceFormulaInputAttributes {
  datasourceId: string;
  formulaInputId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type DataSourceFormulaInputPk = "datasourceId" | "formulaInputId";
export type DataSourceFormulaInputId =
  DataSourceFormulaInput[DataSourceFormulaInputPk];
export type DataSourceFormulaInputOptionalAttributes =
  | "created"
  | "lastUpdated";
export type DataSourceFormulaInputCreationAttributes = Optional<
  DataSourceFormulaInputAttributes,
  DataSourceFormulaInputOptionalAttributes
>;

export class DataSourceFormulaInput
  extends Model<
    DataSourceFormulaInputAttributes,
    DataSourceFormulaInputCreationAttributes
  >
  implements DataSourceFormulaInputAttributes
{
  datasourceId!: string;
  formulaInputId!: string;
  created?: Date;
  lastUpdated?: Date;

  // DataSourceFormulaInput belongsTo DataSource via datasourceId
  datasource!: DataSource;
  getDatasource!: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  setDatasource!: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  createDatasource!: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceFormulaInput belongsTo FormulaInput via formulaInputId
  formulaInput!: FormulaInput;
  getFormulaInput!: Sequelize.BelongsToGetAssociationMixin<FormulaInput>;
  setFormulaInput!: Sequelize.BelongsToSetAssociationMixin<
    FormulaInput,
    FormulaInputId
  >;
  createFormulaInput!: Sequelize.BelongsToCreateAssociationMixin<FormulaInput>;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof DataSourceFormulaInput {
    return DataSourceFormulaInput.init(
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
        formulaInputId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "FormulaInput",
            key: "formulainput_id",
          },
          field: "formulainput_id",
        },
      },
      {
        sequelize,
        tableName: "DataSourceFormulaInput",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "DataSourceFormulaInput_pkey",
            unique: true,
            fields: [{ name: "datasource_id" }, { name: "formulainput_id" }],
          },
        ],
      },
    );
  }
}
