import { DataTypes, Model, Optional, Sequelize } from "sequelize";

/**
 * Opaque OAuth refresh token. Only the SHA-256 hash of the token is stored.
 *
 * Every token that comes from one authorization shares a `familyId`. Each use
 * consumes a token and issues the next one in the family. Using a token that was
 * already consumed means it was copied, and the whole family is revoked. See
 * src/backend/oauth/RefreshTokenService.ts.
 */
export interface RefreshTokenAttributes {
  tokenHash: string;
  familyId: string;
  clientId: string;
  userId: string;
  scope: string;
  expires: Date;
  /** Set when the token is exchanged for the next one. */
  consumedAt?: Date | null;
  /** Set on every token of a family when the family is revoked. */
  revokedAt?: Date | null;
  created?: Date;
}

export type RefreshTokenPk = "tokenHash";
export type RefreshTokenId = RefreshToken[RefreshTokenPk];
export type RefreshTokenOptionalAttributes =
  | "consumedAt"
  | "revokedAt"
  | "created";
export type RefreshTokenCreationAttributes = Optional<
  RefreshTokenAttributes,
  RefreshTokenOptionalAttributes
>;

export class RefreshToken
  extends Model<RefreshTokenAttributes, RefreshTokenCreationAttributes>
  implements RefreshTokenAttributes
{
  declare tokenHash: string;
  declare familyId: string;
  declare clientId: string;
  declare userId: string;
  declare scope: string;
  declare expires: Date;
  declare consumedAt: Date | null;
  declare revokedAt: Date | null;
  declare created: Date;

  static initModel(sequelize: Sequelize): typeof RefreshToken {
    RefreshToken.init(
      {
        tokenHash: {
          type: DataTypes.STRING(64),
          allowNull: false,
          primaryKey: true,
          field: "token_hash",
        },
        familyId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "family_id",
        },
        clientId: {
          type: DataTypes.STRING(64),
          allowNull: false,
          field: "client_id",
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "user_id",
        },
        scope: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        expires: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        consumedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "consumed_at",
        },
        revokedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "revoked_at",
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        modelName: "RefreshToken",
        tableName: "RefreshToken",
        timestamps: false,
      },
    );
    return RefreshToken;
  }
}
