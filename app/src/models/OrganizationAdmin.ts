import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";

export interface OrganizationAdminAttributes {
  organizationAdminId: string;
  organizationId: string;
  userId: string;
  created?: Date;
  lastUpdated?: Date;
}

export type OrganizationAdminPk = "organizationAdminId";
export type OrganizationAdminId = OrganizationAdmin[OrganizationAdminPk];
export type OrganizationAdminOptionalAttributes = "created" | "lastUpdated";
export type OrganizationAdminCreationAttributes = Optional<
  OrganizationAdminAttributes,
  OrganizationAdminOptionalAttributes
>;

export class OrganizationAdmin
  extends Model<
    OrganizationAdminAttributes,
    OrganizationAdminCreationAttributes
  >
  implements OrganizationAdminAttributes
{
  organizationAdminId!: string;
  organizationId!: string;
  userId!: string;
  created?: Date;
  lastUpdated?: Date;

  static initModel(sequelize: Sequelize.Sequelize): typeof OrganizationAdmin {
    return OrganizationAdmin.init(
      {
        organizationAdminId: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
          field: "organization_admin_id",
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
        tableName: "OrganizationAdmin",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "OrganizationAdmin_pkey",
            unique: true,
            fields: ["organization_admin_id"],
          },
        ],
      },
    );
  }
}
