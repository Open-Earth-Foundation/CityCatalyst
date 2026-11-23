import { DataTypes, Model, Optional, Sequelize } from "sequelize";

/**
 * Opaque, single-use OAuth authorization code. Only the SHA-256 hash of the
 * code is stored. The row binds the code to the client, redirect URI, PKCE
 * challenge and user that requested it.
 *
 * Issued by POST /api/v1/auth/code and redeemed at POST /api/v1/token. See
 * src/backend/oauth/AuthorizationCodeService.ts.
 */
export interface AuthorizationCodeAttributes {
  codeHash: string;
  clientId: string;
  userId: string;
  redirectURI: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  nonce?: string | null;
  expires: Date;
  /** Set when the code is exchanged. A second exchange is a replay. */
  consumedAt?: Date | null;
  created?: Date;
}

export type AuthorizationCodePk = "codeHash";
export type AuthorizationCodeId = AuthorizationCode[AuthorizationCodePk];
export type AuthorizationCodeOptionalAttributes =
  "codeChallengeMethod" | "nonce" | "consumedAt" | "created";
export type AuthorizationCodeCreationAttributes = Optional<
  AuthorizationCodeAttributes,
  AuthorizationCodeOptionalAttributes
>;

export class AuthorizationCode
  extends Model<
    AuthorizationCodeAttributes,
    AuthorizationCodeCreationAttributes
  >
  implements AuthorizationCodeAttributes
{
  declare codeHash: string;
  declare clientId: string;
  declare userId: string;
  declare redirectURI: string;
  declare codeChallenge: string;
  declare codeChallengeMethod: string;
  declare scope: string;
  declare nonce: string | null;
  declare expires: Date;
  declare consumedAt: Date | null;
  declare created: Date;

  static initModel(sequelize: Sequelize): typeof AuthorizationCode {
    AuthorizationCode.init(
      {
        codeHash: {
          type: DataTypes.STRING(64),
          allowNull: false,
          primaryKey: true,
          field: "code_hash",
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
        redirectURI: {
          type: DataTypes.STRING(2048),
          allowNull: false,
          field: "redirect_uri",
        },
        codeChallenge: {
          type: DataTypes.STRING(128),
          allowNull: false,
          field: "code_challenge",
        },
        codeChallengeMethod: {
          type: DataTypes.STRING(8),
          allowNull: false,
          defaultValue: "S256",
          field: "code_challenge_method",
        },
        scope: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        nonce: {
          type: DataTypes.STRING(255),
          allowNull: true,
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
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        modelName: "AuthorizationCode",
        tableName: "AuthorizationCode",
        timestamps: false,
      },
    );
    return AuthorizationCode;
  }
}
