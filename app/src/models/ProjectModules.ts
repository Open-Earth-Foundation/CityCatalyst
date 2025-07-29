import { DataTypes, Model, Sequelize, Optional } from 'sequelize';

export interface ProjectModulesAttributes {
  id: string;
  project_id: string;
  module_id: string;
  expires_on?: Date;
}

export type ProjectModulesCreationAttributes = Optional<ProjectModulesAttributes, 'id'>;

export class ProjectModules extends Model<ProjectModulesAttributes, ProjectModulesCreationAttributes> implements ProjectModulesAttributes {
  public id!: string;
  public project_id!: string;
  public module_id!: string;
  public expires_on?: Date;

  static initModel(sequelize: Sequelize): typeof ProjectModules {
    ProjectModules.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        project_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        module_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        expires_on: {
          type: DataTypes.DATE,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'ProjectModules',
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
      }
    );
    return ProjectModules;
  }
} 