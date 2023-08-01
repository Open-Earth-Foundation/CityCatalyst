import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { ReportingLevel, ReportingLevelId } from './ReportingLevel';
import type { SubSector, SubSectorId } from './SubSector';

export interface SubSectorReportingLevelAttributes {
  subsector_id: string;
  reportinglevel_id: string;
  created?: Date;
  last_updated?: Date;
}

export type SubSectorReportingLevelPk = "subsector_id" | "reportinglevel_id";
export type SubSectorReportingLevelId = SubSectorReportingLevel[SubSectorReportingLevelPk];
export type SubSectorReportingLevelOptionalAttributes = "created" | "last_updated";
export type SubSectorReportingLevelCreationAttributes = Optional<SubSectorReportingLevelAttributes, SubSectorReportingLevelOptionalAttributes>;

export class SubSectorReportingLevel extends Model<SubSectorReportingLevelAttributes, SubSectorReportingLevelCreationAttributes> implements SubSectorReportingLevelAttributes {
  subsector_id!: string;
  reportinglevel_id!: string;
  created?: Date;
  last_updated?: Date;

  // SubSectorReportingLevel belongsTo ReportingLevel via reportinglevel_id
  reportinglevel!: ReportingLevel;
  getReportinglevel!: Sequelize.BelongsToGetAssociationMixin<ReportingLevel>;
  setReportinglevel!: Sequelize.BelongsToSetAssociationMixin<ReportingLevel, ReportingLevelId>;
  createReportinglevel!: Sequelize.BelongsToCreateAssociationMixin<ReportingLevel>;
  // SubSectorReportingLevel belongsTo SubSector via subsector_id
  subsector!: SubSector;
  getSubsector!: Sequelize.BelongsToGetAssociationMixin<SubSector>;
  setSubsector!: Sequelize.BelongsToSetAssociationMixin<SubSector, SubSectorId>;
  createSubsector!: Sequelize.BelongsToCreateAssociationMixin<SubSector>;

  static initModel(sequelize: Sequelize.Sequelize): typeof SubSectorReportingLevel {
    return SubSectorReportingLevel.init({
    subsector_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'SubSector',
        key: 'subsector_id'
      }
    },
    reportinglevel_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'ReportingLevel',
        key: 'reportinglevel_id'
      }
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
    tableName: 'SubSectorReportingLevel',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "SubSectorReportingLevel_pkey",
        unique: true,
        fields: [
          { name: "subsector_id" },
          { name: "reportinglevel_id" },
        ]
      },
    ]
  });
  }
}
