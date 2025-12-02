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
  declare subsectorId: string;
  declare reportinglevelId: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // SubSectorReportingLevel belongsTo ReportingLevel via reportinglevelId
  declare reportinglevel: ReportingLevel;
  declare getReportinglevel: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  declare setReportinglevel: Sequelize.BelongsToSetAssociationMixin<
    ReportingLevel,
    ReportingLevelId
  >;
  declare createReportinglevel: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;
  // SubSectorReportingLevel belongsTo SubSector via subsectorId
  declare subsector: SubSector;
  declare getSubsector: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  declare setSubsector: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  declare createSubsector: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

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
