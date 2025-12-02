import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { City, CityId } from "./City";
import { User, UserId } from "./User";
import { InviteStatus } from "@/util/types";

export interface CityInviteAttributes {
  id: string;
  cityId: string;
  userId?: string;
  email?: string;
  invitingUserId?: string;
  status?: InviteStatus;
  created?: Date;
  lastUpdated?: Date;
}

export type CityInvitePk = "id";
export type CityInviteId = CityInvite[CityInvitePk];
export type CityInviteCreationAttributes = Optional<
  CityInviteAttributes,
  CityInviteOptionalAttributes
>;
export type CityInviteOptionalAttributes =
  | "userId"
  | "email"
  | "invitingUserId"
  | "status"
  | "created"
  | "lastUpdated";

export class CityInvite
  extends Model<CityInviteAttributes, CityInviteCreationAttributes>
  implements Partial<CityInviteAttributes>
{
  declare id: string;
  declare cityId: string;
  declare userId?: string | undefined;
  declare email?: string | undefined;
  declare invitingUserId?: string | undefined;
  declare status?: InviteStatus | undefined;
  declare created?: Date | undefined;
  declare lastUpdated?: Date | undefined;

  //   CityInvite belongs to City via cityId
  declare city: City;
  declare getCity: Sequelize.BelongsToGetAssociationMixin<City>;
  declare setCity: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  declare createCity: Sequelize.BelongsToCreateAssociationMixin<City>;

  //   CityInvite belongs to User via userId
  declare user: User;
  declare getUser: Sequelize.BelongsToGetAssociationMixin<User>;
  declare setUser: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

  //   CityInvite belongs to User via invitingUserId
  declare invitingUser: User;
  declare getInvitingUser: Sequelize.BelongsToGetAssociationMixin<User>;
  declare setInvitingUser: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

  static initModel(sequelize: Sequelize.Sequelize): typeof CityInvite {
    return CityInvite.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "id",
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
        userId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "User",
            key: "id",
          },
          field: "user_id",
        },
        email: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        invitingUserId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "User",
            key: "user_id",
          },
          field: "inviting_user_id",
        },
        status: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        lastUpdated: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "last_updated",
        },
      },
      {
        sequelize,
        underscored: true,
        tableName: "CityInvite",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "CityInvite_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "CityInvite_email_index",
            fields: [{ name: "email" }],
          },
          {
            name: "CityInvite_inviting_user_id_index",
            fields: [{ name: "inviting_user_id" }],
          },
          {
            name: "CityInvite_user_id_index",
            fields: [{ name: "user_id" }],
          },
        ],
      },
    );
  }
}
