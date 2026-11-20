import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface OAuthClientAttributes {
  clientId: string;
  redirectURI: string;
  /**
   * Hex SHA-256 of the client secret. Null for a public client (a browser or
   * mobile app that cannot keep a secret). A client with a secret is
   * confidential and must authenticate at the token endpoint.
   */
  clientSecretHash?: string | null;
  created?: Date;
  lastUpdated?: Date;
}

export type OAuthClientPk = "clientId";
export type OAuthClientId = OAuthClient[OAuthClientPk];
export type OAuthClientOptionalAttributes =
  | "clientSecretHash"
  | "created"
  | "lastUpdated";
export type OAuthClientCreationAttributes = Optional<
  OAuthClientAttributes,
  OAuthClientOptionalAttributes
>;

export class OAuthClient
  extends Model<OAuthClientAttributes, OAuthClientCreationAttributes>
  implements OAuthClientAttributes
{
  declare clientId: string;
  declare redirectURI: string;
  declare clientSecretHash?: string | null;
  declare created?: Date;
  declare lastUpdated?: Date;

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
          type: DataTypes.STRING(2048),
          allowNull: false,
          unique: true,
          comment: "URL format, length limit similar to Google or AWS",
        },
        clientSecretHash: {
          field: "client_secret_hash",
          type: DataTypes.STRING(64),
          allowNull: true,
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        lastUpdated: {
          field: "last_updated",
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      },
      {
        sequelize,
        tableName: "OAuthClient",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "lastUpdated"
      },
    );
  }
}
