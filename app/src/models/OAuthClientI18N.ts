import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { OAuthClient } from "./OAuthClient";

export interface OAuthClientI18NAttributes {
  clientId: string;
  language: string;
  name: string;
  description?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type OAuthClientI18NPk = "clientId" | "language";
export type OAuthClientI18NId = OAuthClientI18N[OAuthClientI18NPk];
export type OAuthClientI18NOptionalAttributes =
  | "description"
  | "created"
  | "lastUpdated";
export type OAuthClientI18NCreationAttributes = Optional<
  OAuthClientI18NAttributes,
  OAuthClientI18NOptionalAttributes
>;

export class OAuthClientI18N
  extends Model<OAuthClientI18NAttributes, OAuthClientI18NCreationAttributes>
  implements OAuthClientI18NAttributes
{
  clientId!: string;
  language!: string;
  name!: string;
  description?: string;
  created?: Date;
  lastUpdated?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof OAuthClientI18N {
    return OAuthClientI18N.init(
      {
        clientId: {
          field: "client_id",
          type: DataTypes.STRING(64),
          allowNull: false,
          primaryKey: true,
          references: {
            model: "OAuthClient",
            key: "client_id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        language: {
          type: DataTypes.STRING(2),
          allowNull: false,
          primaryKey: true,
          comment: "ISO 639-1 two-letter language code",
        },
        name: {
          type: DataTypes.STRING(64),
          allowNull: false,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        created: {
          field: "created",
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
        tableName: "OAuthClientI18N",
        schema: "public",
        timestamps: true,
        createdAt: "created", // custom column for creation time
        updatedAt: "lastUpdated", // custom column for update time
      },
    );
  }
}
