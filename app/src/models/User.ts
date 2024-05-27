import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { CityInvite, CityInviteId } from "./CityInvite";
import type { CityUser, CityUserId } from "./CityUser";
import type { Inventory, InventoryId } from "./Inventory";
import type { UserFile, UserFileId } from "./UserFile";
import { City, CityId } from "./City";

export interface UserAttributes {
  userId: string;
  name?: string;
  pictureUrl?: string;
  email?: string;
  passwordHash?: string;
  role?: string;
  created?: Date;
  lastUpdated?: Date;
  defaultInventoryId?: string;
}

export type UserPk = "userId";
export type UserId = User[UserPk];
export type UserOptionalAttributes =
  | "name"
  | "pictureUrl"
  | "email"
  | "passwordHash"
  | "role"
  | "created"
  | "lastUpdated"
  | "defaultInventoryId";
export type UserCreationAttributes = Optional<
  UserAttributes,
  UserOptionalAttributes
>;

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes {
  userId!: string;
  name?: string;
  pictureUrl?: string;
  email?: string;
  passwordHash?: string;
  role?: string;
  created?: Date;
  lastUpdated?: Date;
  defaultInventoryId?: string;

  // User belongsTo Inventory via defaultInventoryId
  defaultInventory!: Inventory;
  getDefaultInventory!: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  setDefaultInventory!: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;
  createDefaultInventory!: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  // User hasMany CityInvite via invitingUserId
  cityInvites!: CityInvite[];
  getCityInvites!: Sequelize.HasManyGetAssociationsMixin<CityInvite>;
  setCityInvites!: Sequelize.HasManySetAssociationsMixin<
    CityInvite,
    CityInviteId
  >;
  addCityInvite!: Sequelize.HasManyAddAssociationMixin<
    CityInvite,
    CityInviteId
  >;
  addCityInvites!: Sequelize.HasManyAddAssociationsMixin<
    CityInvite,
    CityInviteId
  >;
  createCityInvite!: Sequelize.HasManyCreateAssociationMixin<CityInvite>;
  removeCityInvite!: Sequelize.HasManyRemoveAssociationMixin<
    CityInvite,
    CityInviteId
  >;
  removeCityInvites!: Sequelize.HasManyRemoveAssociationsMixin<
    CityInvite,
    CityInviteId
  >;
  hasCityInvite!: Sequelize.HasManyHasAssociationMixin<
    CityInvite,
    CityInviteId
  >;
  hasCityInvites!: Sequelize.HasManyHasAssociationsMixin<
    CityInvite,
    CityInviteId
  >;
  countCityInvites!: Sequelize.HasManyCountAssociationsMixin;
  // User hasMany CityUser via userId
  cityUsers!: CityUser[];
  getCityUsers!: Sequelize.HasManyGetAssociationsMixin<CityUser>;
  setCityUsers!: Sequelize.HasManySetAssociationsMixin<CityUser, CityUserId>;
  addCityUser!: Sequelize.HasManyAddAssociationMixin<CityUser, CityUserId>;
  addCityUsers!: Sequelize.HasManyAddAssociationsMixin<CityUser, CityUserId>;
  createCityUser!: Sequelize.HasManyCreateAssociationMixin<CityUser>;
  removeCityUser!: Sequelize.HasManyRemoveAssociationMixin<
    CityUser,
    CityUserId
  >;
  removeCityUsers!: Sequelize.HasManyRemoveAssociationsMixin<
    CityUser,
    CityUserId
  >;
  hasCityUser!: Sequelize.HasManyHasAssociationMixin<CityUser, CityUserId>;
  hasCityUsers!: Sequelize.HasManyHasAssociationsMixin<CityUser, CityUserId>;
  countCityUsers!: Sequelize.HasManyCountAssociationsMixin;
  // User hasMany UserFile via userId
  userFiles!: UserFile[];
  getUserFiles!: Sequelize.HasManyGetAssociationsMixin<UserFile>;
  setUserFiles!: Sequelize.HasManySetAssociationsMixin<UserFile, UserFileId>;
  addUserFile!: Sequelize.HasManyAddAssociationMixin<UserFile, UserFileId>;
  addUserFiles!: Sequelize.HasManyAddAssociationsMixin<UserFile, UserFileId>;
  createUserFile!: Sequelize.HasManyCreateAssociationMixin<UserFile>;
  removeUserFile!: Sequelize.HasManyRemoveAssociationMixin<
    UserFile,
    UserFileId
  >;
  removeUserFiles!: Sequelize.HasManyRemoveAssociationsMixin<
    UserFile,
    UserFileId
  >;
  hasUserFile!: Sequelize.HasManyHasAssociationMixin<UserFile, UserFileId>;
  hasUserFiles!: Sequelize.HasManyHasAssociationsMixin<UserFile, UserFileId>;
  countUserFiles!: Sequelize.HasManyCountAssociationsMixin;
  // User hasMany City via userId
  cities!: City[];
  getCities!: Sequelize.HasManyGetAssociationsMixin<City>;
  setCities!: Sequelize.HasManySetAssociationsMixin<City, CityId>;
  addCity!: Sequelize.HasManyAddAssociationMixin<City, CityId>;
  addCities!: Sequelize.HasManyAddAssociationsMixin<City, CityId>;
  createCity!: Sequelize.HasManyCreateAssociationMixin<City>;
  removeCity!: Sequelize.HasManyRemoveAssociationMixin<
    City,
    CityId
  >;
  removeCities!: Sequelize.HasManyRemoveAssociationsMixin<
    City,
    CityId
  >;
  hasCity!: Sequelize.HasManyHasAssociationMixin<City, CityId>;
  hasCities!: Sequelize.HasManyHasAssociationsMixin<City, CityId>;
  countCities!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof User {
    return User.init(
      {
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "user_id",
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        pictureUrl: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "picture_url",
        },
        email: {
          type: DataTypes.STRING(255),
          allowNull: true,
          unique: "User_email_key",
        },
        passwordHash: {
          type: DataTypes.CHAR(60),
          allowNull: true,
          field: "password_hash",
        },
        role: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        defaultInventoryId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "Inventory",
            key: "inventory_id",
          },
          field: "default_inventory_id",
        },
      },
      {
        sequelize,
        tableName: "User",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "User_email_key",
            unique: true,
            fields: [{ name: "email" }],
          },
          {
            name: "User_pkey",
            unique: true,
            fields: [{ name: "user_id" }],
          },
        ],
      },
    );
  }
}
