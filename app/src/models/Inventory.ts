import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { City, CityId } from './City';
import type { SectorValue, SectorValueId } from './SectorValue';
import type { SubCategoryValue, SubCategoryValueId } from './SubCategoryValue';
import type { SubSectorValue, SubSectorValueId } from './SubSectorValue';
import type { Version, VersionId } from './Version';

export interface InventoryAttributes {
  inventoryId: string;
  inventoryName?: string;
  year?: number;
  totalEmissions?: number;
  cityId?: string;
}

export type InventoryPk = "inventoryId";
export type InventoryId = Inventory[InventoryPk];
export type InventoryOptionalAttributes = "inventoryName" | "year" | "totalEmissions" | "cityId";
export type InventoryCreationAttributes = Optional<InventoryAttributes, InventoryOptionalAttributes>;

export class Inventory extends Model<InventoryAttributes, InventoryCreationAttributes> implements InventoryAttributes {
  inventoryId!: string;
  inventoryName?: string;
  year?: number;
  totalEmissions?: number;
  cityId?: string;

  // Inventory belongsTo City via cityId
  city!: City;
  getCity!: Sequelize.BelongsToGetAssociationMixin<City>;
  setCity!: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  createCity!: Sequelize.BelongsToCreateAssociationMixin<City>;
  // Inventory hasMany SectorValue via inventoryId
  sectorValues!: SectorValue[];
  getSectorValues!: Sequelize.HasManyGetAssociationsMixin<SectorValue>;
  setSectorValues!: Sequelize.HasManySetAssociationsMixin<SectorValue, SectorValueId>;
  addSectorValue!: Sequelize.HasManyAddAssociationMixin<SectorValue, SectorValueId>;
  addSectorValues!: Sequelize.HasManyAddAssociationsMixin<SectorValue, SectorValueId>;
  createSectorValue!: Sequelize.HasManyCreateAssociationMixin<SectorValue>;
  removeSectorValue!: Sequelize.HasManyRemoveAssociationMixin<SectorValue, SectorValueId>;
  removeSectorValues!: Sequelize.HasManyRemoveAssociationsMixin<SectorValue, SectorValueId>;
  hasSectorValue!: Sequelize.HasManyHasAssociationMixin<SectorValue, SectorValueId>;
  hasSectorValues!: Sequelize.HasManyHasAssociationsMixin<SectorValue, SectorValueId>;
  countSectorValues!: Sequelize.HasManyCountAssociationsMixin;
  // Inventory hasMany SubCategoryValue via inventoryId
  subCategoryValues!: SubCategoryValue[];
  getSubCategoryValues!: Sequelize.HasManyGetAssociationsMixin<SubCategoryValue>;
  setSubCategoryValues!: Sequelize.HasManySetAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  addSubCategoryValue!: Sequelize.HasManyAddAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  addSubCategoryValues!: Sequelize.HasManyAddAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  createSubCategoryValue!: Sequelize.HasManyCreateAssociationMixin<SubCategoryValue>;
  removeSubCategoryValue!: Sequelize.HasManyRemoveAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  removeSubCategoryValues!: Sequelize.HasManyRemoveAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  hasSubCategoryValue!: Sequelize.HasManyHasAssociationMixin<SubCategoryValue, SubCategoryValueId>;
  hasSubCategoryValues!: Sequelize.HasManyHasAssociationsMixin<SubCategoryValue, SubCategoryValueId>;
  countSubCategoryValues!: Sequelize.HasManyCountAssociationsMixin;
  // Inventory hasMany SubSectorValue via inventoryId
  subSectorValues!: SubSectorValue[];
  getSubSectorValues!: Sequelize.HasManyGetAssociationsMixin<SubSectorValue>;
  setSubSectorValues!: Sequelize.HasManySetAssociationsMixin<SubSectorValue, SubSectorValueId>;
  addSubSectorValue!: Sequelize.HasManyAddAssociationMixin<SubSectorValue, SubSectorValueId>;
  addSubSectorValues!: Sequelize.HasManyAddAssociationsMixin<SubSectorValue, SubSectorValueId>;
  createSubSectorValue!: Sequelize.HasManyCreateAssociationMixin<SubSectorValue>;
  removeSubSectorValue!: Sequelize.HasManyRemoveAssociationMixin<SubSectorValue, SubSectorValueId>;
  removeSubSectorValues!: Sequelize.HasManyRemoveAssociationsMixin<SubSectorValue, SubSectorValueId>;
  hasSubSectorValue!: Sequelize.HasManyHasAssociationMixin<SubSectorValue, SubSectorValueId>;
  hasSubSectorValues!: Sequelize.HasManyHasAssociationsMixin<SubSectorValue, SubSectorValueId>;
  countSubSectorValues!: Sequelize.HasManyCountAssociationsMixin;
  // Inventory hasMany Version via inventoryId
  versions!: Version[];
  getVersions!: Sequelize.HasManyGetAssociationsMixin<Version>;
  setVersions!: Sequelize.HasManySetAssociationsMixin<Version, VersionId>;
  addVersion!: Sequelize.HasManyAddAssociationMixin<Version, VersionId>;
  addVersions!: Sequelize.HasManyAddAssociationsMixin<Version, VersionId>;
  createVersion!: Sequelize.HasManyCreateAssociationMixin<Version>;
  removeVersion!: Sequelize.HasManyRemoveAssociationMixin<Version, VersionId>;
  removeVersions!: Sequelize.HasManyRemoveAssociationsMixin<Version, VersionId>;
  hasVersion!: Sequelize.HasManyHasAssociationMixin<Version, VersionId>;
  hasVersions!: Sequelize.HasManyHasAssociationsMixin<Version, VersionId>;
  countVersions!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof Inventory {
    return Inventory.init({
    inventoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'inventory_id'
    },
    inventoryName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'inventory_name'
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    totalEmissions: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'total_emissions'
    },
    cityId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'City',
        key: 'city_id'
      },
      field: 'city_id'
    }
  }, {
    sequelize,
    tableName: 'Inventory',
    schema: 'public',
    timestamps: false,
    createdAt: 'created',
    updatedAt: 'last_updated',
    indexes: [
      {
        name: "Inventory_pkey",
        unique: true,
        fields: [
          { name: "inventory_id" },
        ]
      },
    ]
  });
  }
}
