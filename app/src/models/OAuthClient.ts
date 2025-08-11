import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface OAuthClientAttributes {
  clientId: string;
  redirectURI: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OAuthClientPk = "clientId";
export type OAuthClientId = OAuthClient[OAuthClientPk];
export type OAuthClientOptionalAttributes = "createdAt" | "updatedAt";
export type OAuthClientCreationAttributes = Optional<
  OAuthClientAttributes,
  OAuthClientOptionalAttributes
>;

export class OAuthClient
  extends Model<OAuthClientAttributes, OAuthClientCreationAttributes>
  implements OAuthClientAttributes
{
  clientId!: string;
  redirectURI!: string;
  createdAt?: Date;
  updatedAt?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof OAuthClient {
    return OAuthClient.init(
      {
        clientId: {
          field: "client_id",
          type: DataTypes.STRING(64),
          allowNull: false,
          primaryKey: true,
        },
        redirectURI: {
          field: "redirect_uri",
          type: DataTypes.STRING(256),
          allowNull: false,
          unique: true,
        },
        createdAt: {
          field: "created_at",
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updatedAt: {
          field: "updated_at",
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        tableName: "OAuthClient",
        schema: "public",
        timestamps: false,
      },
    );
  }
}
