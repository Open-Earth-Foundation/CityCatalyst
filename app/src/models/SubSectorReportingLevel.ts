import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { ReportingLevel, ReportingLevelId } from "./ReportingLevel";
import type { SubSector, SubSectorId } from "./SubSector";

export interface SubSectorReportingLevelAttributes {
  subsectorId: string;
  reportinglevelId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SubSectorReportingLevelPk = "subsectorId" | "reportinglevelId";
export type SubSectorReportingLevelId =
  SubSectorReportingLevel[SubSectorReportingLevelPk];
export type SubSectorReportingLevelOptionalAttributes =
  | "created"
  | "lastUpdated";
export type SubSectorReportingLevelCreationAttributes = Optional<
  SubSectorReportingLevelAttributes,
  SubSectorReportingLevelOptionalAttributes
>;

export class SubSectorReportingLevel
  extends Model<
    SubSectorReportingLevelAttributes,
    SubSectorReportingLevelCreationAttributes
  >
  implements Partial<SubSectorReportingLevelAttributes>
{
  subsectorId!: string;
  reportinglevelId!: string;
  created?: Date;
  lastUpdated?: Date;

  // SubSectorReportingLevel belongsTo ReportingLevel via reportinglevelId
  reportinglevel!: ReportingLevel;
  getReportinglevel!: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  setReportinglevel!: Sequelize.BelongsToSetAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  createReportinglevel!: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;
  // SubSectorReportingLevel belongsTo SubSector via subsectorId
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(
    sequelize: Sequelize.Sequelize,
  ): typeof SubSectorReportingLevel {
    return SubSectorReportingLevel.init(
      {
        subsectorId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: "SubSector",
            key: "subsector_id",
          },
          field: "subsector_id",
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
        tableName: "SubSectorReportingLevel",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "SubSectorReportingLevel_pkey",
            unique: true,
            fields: [{ name: "subsector_id" }, { name: "reportinglevel_id" }],
          },
        ],
      },
    );
  }
}
