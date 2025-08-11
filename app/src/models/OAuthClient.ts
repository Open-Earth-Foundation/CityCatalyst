import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface OAuthClientAttributes {
  clientId: string;
  redirectURI: string;
  created?: Date;
  lastUpdated?: Date;
}

export type OAuthClientPk = "clientId";
export type OAuthClientId = OAuthClient[OAuthClientPk];
export type OAuthClientOptionalAttributes = "created" | "lastUpdated";
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
  created?: Date;
  lastUpdated?: Date;

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
