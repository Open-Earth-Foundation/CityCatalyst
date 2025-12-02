import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { City, CityId } from "./City";
import type { User, UserId } from "./User";

export interface CityUserAttributes {
  cityUserId: string;
  userId: string;
  cityId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type CityUserPk = "cityUserId";
export type CityUserId = CityUser[CityUserPk];
export type CityUserOptionalAttributes = "created" | "lastUpdated";
export type CityUserCreationAttributes = Optional<
  CityUserAttributes,
  CityUserOptionalAttributes
>;

export class CityUser
  extends Model<CityUserAttributes, CityUserCreationAttributes>
  implements Partial<CityUserAttributes>
{
  declare cityUserId: string;
  declare userId: string;
  declare cityId: string;
  declare created?: Date;
  declare lastUpdated?: Date;

  // CityUser belongsTo City via cityId
  declare city: City;
  declare getCity: Sequelize.BelongsToGetAssociationMixin<City>;
  declare setCity: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  declare createCity: Sequelize.BelongsToCreateAssociationMixin<City>;
  // CityUser belongsTo User via userId
  declare user: User;
  declare getUser: Sequelize.BelongsToGetAssociationMixin<User>;
  declare setUser: Sequelize.BelongsToSetAssociationMixin<User, UserId>;
  declare createUser: Sequelize.BelongsToCreateAssociationMixin<User>;

  static initModel(sequelize: Sequelize.Sequelize): typeof CityUser {
    return CityUser.init(
      {
        cityUserId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: Sequelize.UUIDV4,
          field: "city_user_id",
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "User",
            key: "user_id",
          },
          field: "user_id",
        },
        cityId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "City",
            key: "city_id",
          },
          field: "city_id",
        },
      },
      {
        sequelize,
        tableName: "CityUser",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "CityUser_pkey",
            unique: true,
            fields: [{ name: "city_user_id" }],
          },
        ],
      },
    );
  }
}
