import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { User, UserAttributes, UserId } from "./User";
import { City, CityId } from "./City";
import { UserFileCreationAttributes } from "./UserFile";

export interface CityInviteAttributes {
  id: string;
  userId?: string;
  locode?: string;
  status?: string;
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
  | "locode"
  | "status"
  | "created"
  | "lastUpdated";

export class CityInvite
  extends Model<CityInviteAttributes, UserFileCreationAttributes>
  implements CityInviteAttributes
{
  id!: string;
  userId?: string | undefined;
  locode?: string | undefined;
  status?: string | undefined;
  created?: Date | undefined;
  lastUpdated?: Date | undefined;

  //   CityInvite belongs to User via id
  user!: User;
  getUser!: Sequelize.BelongsToGetAssociationMixin<User>;
  setUser!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;
  createUser!: Sequelize.BelongsToCreateAssociationMixin<User>;

  //   CityInvite belongs to City via cityId
  city!: City;
  getCity!: Sequelize.BelongsToGetAssociationMixin<City>;
  setCity!: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  createCity!: Sequelize.BelongsToCreateAssociationMixin<City>;

  static initModel(sequelize: Sequelize.Sequelize): typeof CityInvite {
    return CityInvite.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "id",
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "User",
            key: "user_id",
          },
          field: "user_id",
        },
        locode: {
          type: DataTypes.UUID,
          allowNull: true,
        },
        status: {
          type: DataTypes.STRING(255),
          allowNull: true,
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
        ],
      },
    );
  }
}
