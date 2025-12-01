import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { CityInvite, CityInviteId } from "./CityInvite";
import type { CityUser, CityUserId } from "./CityUser";
import type { Inventory, InventoryId } from "./Inventory";
import type { UserFile, UserFileId } from "./UserFile";
import { City, CityId } from "./City";

import { LANGUAGES, Roles } from "@/util/types";

export interface UserAttributes {
  userId: string;
  name?: string;
  pictureUrl?: string;
  email?: string;
  passwordHash?: string;
  role?: Roles;
  created?: Date;
  lastUpdated?: Date;
  defaultInventoryId?: string | null;
  // Professional title or position of the user within their organization
  title?: string;
  // User's preferred language for emails and UI
  preferredLanguage?: string;
  defaultCityId?: string | null;
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
  | "defaultInventoryId"
  | "title"
  | "preferredLanguage"
  | "defaultCityId";
export type UserCreationAttributes = Optional<
  UserAttributes,
  UserOptionalAttributes
>;

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements Partial<UserAttributes>
{
  declare userId: string;
  declare name?: string;
  declare pictureUrl?: string;
  declare email?: string;
  declare passwordHash?: string;
  declare role?: Roles;
  declare created?: Date;
  declare lastUpdated?: Date;
  declare defaultInventoryId?: string;
  declare title?: string;
  declare preferredLanguage?: LANGUAGES;
  declare defaultCityId?: string | null;

  // User belongsTo Inventory via defaultInventoryId
  declare defaultInventory: Inventory;
  declare getDefaultInventory: Sequelize.BelongsToGetAssociationMixin<Inventory>;
  declare setDefaultInventory: Sequelize.BelongsToSetAssociationMixin<
    Inventory,
    InventoryId
  >;
  declare createDefaultInventory: Sequelize.BelongsToCreateAssociationMixin<Inventory>;
  // User hasMany CityInvite via invitingUserId
  declare cityInvites: CityInvite[];
  declare getCityInvites: Sequelize.HasManyGetAssociationsMixin<CityInvite>;
  declare setCityInvites: Sequelize.HasManySetAssociationsMixin<
    CityInvite,
    CityInviteId
  >;
  declare addCityInvite: Sequelize.HasManyAddAssociationMixin<
    CityInvite,
    CityInviteId
  >;
  declare addCityInvites: Sequelize.HasManyAddAssociationsMixin<
    CityInvite,
    CityInviteId
  >;
  declare createCityInvite: Sequelize.HasManyCreateAssociationMixin<CityInvite>;
  declare removeCityInvite: Sequelize.HasManyRemoveAssociationMixin<
    CityInvite,
    CityInviteId
  >;
  declare removeCityInvites: Sequelize.HasManyRemoveAssociationsMixin<
    CityInvite,
    CityInviteId
  >;
  declare hasCityInvite: Sequelize.HasManyHasAssociationMixin<
    CityInvite,
    CityInviteId
  >;
  declare hasCityInvites: Sequelize.HasManyHasAssociationsMixin<
    CityInvite,
    CityInviteId
  >;
  declare countCityInvites: Sequelize.HasManyCountAssociationsMixin;
  // User hasMany CityUser via userId
  declare cityUsers: CityUser[];
  declare getCityUsers: Sequelize.HasManyGetAssociationsMixin<CityUser>;
  declare setCityUsers: Sequelize.HasManySetAssociationsMixin<CityUser, CityUserId>;
  declare addCityUser: Sequelize.HasManyAddAssociationMixin<CityUser, CityUserId>;
  declare addCityUsers: Sequelize.HasManyAddAssociationsMixin<CityUser, CityUserId>;
  declare createCityUser: Sequelize.HasManyCreateAssociationMixin<CityUser>;
  declare removeCityUser: Sequelize.HasManyRemoveAssociationMixin<
    CityUser,
    CityUserId
  >;
  declare removeCityUsers: Sequelize.HasManyRemoveAssociationsMixin<
    CityUser,
    CityUserId
  >;
  declare hasCityUser: Sequelize.HasManyHasAssociationMixin<CityUser, CityUserId>;
  declare hasCityUsers: Sequelize.HasManyHasAssociationsMixin<CityUser, CityUserId>;
  declare countCityUsers: Sequelize.HasManyCountAssociationsMixin;
  // User hasMany UserFile via userId
  declare userFiles: UserFile[];
  declare getUserFiles: Sequelize.HasManyGetAssociationsMixin<UserFile>;
  declare setUserFiles: Sequelize.HasManySetAssociationsMixin<UserFile, UserFileId>;
  declare addUserFile: Sequelize.HasManyAddAssociationMixin<UserFile, UserFileId>;
  declare addUserFiles: Sequelize.HasManyAddAssociationsMixin<UserFile, UserFileId>;
  declare createUserFile: Sequelize.HasManyCreateAssociationMixin<UserFile>;
  declare removeUserFile: Sequelize.HasManyRemoveAssociationMixin<
    UserFile,
    UserFileId
  >;
  declare removeUserFiles: Sequelize.HasManyRemoveAssociationsMixin<
    UserFile,
    UserFileId
  >;
  declare hasUserFile: Sequelize.HasManyHasAssociationMixin<UserFile, UserFileId>;
  declare hasUserFiles: Sequelize.HasManyHasAssociationsMixin<UserFile, UserFileId>;
  declare countUserFiles: Sequelize.HasManyCountAssociationsMixin;
  // User hasMany City via userId
  declare cities: City[];
  declare getCities: Sequelize.HasManyGetAssociationsMixin<City>;
  declare setCities: Sequelize.HasManySetAssociationsMixin<City, CityId>;
  declare addCity: Sequelize.HasManyAddAssociationMixin<City, CityId>;
  declare addCities: Sequelize.HasManyAddAssociationsMixin<City, CityId>;
  declare createCity: Sequelize.HasManyCreateAssociationMixin<City>;
  declare removeCity: Sequelize.HasManyRemoveAssociationMixin<City, CityId>;
  declare removeCities: Sequelize.HasManyRemoveAssociationsMixin<City, CityId>;
  declare hasCity: Sequelize.HasManyHasAssociationMixin<City, CityId>;
  declare hasCities: Sequelize.HasManyHasAssociationsMixin<City, CityId>;
  declare countCities: Sequelize.HasManyCountAssociationsMixin;

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
        title: {
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
        preferredLanguage: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "preferred_language",
        },
        defaultCityId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "City",
            key: "city_id",
          },
          onDelete: "SET NULL",
          onUpdate: "CASCADE",
          field: "default_city_id",
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
