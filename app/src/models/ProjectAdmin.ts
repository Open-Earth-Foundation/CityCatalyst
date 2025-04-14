import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { Project } from "@/models/Project";

// TODO this table can be extended for all project level roles.

export interface ProjectAdminAttributes {
  projectAdminId: string;
  projectId: string;
  userId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type ProjectAdminPk = "projectAdminId";
export type ProjectAdminId = ProjectAdmin[ProjectAdminPk];
export type ProjectAdminOptionalAttributes = "created" | "lastUpdated";
export type ProjectAdminCreationAttributes = Optional<
  ProjectAdminAttributes,
  ProjectAdminOptionalAttributes
>;

export class ProjectAdmin
  extends Model<ProjectAdminAttributes, ProjectAdminCreationAttributes>
  implements ProjectAdminAttributes
{
  projectAdminId!: string;
  projectId!: string;
  userId!: string;
  created?: Date;
  lastUpdated?: Date;

  project!: Project;

  static initModel(sequelize: Sequelize.Sequelize): typeof ProjectAdmin {
    return ProjectAdmin.init(
      {
        projectAdminId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "project_admin_id",
        },
        projectId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "project_id",
          references: {
            model: "Project",
            key: "project_id",
          },
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "user_id",
          references: {
            model: "User",
            key: "user_id",
          },
        },
      },
      {
        sequelize,
        tableName: "ProjectAdmin",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "ProjectAdmin_pkey",
            unique: true,
            fields: ["project_admin_id"],
          },
        ],
      },
    );
  }
}
