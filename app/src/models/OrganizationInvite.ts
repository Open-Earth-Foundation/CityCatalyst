import * as Sequelize from "sequelize";
import { Model, Optional } from "sequelize";
import { Organization, OrganizationId } from "./Organization";
import { User, UserId } from "./User";
import { InviteStatus, OrganizationRole } from "@/util/types";

export interface OrganizationInviteAttributes {
  id: string;
  organizationId?: string;
  userId?: string;
  email?: string;
  status?: InviteStatus;
  role?: OrganizationRole;
  created?: Date;
  lastUpdated?: Date;
}

export type OrganizationInvitePk = "id";
export type OrganizationInviteId = OrganizationInvite[OrganizationInvitePk];
export type OrganizationInviteCreationAttributes = Optional<
  OrganizationInviteAttributes,
  OrganizationInviteOptionalAttributes
>;
export type OrganizationInviteOptionalAttributes =
  | "organizationId"
  | "userId"
  | "email"
  | "status"
  | "role"
  | "created"
  | "lastUpdated";

export class OrganizationInvite
  extends Model<
    OrganizationInviteAttributes,
    OrganizationInviteCreationAttributes
  >
  implements OrganizationInviteAttributes
{
  id!: string;
  organizationId?: string;
  userId?: string;
  email?: string;
  status?: InviteStatus;
  created?: Date;
  lastUpdated?: Date;
  role?: OrganizationRole;

  //   OrganizationInvite belongs to Organization via organizationId
  organization!: Organization;
  getOrganization!: Sequelize.BelongsToGetAssociationMixin<Organization>;
  setOrganization!: Sequelize.BelongsToSetAssociationMixin<
    Organization,
    OrganizationId
  >;
  createOrganization!: Sequelize.BelongsToCreateAssociationMixin<Organization>;

  //   OrganizationInvite belongs to User via userId
  user!: User;
  getUser!: Sequelize.BelongsToGetAssociationMixin<User>;
  setUser!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

  static initModel(sequelize: Sequelize.Sequelize): typeof OrganizationInvite {
    return OrganizationInvite.init(
      {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          allowNull: false,
          primaryKey: true,
        },
        organizationId: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: "Organizations",
            key: "organization_id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        email: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        userId: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: "User",
            key: "user_id",
          },
        },
        status: {
          type: Sequelize.ENUM("pending", "accepted", "canceled", "expired"),
          allowNull: false,
        },
        role: {
          type: Sequelize.ENUM("admin", "collaborator"),
          allowNull: false,
        },
      },
      {
        sequelize,
        underscored: true,
        tableName: "OrganizationInvite",
        schema: "public",
        timestamps: true,
        createdAt: "created",
        updatedAt: "last_updated",
        indexes: [
          {
            name: "OrganizationInvite_pkey",
            unique: true,
            fields: [{ name: "id" }],
          },
          {
            name: "OrganizationInvite_email_index",
            fields: [{ name: "email" }],
          },
          {
            name: "OrganizationInvite_inviting_user_id_index",
            fields: [{ name: "inviting_user_id" }],
          },
          {
            name: "OrganizationInvite_user_id_index",
            fields: [{ name: "user_id" }],
          },
        ],
      },
    );
  }
}
