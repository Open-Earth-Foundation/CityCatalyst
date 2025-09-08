import {
  Model,
  DataTypes,
  Sequelize,
  Optional,
  ForeignKey,
} from 'sequelize';
import { OAuthClient } from './OAuthClient';
import { User } from './User';

export interface OAuthClientAuthzAttributes {
  clientId: string;
  userId: string;             // UUID as string
  lastUsed?: Date | null;
  created?: Date;
}

export type OAuthClientAuthzPk = 'clientId' | 'userId';
export type OAuthClientAuthzId = OAuthClientAuthz[OAuthClientAuthzPk];
export type OAuthClientAuthzOptionalAttributes = 'lastUsed' | 'created';
export type OAuthClientAuthzCreationAttributes = Optional<
  OAuthClientAuthzAttributes,
  OAuthClientAuthzOptionalAttributes
>;

export class OAuthClientAuthz extends Model<
  OAuthClientAuthzAttributes,
  OAuthClientAuthzCreationAttributes
> implements OAuthClientAuthzAttributes {
  declare clientId: ForeignKey<OAuthClient['clientId']>;
  declare userId: ForeignKey<User['userId']>;
  declare lastUsed: Date | null;
  declare created: Date;

  static initModel(sequelize: Sequelize): typeof OAuthClientAuthz {
    OAuthClientAuthz.init(
      {
        clientId: {
          type: DataTypes.STRING(64),
          allowNull: false,
          primaryKey: true,
          field: 'client_id',
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: 'user_id',
        },
        lastUsed: {
          type: DataTypes.DATE,
          allowNull: true,
          field: 'last_used',
        },
        created: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
          field: 'created',
        },
      },
      {
        sequelize,
        modelName: 'OAuthClientAuthz',
        tableName: 'OAuthClientAuthz',
        timestamps: false,
        underscored: true,
      }
    );
    return OAuthClientAuthz;
  }
}
