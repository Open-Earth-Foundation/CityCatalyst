import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { City, CityId } from "./City";

export interface ImportMappingFeedbackAttributes {
  id: string;
  cityId: string;
  /**
   * Plain sorted pipe-joined normalised column header string used as a lookup key.
   * e.g. "department|ghg_emissions|protocol|sector|source|year"
   * TEXT column — wide-year files can have 90+ headers.
   */
  headerKey: string;
  /** Which adapter/path processed this file (long-tidy, wide-year, multi-sheet, near-ecrf, ciris, biomatec, ecrf, pdf). */
  adapterType?: string | null;
  /** Original header → ExtractedRow field mapping derived from approved rows. */
  columnMapping: Record<string, string>;
  /** 2–5 representative ExtractedRow objects injected as AI prompt examples. */
  exampleRows: Record<string, unknown>[];
  created?: Date;
  lastUpdated?: Date;
}

export type ImportMappingFeedbackPk = "id";
export type ImportMappingFeedbackId = ImportMappingFeedback[ImportMappingFeedbackPk];
export type ImportMappingFeedbackOptionalAttributes =
  | "adapterType"
  | "created"
  | "lastUpdated";

export type ImportMappingFeedbackCreationAttributes = Optional<
  ImportMappingFeedbackAttributes,
  ImportMappingFeedbackOptionalAttributes
>;

export class ImportMappingFeedback
  extends Model<
    ImportMappingFeedbackAttributes,
    ImportMappingFeedbackCreationAttributes
  >
  implements Partial<ImportMappingFeedbackAttributes>
{
  declare id: string;
  declare cityId: string;
  declare headerKey: string;
  declare adapterType?: string | null;
  declare columnMapping: Record<string, string>;
  declare exampleRows: Record<string, unknown>[];
  declare created?: Date;
  declare lastUpdated?: Date;

  declare city: City;
  declare getCity: Sequelize.BelongsToGetAssociationMixin<City>;
  declare setCity: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  declare createCity: Sequelize.BelongsToCreateAssociationMixin<City>;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof ImportMappingFeedback {
    return ImportMappingFeedback.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "id",
        },
        cityId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "City",
            key: "city_id",
          },
          field: "city_id",
        },
        headerKey: {
          type: DataTypes.TEXT,
          allowNull: false,
          field: "header_key",
        },
        adapterType: {
          type: DataTypes.STRING(64),
          allowNull: true,
          field: "adapter_type",
        },
        columnMapping: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {},
          field: "column_mapping",
        },
        exampleRows: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: [],
          field: "example_rows",
        },
      },
      {
        sequelize,
        tableName: "ImportMappingFeedback",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "idx_import_mapping_feedback_city_header",
            unique: true,
            fields: [{ name: "city_id" }, { name: "header_key" }],
          },
          {
            name: "idx_import_mapping_feedback_city_id",
            unique: false,
            fields: [{ name: "city_id" }],
          },
        ],
      },
    );
  }
}
