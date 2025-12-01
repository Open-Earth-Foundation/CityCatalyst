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
  implements Partial<DataSourceFormulaInputAttributes>
{
  declare datasourceId: string;
  declare formulaInputId: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // DataSourceFormulaInput belongsTo DataSource via datasourceId
  declare datasource: DataSource;
  declare getDatasource: Sequelize.BelongsToGetAssociationMixin<DataSource>;
  declare setDatasource: Sequelize.BelongsToSetAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare createDatasource: Sequelize.BelongsToCreateAssociationMixin<DataSource>;
  // DataSourceFormulaInput belongsTo FormulaInput via formulaInputId
  declare formulaInput: FormulaInput;
  declare getFormulaInput: Sequelize.BelongsToGetAssociationMixin<FormulaInput>;
  declare setFormulaInput: Sequelize.BelongsToSetAssociationMixin<
    FormulaInput,
    FormulaInputId
  >;
  declare createFormulaInput: Sequelize.BelongsToCreateAssociationMixin<FormulaInput>;

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
        timestamps: false,
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
