import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';

export interface UserAttributes {
  user_id: string;
  name?: string;
  picture_url?: string;
  is_organization?: boolean;
  email?: string;
  password_hash?: string;
  role?: string;
  created?: Date;
  last_updated?: Date;
  organization_id?: string;
}

export type UserPk = "user_id";
export type UserId = User[UserPk];
export type UserOptionalAttributes = "name" | "picture_url" | "is_organization" | "email" | "password_hash" | "role" | "created" | "last_updated" | "organization_id";
export type UserCreationAttributes = Optional<UserAttributes, UserOptionalAttributes>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  user_id!: string;
  name?: string;
  picture_url?: string;
  is_organization?: boolean;
  email?: string;
  password_hash?: string;
  role?: string;
  created?: Date;
  last_updated?: Date;
  organization_id?: string;

  // User belongsTo User via organization_id
  organization!: User;
  getOrganization!: Sequelize.BelongsToGetAssociationMixin<User>;
  setOrganization!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;
  createOrganization!: Sequelize.BelongsToCreateAssociationMixin<User>;

  static initModel(sequelize: Sequelize.Sequelize): typeof User {
    return User.init({
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    picture_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_organization: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    email: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    password_hash: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    role: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: true
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'User',
        key: 'user_id'
      }
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
