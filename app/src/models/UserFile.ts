import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { User, UserId } from "./User";
import { City, CityId } from "./City";

export interface UserFileAttributes {
  id: string;
  userId?: string;
  cityId?: string;
  fileReference?: string;
  data?: Buffer | any;
  fileType?: string;
  fileName?: string;
  sector?: string;
  subsectors?: string[];
  scopes?: string[];
  status?: string;
  url?: string;
  gpcRefNo?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type UserFilePk = "id";
export type UserFileId = UserFile[UserFilePk];
export type UserFileOptionalAttributes =
  | "userId"
  | "cityId"
  | "fileReference"
  | "data"
  | "fileType"
  | "fileName"
  | "sector"
  | "subsectors"
  | "scopes"
  | "url"
  | "status"
  | "gpcRefNo"
  | "created"
  | "lastUpdated";
export type UserFileCreationAttributes = Optional<
  UserFileAttributes,
  UserFileOptionalAttributes
>;

export class UserFile
  extends Model<UserFileAttributes, UserFileCreationAttributes>
  implements Partial<UserFileAttributes>
{
  id!: string;
  userId?: string;
  cityId?: string;
  fileReference?: string;
  data?: Buffer;
  fileType?: string;
  fileName?: string;
  sector?: string;
  subsectors?: string[];
  scopes?: string[];
  url?: string;
  status?: string;
  gpcRefNo?: string;
  created?: Date;
  lastUpdated?: Date;

  //UserFile belongs to User via id
  user!: User;
  getUser!: Sequelize.BelongsToGetAssociationMixin<User>;
  setUser!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;
  createUser!: Sequelize.BelongsToCreateAssociationMixin<User>;

  //UserFile belongs to City via cityId
  city!: City;
  getCity!: Sequelize.BelongsToGetAssociationMixin<City>;
  setCity!: Sequelize.BelongsToSetAssociationMixin<City, CityId>;
  createCity!: Sequelize.BelongsToCreateAssociationMixin<City>;

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
        cityId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "City",
            key: "city_id",
          },
          field: "city_id",
        },
        fileReference: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "file_reference",
        },
        data: {
          type: DataTypes.BLOB,
          allowNull: true,
        },
        fileType: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "file_type",
        },
        fileName: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "file_name",
        },
        sector: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        subsectors: {
          type: DataTypes.ARRAY(DataTypes.STRING(255)),
          allowNull: true,
        },
        scopes: {
          type: DataTypes.ARRAY(DataTypes.NUMBER),
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
        gpcRefNo: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "gpc_ref_no",
        },
        lastUpdated: {
          type: DataTypes.DATE,
          field: "last_updated",
        },
      },
      {
        sequelize,
        underscored: true,
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
