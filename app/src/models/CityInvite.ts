import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { City, CityId } from "./City";
import { User, UserId } from "./User";
import { InviteStatus } from "@/util/types";

export interface CityInviteAttributes {
  id: string;
  cityId?: string;
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
  | "cityId"
  | "userId"
  | "email"
  | "invitingUserId"
  | "status"
  | "created"
  | "lastUpdated";

export class CityInvite
  extends Model<CityInviteAttributes, CityInviteCreationAttributes>
  implements CityInviteAttributes
{
  id!: string;
  cityId?: string | undefined;
  userId?: string | undefined;
  email?: string | undefined;
  invitingUserId?: string | undefined;
  status?: InviteStatus | undefined;
  created?: Date | undefined;
  lastUpdated?: Date | undefined;

  //   CityInvite belongs to City via cityId
  city!: City;
  getCity!: Sequelize.BelongsToGetAssociationMixin<City>;
  setCity!: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  createCity!: Sequelize.BelongsToCreateAssociationMixin<City>;

  //   CityInvite belongs to User via userId
  user!: User;
  getUser!: Sequelize.BelongsToGetAssociationMixin<User>;
  setUser!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

  //   CityInvite belongs to User via invitingUserId
  invitingUser!: User;
  getInvitingUser!: Sequelize.BelongsToGetAssociationMixin<User>;
  setInvitingUser!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

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
          allowNull: true,
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
