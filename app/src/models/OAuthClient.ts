import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface OAuthClientAttributes {
  client_id: string;
  redirect_uri: string;
  created_at?: Date;
  updated_at?: Date;
}

export type OAuthClientPk = "client_id";
export type OAuthClientId = OAuthClient[OAuthClientPk];
export type OAuthClientOptionalAttributes = "created_at" | "updated_at";
export type OAuthClientCreationAttributes = Optional<
  OAuthClientAttributes,
  OAuthClientOptionalAttributes
>;

export class OAuthClient
  extends Model<OAuthClientAttributes, OAuthClientCreationAttributes>
  implements OAuthClientAttributes
{
  client_id!: string;
  redirect_uri!: string;
  created_at?: Date;
  updated_at?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof OAuthClient {
    return OAuthClient.init(
      {
        client_id: {
          type: DataTypes.STRING(64),
          allowNull: false,
          primaryKey: true,
        },
        redirect_uri: {
          type: DataTypes.STRING(256),
          allowNull: false,
          unique: true,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updated_at: {
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
      }
    );
  }
}