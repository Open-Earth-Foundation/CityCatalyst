import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface ProjectAttributes {
  projectId: string;
  name: string;
  cityCountLimit: Number;
  description?: string;
  organizationId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type ProjectPk = "projectId";
export type ProjectId = Project[ProjectPk];
export type ProjectOptionalAttributes =
  | "description"
  | "created"
  | "lastUpdated";
export type ProjectCreationAttributes = Optional<
  ProjectAttributes,
  ProjectOptionalAttributes
>;

export class Project
  extends Model<ProjectAttributes, ProjectCreationAttributes>
  implements Partial<ProjectAttributes>
{
  organizationId!: string;
  cityCountLimit!: Number;
  projectId!: string;
  name!: string;
  description?: string;
  created?: Date;
  lastUpdated?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof Project {
    return Project.init(
      {
        projectId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "project_id",
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        cityCountLimit: {
          type: DataTypes.INTEGER,
          allowNull: false,
          field: "city_count_limit",
        },
        description: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        organizationId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "organization_id",
          references: {
            model: "Organization",
            key: "organization_id",
          },
        },
      },
      {
        sequelize,
        tableName: "Project",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "Project_pkey",
            unique: true,
            fields: ["project_id"],
          },
        ],
      },
    );
  }
}
