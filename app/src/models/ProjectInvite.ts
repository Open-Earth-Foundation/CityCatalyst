import {InviteStatus} from "@/util/types";
import {Model, Optional} from "sequelize";
import {User, UserId} from "@/models/User";
import * as Sequelize from "sequelize";


export interface ProjectInviteAttributes {
    id: string;
    projectId?: string;
    userId?: string;
    email?: string;
    status?: InviteStatus;
    created?: Date;
    lastUpdated?: Date;
}

export type ProjectInvitePk = "id";
export type ProjectInviteId = ProjectInvite[ProjectInvitePk];
export type ProjectInviteCreationAttributes = Optional<
   ProjectInviteAttributes,
    ProjectInviteOptionalAttributes
>;
export type ProjectInviteOptionalAttributes =
    | "projectId"
    | "userId"
    | "email"
    | "status"
    | "created"
    | "lastUpdated";



export class ProjectInvite
    extends Model<
        ProjectInviteAttributes,
        ProjectInviteCreationAttributes
    >
    implements Partial<ProjectInviteAttributes>
{
    id!: string;
    projectId?: string;
    userId?: string;
    email?: string;
    status?: InviteStatus;
    created?: Date;
    lastUpdated?: Date;

    //   ProjectInvite belongs to Project via projectId
    project!: Project;
    getProject!: Sequelize.BelongsToGetAssociationMixin<Project>;
    setProject!: Sequelize.BelongsToSetAssociationMixin<Project, string>;

    //   ProjectInvite belongs to OrganizationInvite via projectId
    //   OrganizationInvite belongs to User via userId
    user!: User;
    getUser!: Sequelize.BelongsToGetAssociationMixin<User>;
    setUser!: Sequelize.BelongsToSetAssociationMixin<User, UserId>;

    static initModel(sequelize: Sequelize.Sequelize): typeof ProjectInvite {
        return ProjectInvite.init(
            {
                id: {
                    type: Sequelize.UUID,
                    defaultValue: Sequelize.UUIDV4,
                    primaryKey: true,
                },
                projectId: {
                    type: Sequelize.DataTypes.UUID,
                    allowNull: true,
                    references: {
                        model: "Project",
                        key: "project_id",
                    },
                },
                userId: {
                    type: Sequelize.UUID,
                    allowNull: true,
                    references: {
                        model: "User",
                        key: "user_id",
                    },
                },
                email: {
                    type: Sequelize.STRING,
                    allowNull: true,
                },
                status: {
                    type: Sequelize.ENUM("pending", "accepted", "canceled", "expired"),
                    allowNull: false,
                },
                created: {
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.NOW,
                },
                lastUpdated: {
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.NOW,
                },
            },
            {
                sequelize,
                underscored: true,
                tableName: "ProjectInvite",
                schema: "public",
                timestamps: true,
                createdAt: "created",
                updatedAt: "last_updated",
                indexes: [
                    {
                        name: "ProjectInvite_pkey",
                        unique: true,
                        fields: [{ name: "id" }],
                    },
                    {
                        name: "ProjectInvite_email_index",
                        fields: [{ name: "email" }],
                    },
                    {
                        name: "ProjectInvite_user_id_index",
                        fields: [{ name: "user_id" }],
                    },
                ],
            },
        );
    }
}