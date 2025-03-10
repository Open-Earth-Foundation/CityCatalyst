import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface ProjectAttributes {
  projectId: string;
  name: string;
  city_limit: Number;
  description?: string;
  organizationId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProjectPk = "projectId";
export type ProjectId = Project[ProjectPk];
export type ProjectOptionalAttributes =
  | "description"
  | "createdAt"
  | "updatedAt";
export type ProjectCreationAttributes = Optional<
  ProjectAttributes,
  ProjectOptionalAttributes
>;

export class Project
  extends Model<ProjectAttributes, ProjectCreationAttributes>
  implements ProjectAttributes
{
  organizationId!: string;
  city_limit!: Number;
  projectId!: string;
  name!: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof Project {
    return Project.init(
      {
        projectId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "organization_id",
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        city_limit: {
          type: DataTypes.INTEGER,
          allowNull: false,
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
        createdAt: "createdAt",
        updatedAt: "updatedAt",
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
