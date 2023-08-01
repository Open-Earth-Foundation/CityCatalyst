import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { City, CityId } from './City';
import type { User, UserId } from './User';

export interface CityUserAttributes {
  city_user_id: string;
  user_id?: string;
  city_id?: string;
  created?: Date;
  last_updated?: Date;
}

export type CityUserPk = "city_user_id";
export type CityUserId = CityUser[CityUserPk];
export type CityUserOptionalAttributes = "user_id" | "city_id" | "created" | "last_updated";
export type CityUserCreationAttributes = Optional<CityUserAttributes, CityUserOptionalAttributes>;

export class CityUser extends Model<CityUserAttributes, CityUserCreationAttributes> implements CityUserAttributes {
  city_user_id!: string;
  user_id?: string;
  city_id?: string;
  created?: Date;
  last_updated?: Date;

  // CityUser belongsTo City via city_id
  city!: City;
  getCity!: Sequelize.BelongsToGetAssociationMixin<City>;
  setCity!: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  createCity!: Sequelize.BelongsToCreateAssociationMixin<City>;
  // CityUser belongsTo User via user_id
  user!: User;
  getUser!: Sequelize.BelongsToGetAssociationMixin<User>;
  setUser!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;
  createUser!: Sequelize.BelongsToCreateAssociationMixin<User>;

  static initModel(sequelize: Sequelize.Sequelize): typeof CityUser {
    return CityUser.init({
    city_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'User',
        key: 'user_id'
      }
    },
    city_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'City',
        key: 'city_id'
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
    tableName: 'CityUser',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "CityUser_pkey",
        unique: true,
        fields: [
          { name: "city_user_id" },
        ]
      },
    ]
  });
  }
}
