import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import { Project } from "@/models/Project";
import { Theme } from "@/models/Theme";

export interface OrganizationAttributes {
  organizationId: string;
  name?: string;
  contactEmail?: string;
  created?: Date;
  lastUpdated?: Date;
  themeId?: string | null;
  logoUrl?: string | null;
  active: boolean;
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
  declare organizationId: string;
  declare name?: string;
  declare contactEmail?: string;
  declare created?: Date;
  declare lastUpdated?: Date;
  declare themeId?: string | null;
  declare logoUrl?: string | null;
  declare active: boolean;
  declare theme: Theme;
  declare projects: Project[];

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
        active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        themeId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "theme_id",
          references: {
            model: "Theme",
            key: "theme_id",
          },
        },
        logoUrl: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "logo_url",
        },
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
