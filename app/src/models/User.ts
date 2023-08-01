import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { CityUser, CityUserId } from './CityUser';

export interface UserAttributes {
  userId: string;
  name?: string;
  pictureUrl?: string;
  isOrganization?: boolean;
  email?: string;
  passwordHash?: string;
  role?: string;
  created?: Date;
  lastUpdated?: Date;
  organizationId?: string;
}

export type UserPk = "userId";
export type UserId = User[UserPk];
export type UserOptionalAttributes = "name" | "pictureUrl" | "isOrganization" | "email" | "passwordHash" | "role" | "created" | "lastUpdated" | "organizationId";
export type UserCreationAttributes = Optional<UserAttributes, UserOptionalAttributes>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  userId!: string;
  name?: string;
  pictureUrl?: string;
  isOrganization?: boolean;
  email?: string;
  passwordHash?: string;
  role?: string;
  created?: Date;
  lastUpdated?: Date;
  organizationId?: string;

  // User hasMany CityUser via userId
  cityUsers!: CityUser[];
  getCityUsers!: Sequelize.HasManyGetAssociationsMixin<CityUser>;
  setCityUsers!: Sequelize.HasManySetAssociationsMixin<CityUser, CityUserId>;
  addCityUser!: Sequelize.HasManyAddAssociationMixin<CityUser, CityUserId>;
  addCityUsers!: Sequelize.HasManyAddAssociationsMixin<CityUser, CityUserId>;
  createCityUser!: Sequelize.HasManyCreateAssociationMixin<CityUser>;
  removeCityUser!: Sequelize.HasManyRemoveAssociationMixin<CityUser, CityUserId>;
  removeCityUsers!: Sequelize.HasManyRemoveAssociationsMixin<CityUser, CityUserId>;
  hasCityUser!: Sequelize.HasManyHasAssociationMixin<CityUser, CityUserId>;
  hasCityUsers!: Sequelize.HasManyHasAssociationsMixin<CityUser, CityUserId>;
  countCityUsers!: Sequelize.HasManyCountAssociationsMixin;
  // User belongsTo User via organizationId
  organization!: User;
  getOrganization!: Sequelize.BelongsToGetAssociationMixin<User>;
  setOrganization!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;
  createOrganization!: Sequelize.BelongsToCreateAssociationMixin<User>;

  static initModel(sequelize: Sequelize.Sequelize): typeof User {
    return User.init({
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'user_id'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    pictureUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'picture_url'
    },
    isOrganization: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      field: 'is_organization'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    passwordHash: {
      type: DataTypes.CHAR(60),
      allowNull: true,
      field: 'password_hash'
    },
    role: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lastUpdated: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_updated'
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'User',
        key: 'user_id'
      },
      field: 'organization_id'
    }
  }, {
    sequelize,
    tableName: 'User',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "User_pkey",
        unique: true,
        fields: [
          { name: "user_id" },
        ]
      },
    ]
  });
  }
}
