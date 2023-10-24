import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { City, CityId } from "./City";

export interface UserAttributes {
  userId: string;
  name?: string;
  pictureUrl?: string;
  isOrganization?: boolean;
  email?: string;
  passwordHash?: string;
  role?: string;
  defaultCityLocode?: string;
  defaultInventoryYear?: number;
  created?: Date;
  lastUpdated?: Date;
  organizationId?: string;
}

export type UserPk = "userId";
export type UserId = User[UserPk];
export type UserOptionalAttributes =
  | "name"
  | "pictureUrl"
  | "isOrganization"
  | "email"
  | "passwordHash"
  | "role"
  | "defaultCityLocode"
  | "defaultInventoryYear"
  | "created"
  | "lastUpdated"
  | "organizationId";
export type UserCreationAttributes = Optional<
  UserAttributes,
  UserOptionalAttributes
>;

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  userId!: string;
  name?: string;
  pictureUrl?: string;
  isOrganization?: boolean;
  email?: string;
  passwordHash?: string;
  role?: string;
  defaultCityLocode?: string;
  defaultInventoryYear?: number;
  created?: Date;
  lastUpdated?: Date;
  organizationId?: string;

  // City BelongsToMany City via CityId
  cities!: City[];
  getCities!: Sequelize.BelongsToManyGetAssociationsMixin<City>;
  setCities!: Sequelize.BelongsToManySetAssociationsMixin<City, CityId>;
  addCity!: Sequelize.BelongsToManyAddAssociationMixin<City, CityId>;
  addCities!: Sequelize.BelongsToManyAddAssociationsMixin<City, CityId>;
  createCity!: Sequelize.BelongsToManyCreateAssociationMixin<City>;
  removeCity!: Sequelize.BelongsToManyRemoveAssociationMixin<
    City,
    CityId
  >;
  removeCities!: Sequelize.BelongsToManyRemoveAssociationsMixin<
    City,
    CityId
  >;
  hasCity!: Sequelize.BelongsToManyHasAssociationMixin<City, CityId>;
  hasCities!: Sequelize.BelongsToManyHasAssociationsMixin<City, CityId>;
  countCities!: Sequelize.BelongsToManyCountAssociationsMixin;
  // User belongsTo User via organizationId
  organization!: User;
  getOrganization!: Sequelize.BelongsToGetAssociationMixin<User>;
  setOrganization!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;
  createOrganization!: Sequelize.BelongsToCreateAssociationMixin<User>;

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
        isOrganization: {
          type: DataTypes.BOOLEAN,
          allowNull: true,
          defaultValue: false,
          field: "is_organization",
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
        defaultCityLocode: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "default_city_locode",
        },
        defaultInventoryYear: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "default_inventory_year",
        },
        organizationId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "User",
            key: "user_id",
          },
          field: "organization_id",
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
