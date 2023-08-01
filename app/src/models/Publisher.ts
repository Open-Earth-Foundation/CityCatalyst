import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';

export interface PublisherAttributes {
  publisherId: string;
  name?: string;
  url?: string;
  created?: Date;
  lastUpdated?: Date;
}

export type PublisherPk = "publisherId";
export type PublisherId = Publisher[PublisherPk];
export type PublisherOptionalAttributes = "name" | "url" | "created" | "lastUpdated";
export type PublisherCreationAttributes = Optional<PublisherAttributes, PublisherOptionalAttributes>;

export class Publisher extends Model<PublisherAttributes, PublisherCreationAttributes> implements PublisherAttributes {
  publisherId!: string;
  name?: string;
  url?: string;
  created?: Date;
  lastUpdated?: Date;

  // Publisher hasMany DataSource via publisherId
  dataSources!: DataSource[];
  getDataSources!: Sequelize.HasManyGetAssociationsMixin<DataSource>;
  setDataSources!: Sequelize.HasManySetAssociationsMixin<DataSource, DataSourceId>;
  addDataSource!: Sequelize.HasManyAddAssociationMixin<DataSource, DataSourceId>;
  addDataSources!: Sequelize.HasManyAddAssociationsMixin<DataSource, DataSourceId>;
  createDataSource!: Sequelize.HasManyCreateAssociationMixin<DataSource>;
  removeDataSource!: Sequelize.HasManyRemoveAssociationMixin<DataSource, DataSourceId>;
  removeDataSources!: Sequelize.HasManyRemoveAssociationsMixin<DataSource, DataSourceId>;
  hasDataSource!: Sequelize.HasManyHasAssociationMixin<DataSource, DataSourceId>;
  hasDataSources!: Sequelize.HasManyHasAssociationsMixin<DataSource, DataSourceId>;
  countDataSources!: Sequelize.HasManyCountAssociationsMixin;

  static initModel(sequelize: Sequelize.Sequelize): typeof Publisher {
    return Publisher.init({
    publisherId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      field: 'publisher_id'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    url: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'URL'
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lastUpdated: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_updated'
    }
  }, {
    sequelize,
    tableName: 'Publisher',
    schema: 'public',
    timestamps: false,
    indexes: [
      {
        name: "Publisher_pkey",
        unique: true,
        fields: [
          { name: "publisher_id" },
        ]
      },
    ]
  });
  }
}
