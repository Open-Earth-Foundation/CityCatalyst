import * as Sequelize from 'sequelize';
import { DataTypes, Model, Optional } from 'sequelize';
import type { DataSource, DataSourceId } from './DataSource';

export interface PublisherAttributes {
  publisher_id: string;
  name?: string;
  URL?: string;
  created?: Date;
  last_updated?: Date;
}

export type PublisherPk = "publisher_id";
export type PublisherId = Publisher[PublisherPk];
export type PublisherOptionalAttributes = "name" | "URL" | "created" | "last_updated";
export type PublisherCreationAttributes = Optional<PublisherAttributes, PublisherOptionalAttributes>;

export class Publisher extends Model<PublisherAttributes, PublisherCreationAttributes> implements PublisherAttributes {
  publisher_id!: string;
  name?: string;
  URL?: string;
  created?: Date;
  last_updated?: Date;

  // Publisher hasMany DataSource via publisher_id
  DataSources!: DataSource[];
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
    publisher_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    URL: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    created: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: true
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
