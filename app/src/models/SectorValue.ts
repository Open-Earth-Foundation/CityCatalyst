import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { Inventory, InventoryId } from "./Inventory";
import type { Sector, SectorId } from "./Sector";
import type { SubCategoryValue, SubCategoryValueId } from "./SubCategoryValue";
import type { SubSectorValue, SubSectorValueId } from "./SubSectorValue";

export interface SectorValueAttributes {
  sectorValueId: string;
  totalEmissions?: number;
  sectorId?: string;
  inventoryId?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type SectorValuePk = "sectorValueId";
export type SectorValueId = SectorValue[SectorValuePk];
export type SectorValueOptionalAttributes =
  | "totalEmissions"
  | "sectorId"
  | "inventoryId"
  | "created"
  | "lastUpdated";
export type SectorValueCreationAttributes = Optional<
  SectorValueAttributes,
  SectorValueOptionalAttributes
>;

export class SectorValue
  extends Model<SectorValueAttributes, SectorValueCreationAttributes>
  implements SectorValueAttributes
{
  sectorValueId!: string;
  totalEmissions?: number;
  sectorId?: string;
  inventoryId?: string;
  created?: Date;
  lastUpdated?: Date;

  // SectorValue belongsTo Inventory via inventoryId
  inventory!: Inventory;
  getInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setInventory!: Sequelize.BelongsToSetAssociationMixin<Inventory, InventoryId>;
  createInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  // SectorValue belongsTo Sector via sectorId
  sector!: Sector;
  getSector!: Sequelize.BelongsToGetAssociationMixin<Sector>;
  setSector!: Sequelize.BelongsToSetAssociationMixin<Sector, SectorId>;
  createSector!: Sequelize.BelongsToCreateAssociationMixin<Sector>;
  // SectorValue hasMany SubCategoryValue via sectorValueId
  subCategoryValues!: SubCategoryValue[];
  getSubCategoryValues!: Sequelize.HasManyGetAssociationsMixin<SubCategoryValue>;
  setSubCategoryValues!: Sequelize.HasManySetAssociationsMixin<
    SubCategoryValue,
    SubCategoryValueId
  >;
  addSubCategoryValue!: Sequelize.HasManyAddAssociationMixin<
    SubCategoryValue,
    SubCategoryValueId
  >;
  addSubCategoryValues!: Sequelize.HasManyAddAssociationsMixin<
    SubCategoryValue,
    SubCategoryValueId
  >;
  createSubCategoryValue!: Sequelize.HasManyCreateAssociationMixin<SubCategoryValue>;
  removeSubCategoryValue!: Sequelize.HasManyRemoveAssociationMixin<
    SubCategoryValue,
    SubCategoryValueId
  >;
  removeSubCategoryValues!: Sequelize.HasManyRemoveAssociationsMixin<
    SubCategoryValue,
    SubCategoryValueId
  >;
  hasSubCategoryValue!: Sequelize.HasManyHasAssociationMixin<
    SubCategoryValue,
    SubCategoryValueId
  >;
  hasSubCategoryValues!: Sequelize.HasManyHasAssociationsMixin<
    SubCategoryValue,
    SubCategoryValueId
  >;
  countSubCategoryValues!: Sequelize.HasManyCountAssociationsMixin;
  // SectorValue hasMany SubSectorValue via sectorValueId
  subSectorValues!: SubSectorValue[];
  getSubSectorValues!: Sequelize.HasManyGetAssociationsMixin<SubSectorValue>;
  setSubSectorValues!: Sequelize.HasManySetAssociationsMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  addSubSectorValue!: Sequelize.HasManyAddAssociationMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  addSubSectorValues!: Sequelize.HasManyAddAssociationsMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  createSubSectorValue!: Sequelize.HasManyCreateAssociationMixin<SubSectorValue>;
  removeSubSectorValue!: Sequelize.HasManyRemoveAssociationMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  removeSubSectorValues!: Sequelize.HasManyRemoveAssociationsMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  hasSubSectorValue!: Sequelize.HasManyHasAssociationMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  hasSubSectorValues!: Sequelize.HasManyHasAssociationsMixin<
    SubSectorValue,
    SubSectorValueId
  >;
  countSubSectorValues!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof SectorValue {
    return SectorValue.init(
      {
        sectorValueId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "sector_value_id",
        },
        totalEmissions: {
          type: DataTypes.DECIMAL,
          allowNull: true,
          field: "total_emissions",
        },
        sectorId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Sector",
            key: "sector_id",
          },
          field: "sector_id",
        },
        inventoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Inventory",
            key: "inventory_id",
          },
          field: "inventory_id",
        },
      },
      {
        sequelize,
        tableName: "SectorValue",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "SectorValue_pkey",
            unique: true,
            fields: [{ name: "sector_value_id" }],
          },
        ],
      },
    );
  }
}
