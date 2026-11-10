import { Model, DataTypes, Sequelize, Optional } from "sequelize";

/**
 * Records OAuth authorization codes (by JWT ID, the `jti` claim) that have already been
 * exchanged at /api/v1/token, so a code can only be redeemed once across
 * all app replicas.
 */
export interface UsedAuthorizationCodeAttributes {
  jwtId: string;
  expires: Date;
  created: Date;
}

export type UsedAuthorizationCodePk = "jwtId";
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
  declare jwtId: string;
  declare expires: Date;
  declare created: Date;

  static initModel(sequelize: Sequelize): typeof UsedAuthorizationCode {
    UsedAuthorizationCode.init(
      {
        jwtId: {
          type: DataTypes.STRING(64),
          allowNull: false,
          primaryKey: true,
          field: "jwt_id",
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
