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
  created?: Date;
  last_updated?: Date;
}

export type ModuleCreationAttributes = Optional<ModuleAttributes, "id">;

export class Module
  extends Model<ModuleAttributes, ModuleCreationAttributes>
  implements ModuleAttributes
{
  public id!: string;
  public stage!: string;
  public name!: { [lng: string]: string };
  public description?: { [lng: string]: string };
  public tagline?: { [lng: string]: string };
  public type!: string;
  public url!: string;
  public author!: string;

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