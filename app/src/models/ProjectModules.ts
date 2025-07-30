import { DataTypes, Model, Sequelize, Optional } from 'sequelize';

export interface ProjectModulesAttributes {
  id: string;
  projectId: string;
  moduleId: string;
  expiresOn?: Date;
}

export type ProjectModulesCreationAttributes = Optional<
  ProjectModulesAttributes,
  "id"
>;

export class ProjectModules
  extends Model<ProjectModulesAttributes, ProjectModulesCreationAttributes>
  implements ProjectModulesAttributes
{
  public id!: string;
  public projectId!: string;
  public moduleId!: string;
  public expiresOn?: Date;

  static initModel(sequelize: Sequelize): typeof ProjectModules {
    ProjectModules.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "Projects",
            key: "projectId",
          },
          field: "project_id",
        },
        moduleId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "Modules",
            key: "id",
          },
          field: "module_id",
        },
        expiresOn: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "expires_on",
        },
      },
      {
        sequelize,
        tableName: "ProjectModules",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
      },
    );
    return ProjectModules;
  }
} 