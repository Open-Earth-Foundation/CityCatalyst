import { DataTypes, Model, Sequelize, Optional } from 'sequelize';

export interface ModuleAttributes {
  id: string;
  step: string;
  name: string;
  description?: string;
  type?: string;
  url?: string;
}

export type ModuleCreationAttributes = Optional<ModuleAttributes, 'id'>;

export class Module extends Model<ModuleAttributes, ModuleCreationAttributes> implements ModuleAttributes {
  public id!: string;
  public step!: string;
  public name!: string;
  public type?: string;
  public url?: string;

  static initModel(sequelize: Sequelize): typeof Module {
    Module.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        step: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        name: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        type: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        url: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'Module',
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
      }
    );
    return Module;
  }
} 