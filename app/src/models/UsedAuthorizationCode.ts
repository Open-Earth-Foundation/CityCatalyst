import { Model, DataTypes, Sequelize, Optional } from "sequelize";

/**
 * Records OAuth authorization codes (by JWT `jti`) that have already been
 * exchanged at /api/v1/token, so a code can only be redeemed once across
 * all app replicas.
 */
export interface UsedAuthorizationCodeAttributes {
  jti: string;
  expires: Date;
  created: Date;
}

export type UsedAuthorizationCodePk = "jti";
export type UsedAuthorizationCodeId =
  UsedAuthorizationCode[UsedAuthorizationCodePk];
export type UsedAuthorizationCodeOptionalAttributes = "created";
export type UsedAuthorizationCodeCreationAttributes = Optional<
  UsedAuthorizationCodeAttributes,
  UsedAuthorizationCodeOptionalAttributes
>;

export class UsedAuthorizationCode
  extends Model<
    UsedAuthorizationCodeAttributes,
    UsedAuthorizationCodeCreationAttributes
  >
  implements UsedAuthorizationCodeAttributes
{
  declare jti: string;
  declare expires: Date;
  declare created: Date;

  static initModel(sequelize: Sequelize): typeof UsedAuthorizationCode {
    UsedAuthorizationCode.init(
      {
        jti: {
          type: DataTypes.STRING(64),
          allowNull: false,
          primaryKey: true,
        },
        expires: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        modelName: "UsedAuthorizationCode",
        tableName: "UsedAuthorizationCode",
        timestamps: false,
      },
    );
    return UsedAuthorizationCode;
  }
}
