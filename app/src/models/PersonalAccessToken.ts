import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { User, UserId } from "./User";

export interface PersonalAccessTokenAttributes {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  created?: Date;
  lastUpdated?: Date;
}

export type PersonalAccessTokenPk = "id";
export type PersonalAccessTokenId = PersonalAccessToken[PersonalAccessTokenPk];
export type PersonalAccessTokenOptionalAttributes =
  | "id"
  | "scopes"
  | "expiresAt"
  | "lastUsedAt"
  | "created"
  | "lastUpdated";
export type PersonalAccessTokenCreationAttributes = Optional<
  PersonalAccessTokenAttributes,
  PersonalAccessTokenOptionalAttributes
>;

export class PersonalAccessToken
  extends Model<PersonalAccessTokenAttributes, PersonalAccessTokenCreationAttributes>
  implements PersonalAccessTokenAttributes
{
  declare id: string;
  declare userId: string;
  declare name: string;
  declare tokenHash: string;
  declare tokenPrefix: string;
  declare scopes: string[];
  declare expiresAt?: Date | null;
  declare lastUsedAt?: Date | null;
  declare created?: Date;
  declare lastUpdated?: Date;

  // PersonalAccessToken belongsTo User via userId
  declare user?: User;
  declare getUser: Sequelize.BelongsToGetAssociationMixin<User>;
  declare setUser: Sequelize.BelongsToSetAssociationMixin<User, UserId>;
  declare createUser: Sequelize.BelongsToCreateAssociationMixin<User>;

  static initModel(sequelize: Sequelize.Sequelize): typeof PersonalAccessToken {
    return PersonalAccessToken.init(
      {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        userId: {
          field: "user_id",
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "User",
            key: "user_id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        tokenHash: {
          field: "token_hash",
          type: DataTypes.CHAR(64),
          allowNull: false,
          unique: true,
        },
        tokenPrefix: {
          field: "token_prefix",
          type: DataTypes.STRING(16),
          allowNull: false,
        },
        scopes: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          allowNull: false,
          defaultValue: ["read"],
        },
        expiresAt: {
          field: "expires_at",
          type: DataTypes.DATE,
          allowNull: true,
        },
        lastUsedAt: {
          field: "last_used_at",
          type: DataTypes.DATE,
          allowNull: true,
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        lastUpdated: {
          field: "last_updated",
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        tableName: "PersonalAccessToken",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "lastUpdated",
        indexes: [
          {
            name: "PersonalAccessToken_user_id_idx",
            fields: [{ name: "user_id" }],
          },
          {
            name: "PersonalAccessToken_token_hash_idx",
            unique: true,
            fields: [{ name: "token_hash" }],
          },
        ],
      },
    );
  }
}
