import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface OrganizationAttributes {
  organizationId: string;
  name?: string;
  contactEmail?: string;
  contactNumber?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OrganizationPk = "organizationId";
export type OrganizationId = Organization[OrganizationPk];
export type OrganizationOptionalAttributes =
  | "contactNumber"
  | "createdAt"
  | "updatedAt";
export type OrganizationCreationAttributes = Optional<
  OrganizationAttributes,
  OrganizationOptionalAttributes
>;

export class Organization
  extends Model<OrganizationAttributes, OrganizationCreationAttributes>
  implements OrganizationAttributes
{
  organizationId!: string;
  name?: string;
  contactEmail?: string;
  contactNumber?: string;
  createdAt?: Date;
  updatedAt?: Date;

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
        contactNumber: {
          type: DataTypes.STRING(255),
          allowNull: true,
          field: "contact_number",
        },
      },
      {
        sequelize,
        tableName: "Organization",
        schema: "public",
        timestamps: true,
        createdAt: "createdAt",
        updatedAt: "updatedAt",
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
