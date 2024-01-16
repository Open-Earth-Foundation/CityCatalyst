import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { User, UserId } from "./User";

export interface UserFileAttributes {
  id: string;
  userId?: string;
  file_reference?: string;
  data?: Buffer;
  status?: string;
  url?: string;
  gpc_ref_no?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type UserFilePk = "id";
export type UserFileId = UserFile[UserFilePk];
export type UserFileOptionalAttributes =
  | "userId"
  | "file_reference"
  | "data"
  | "url"
  | "status"
  | "gpc_ref_no"
  | "created"
  | "lastUpdated";
export type UserFileCreationAttributes = Optional<
  UserFileAttributes,
  UserFileOptionalAttributes
>;

export class UserFile
  extends Model<UserFileAttributes, UserFileCreationAttributes>
  implements UserFileAttributes
{
  id!: string;
  userId?: string | undefined;
  file_reference?: string | undefined;
  data: Buffer | undefined;
  url?: string | undefined;
  status: string | undefined;
  gpc_ref_no?: string | undefined;
  created?: Date | undefined;
  lastUpdated?: Date | undefined;

  //UserFile belongs to User via id
  user!: User;
  getUser!: Sequelize.BelongsToGetAssociationMixin<User>;
  setUser!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;
  createUser!: Sequelize.BelongsToCreateAssociationMixin<User>;

  static initModel(sequelize: Sequelize.Sequelize): typeof UserFile {
    return UserFile.init(
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
        file_reference: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        data: {
          type: DataTypes.BLOB,
          allowNull: true,
        },
        url: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        status: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        gpc_ref_no: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: "UserFile",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "UserFile_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
        ],
      },
    );
  }
}
