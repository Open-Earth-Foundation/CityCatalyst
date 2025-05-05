import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { Project } from "@/models/Project";

export interface OrganizationAttributes {
  organizationId: string;
  name?: string;
  contactEmail?: string;
  created?: Date;
  lastUpdated?: Date;
  themeId?: string;
  logoUrl?: string;
}

export type OrganizationPk = "organizationId";
export type OrganizationId = Organization[OrganizationPk];
export type OrganizationOptionalAttributes = "created" | "lastUpdated";
export type OrganizationCreationAttributes = Optional<
  OrganizationAttributes,
  OrganizationOptionalAttributes
>;

export class Organization
  extends Model<OrganizationAttributes, OrganizationCreationAttributes>
  implements Partial<OrganizationAttributes>
{
  organizationId!: string;
  name?: string;
  contactEmail?: string;
  created?: Date;
  lastUpdated?: Date;
  themeId?: string;
  logoUrl?: string;

  theme: Theme;
  projects!: Project[];

  static initModel(sequelize: Sequelize.Sequelize): typeof Organization {
    return Organization.init(
      {
        organizationId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "organization_id",
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        contactEmail: {
          type: DataTypes.STRING(255),
          allowNull: false,
          field: "contact_email",
        },
        themeId: {},
      },
      {
        sequelize,
        tableName: "Organization",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "Organization_pkey",
            unique: true,
            fields: ["organization_id"],
          },
        ],
      },
    );
  }
}
