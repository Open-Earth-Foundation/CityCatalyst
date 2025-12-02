import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type {
  DataSourceI18n as DataSource,
  DataSourceI18n as DataSourceId,
} from "./DataSourceI18n";
import type { SubSector, SubSectorId } from "./SubSector";

export interface SectorAttributes {
  sectorId: string;
  sectorName?: string;
  referenceNumber?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SectorPk = "sectorId";
export type SectorId = Sector[SectorPk];
export type SectorOptionalAttributes =
  | "sectorName"
  | "referenceNumber"
  | "created"
  | "lastUpdated";
export type SectorCreationAttributes = Optional<
  SectorAttributes,
  SectorOptionalAttributes
>;

export class Sector
  extends Model<SectorAttributes, SectorCreationAttributes>
  implements Partial<SectorAttributes>
{
  declare sectorId: string;
  declare sectorName?: string;
  declare referenceNumber?: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // Sector hasMany DataSource via sectorId
  declare dataSources: DataSource[];
  declare getDataSources: Sequelize.HasManyGetAssociationsMixin<DataSource>;
  declare setDataSources: Sequelize.HasManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare addDataSource: Sequelize.HasManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare addDataSources: Sequelize.HasManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare createDataSource: Sequelize.HasManyCreateAssociationMixin<DataSource>;
  declare removeDataSource: Sequelize.HasManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare removeDataSources: Sequelize.HasManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDataSource: Sequelize.HasManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  declare hasDataSources: Sequelize.HasManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  declare countDataSources: Sequelize.HasManyCountAssociationsMixin;
  // Sector hasMany SubSector via sectorId
  declare subSectors: SubSector[];
  declare getSubSectors: Sequelize.HasManyGetAssociationsMixin<SubSector>;
  declare setSubSectors: Sequelize.HasManySetAssociationsMixin<SubSector, SubSectorId>;
  declare addSubSector: Sequelize.HasManyAddAssociationMixin<SubSector, SubSectorId>;
  declare addSubSectors: Sequelize.HasManyAddAssociationsMixin<SubSector, SubSectorId>;
  declare createSubSector: Sequelize.HasManyCreateAssociationMixin<SubSector>;
  declare removeSubSector: Sequelize.HasManyRemoveAssociationMixin<
    SubSector,
    SubSectorId
  >;
  declare removeSubSectors: Sequelize.HasManyRemoveAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  declare hasSubSector: Sequelize.HasManyHasAssociationMixin<SubSector, SubSectorId>;
  declare hasSubSectors: Sequelize.HasManyHasAssociationsMixin<SubSector, SubSectorId>;
  declare countSubSectors: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof Sector {
    return Sector.init(
      {
        sectorId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "sector_id",
        },
        sectorName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "sector_name",
        },
        referenceNumber: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "reference_number",
        },
      },
      {
        sequelize,
        tableName: "Sector",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "Sector_pkey",
            unique: true,
            fields: [{ name: "sector_id" }],
          },
        ],
      },
    );
  }
}
