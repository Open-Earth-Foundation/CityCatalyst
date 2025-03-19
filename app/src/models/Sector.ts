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
  sectorId!: string;
  sectorName?: string;
  referenceNumber?: string;
  created?: Date;
  lastUpdated?: Date;

  // Sector hasMany DataSource via sectorId
  dataSources!: DataSource[];
  getDataSources!: Sequelize.HasManyGetAssociationsMixin<DataSource>;
  setDataSources!: Sequelize.HasManySetAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  addDataSource!: Sequelize.HasManyAddAssociationMixin<
    DataSource,
    DataSourceId
  >;
  addDataSources!: Sequelize.HasManyAddAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  createDataSource!: Sequelize.HasManyCreateAssociationMixin<DataSource>;
  removeDataSource!: Sequelize.HasManyRemoveAssociationMixin<
    DataSource,
    DataSourceId
  >;
  removeDataSources!: Sequelize.HasManyRemoveAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  hasDataSource!: Sequelize.HasManyHasAssociationMixin<
    DataSource,
    DataSourceId
  >;
  hasDataSources!: Sequelize.HasManyHasAssociationsMixin<
    DataSource,
    DataSourceId
  >;
  countDataSources!: Sequelize.HasManyCountAssociationsMixin;
  // Sector hasMany SubSector via sectorId
  subSectors!: SubSector[];
  getSubSectors!: Sequelize.HasManyGetAssociationsMixin<SubSector>;
  setSubSectors!: Sequelize.HasManySetAssociationsMixin<SubSector, SubSectorId>;
  addSubSector!: Sequelize.HasManyAddAssociationMixin<SubSector, SubSectorId>;
  addSubSectors!: Sequelize.HasManyAddAssociationsMixin<SubSector, SubSectorId>;
  createSubSector!: Sequelize.HasManyCreateAssociationMixin<SubSector>;
  removeSubSector!: Sequelize.HasManyRemoveAssociationMixin<
    SubSector,
    SubSectorId
  >;
  removeSubSectors!: Sequelize.HasManyRemoveAssociationsMixin<
    SubSector,
    SubSectorId
  >;
  hasSubSector!: Sequelize.HasManyHasAssociationMixin<SubSector, SubSectorId>;
  hasSubSectors!: Sequelize.HasManyHasAssociationsMixin<SubSector, SubSectorId>;
  countSubSectors!: Sequelize.HasManyCountAssociationsMixin;

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
