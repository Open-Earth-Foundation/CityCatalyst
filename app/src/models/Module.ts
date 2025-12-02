import { DataTypes, Model, Sequelize, Optional } from 'sequelize';

export interface ModuleAttributes {
  id: string;
  stage: string;
  name: { [lng: string]: string };
  description?: { [lng: string]: string };
  tagline?: { [lng: string]: string };
  type: string;
  author: string;
  url: string;
  logo?: string;
  created?: Date;
  last_updated?: Date;
}

export type ModuleCreationAttributes = Optional<ModuleAttributes, "id">;

export class Module
  extends Model<ModuleAttributes, ModuleCreationAttributes>
  implements ModuleAttributes
{
  declare id: string;
  declare stage: string;
  declare name: { [lng: string]: string };
  declare description?: { [lng: string]: string };
  declare tagline?: { [lng: string]: string };
  declare type: string;
  declare url: string;
  declare author: string;
  declare logo?: string;
  declare created?: Date;
  declare last_updated?: Date;

  static initModel(sequelize: Sequelize): typeof Module {
    Module.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        stage: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        name: {
          type: DataTypes.JSONB,
          allowNull: false,
        },
        description: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        tagline: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        type: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        author: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        url: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        logo: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: "Module",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
      },
    );
    return Module;
  }
} 