import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { Methodology, MethodologyId } from "./Methodology";

export interface FormulaInputAttributes {
  gas: string;
  parameterCode: string;
  parameterName: string;
  gpcRefno: string;
  year?: number;
  formulaInputValue: number;
  formulaInputUnits: string;
  formulaName: string;
  metadata?: Record<string, any>;
  region: string;
  actorId: string;
  datasource: string;
  rnk: number;
  methodologyName: string;
  methodologyId: string;
  formulaInputId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FormulaInputPk = "formulaInputId";
export type FormulaInputId = FormulaInput[FormulaInputPk];
export type FormulaInputOptionalAttributes =
  | "metadata"
  | "createdAt"
  | "updatedAt";
export type FormulaInputCreationAttributes = Optional<
  FormulaInputAttributes,
  FormulaInputOptionalAttributes
>;

export class FormulaInput
  extends Model<FormulaInputAttributes, FormulaInputCreationAttributes>
  implements FormulaInputAttributes
{
  gas!: string;
  parameterCode!: string;
  parameterName!: string;
  gpcRefno!: string;
  year?: number;
  formulaInputValue!: number;
  formulaInputUnits!: string;
  formulaName!: string;
  metadata?: Record<string, any>;
  region!: string;
  actorId!: string;
  datasource!: string;
  rnk!: number;
  methodologyName!: string;
  methodologyId!: string;
  formulaInputId!: string;
  createdAt?: Date;
  updatedAt?: Date;

  /**
   * Define associations here if you have related models.
   * Uncomment and adjust according to your actual models.
   */
  // FormulaInput belongsTo Methodology via methodologyId
  methodology!: Methodology;
  getMethodology!: Sequelize.BelongsToGetAssociationMixin<Methodology>;
  setMethodology!: Sequelize.BelongsToSetAssociationMixin<
    Methodology,
    MethodologyId
  >;
  createMethodology!: Sequelize.BelongsToCreateAssociationMixin<Methodology>;

  static initModel(sequelize: Sequelize.Sequelize): typeof FormulaInput {
    return FormulaInput.init(
      {
        gas: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        parameterCode: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "parameter_code",
        },
        parameterName: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "parameter_name",
        },
        methodologyName: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "methodology_name",
        },
        methodologyId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Methodology",
            key: "methodology_id",
          },
          field: "methodology_id",
        },
        gpcRefno: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "gpc_refno",
        },
        year: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        formulaInputValue: {
          type: DataTypes.FLOAT,
          allowNull: false,
          field: "formula_input_value",
        },
        formulaInputUnits: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "formula_input_units",
        },
        formulaName: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "formula_name",
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        region: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "region",
        },
        actorId: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "actor_id",
        },
        datasource: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        rnk: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "rnk",
        },
        formulaInputId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "formulainput_id",
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "created_at",
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "updated_at",
        },
      },
      {
        sequelize,
        tableName: "FormulaInput",
        schema: "public",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        indexes: [
          {
            name: "FormulaInput_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
}
