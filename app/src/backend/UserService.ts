import { db } from "@/models";
import createHttpError from "http-errors";

import {
  InviteStatus,
  OrganizationRole,
  ProjectWithCitiesResponse,
  Roles,
} from "@/util/types";
import { type AppSession } from "@/lib/auth";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { User } from "@/models/User";
import { Includeable, QueryTypes, Transaction } from "sequelize";
import { UserFile } from "@/models/UserFile";
import { Project } from "@/models/Project";
import { hasOrgOwnerLevelAccess } from "@/backend/RoleBasedAccessService";

export default class UserService {
  public static async findUser(
    userId: string,
    session: AppSession | null,
    include?: Includeable | Includeable[],
  ): Promise<User> {
    if (
      !session ||
      (session.user.role !== Roles.Admin && userId !== session.user.id)
    ) {
      throw new createHttpError.Unauthorized(
        "Not signed in as the requested user",
      );
    }

    const user = await db.models.User.findOne({ where: { userId }, include });
    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }

    return user;
  }

  /**
   * Load city information and perform access control
   */
  public static async findUserCity(
    cityId: string,
    session: AppSession | null,
    isReadOnly: boolean = false,
  ): Promise<City> {
    const isAdmin = session?.user?.role === Roles.Admin;

    const city = await db.models.City.findOne({
      where: { cityId },
      include: [
        {
          model: db.models.User,
          as: "users",
        },
      ],
    });

    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }
    if (isReadOnly || isAdmin) {
      return city;
    }
    if (!session) throw new createHttpError.Unauthorized("Not signed in");
    if (
      (city.users.length === 0 ||
        !city.users.map((u) => u.userId).includes(session?.user?.id)) &&
      !isAdmin
    ) {
      throw new createHttpError.Unauthorized("User is not part of this city");
    }

    return city;
  }

  /**
   * Load inventory information and perform access control
   */
  public static async findUserInventory(
    inventoryId: string,
    session: AppSession | null,
    include: Includeable[] = [],
    isReadOnly: boolean = false,
  ): Promise<Inventory> {
    const isAdmin = session?.user?.role === Roles.Admin;
    const inventory = await db.models.Inventory.findOne({
      where: { inventoryId },
      include: [
        ...include,
        {
          model: db.models.City,
          as: "city",
          required: true,
          include: [
            {
              model: db.models.User,
              as: "users",
            },
            {
              model: db.models.Project,
              as: "project",
              include: [
                {
                  model: db.models.Organization,
                  as: "organization",
                  attributes: ["organizationId", "name"],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    if ((inventory?.isPublic && isReadOnly) || isAdmin) {
      return inventory;
    }

    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const hasOrgLevelAccess = await hasOrgOwnerLevelAccess(
      inventory.city?.project?.organizationId,
      session.user?.id,
    );

    const hasNoCityAccess =
      inventory.city.users.length === 0 ||
      !session?.user?.id ||
      !inventory.city.users.map((u) => u.userId).includes(session?.user?.id);

    if (!hasOrgLevelAccess && hasNoCityAccess) {
      throw new createHttpError.Unauthorized(
        "User is not part of this inventory's city",
      );
    }

    return inventory;
  }

  public static async updateDefaultInventoryId(userId: string) {
    const [inventory] = (await db.sequelize!.query(
      `
            SELECT i.inventory_id
            FROM "Inventory" i
                     JOIN "CityUser" cu ON i.city_id = cu.city_id
            WHERE cu.user_id = :userId
            ORDER BY i.last_updated DESC
            LIMIT 1
        `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
      },
    )) as { inventory_id: string }[];
    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }
    await db.models.User.update(
      {
        defaultInventoryId: inventory?.inventory_id,
      },
      { where: { userId } },
    );
    return inventory?.inventory_id;
  }

  /**
   * Load inventory information and perform access control
   */
  public static async findUserDefaultInventory(
    session: AppSession | null,
  ): Promise<string> {
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const userId = session.user.id;
    const user = await db.models.User.findOne({
      attributes: ["defaultInventoryId", "userId"],
      where: {
        userId,
      },
    });
    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }

    if (!user.defaultInventoryId) {
      await UserService.updateDefaultInventoryId(user.userId);
    }
    if (!user.defaultInventoryId) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    return user.defaultInventoryId;
  }

  /**
   * Load inventory information and perform access control
   */
  public static async findUserFile(
    fileId: string,
    cityId: string,
    session: AppSession | null,
    include: Includeable[] = [],
  ): Promise<UserFile> {
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const isAdmin = session.user.role === Roles.Admin;
    const userFile = await db.models.UserFile.findOne({
      include: [
        ...include,
        {
          model: db.models.City,
          as: "city",
          required: true,
          include: [
            {
              model: db.models.Project,
              as: "project",
              include: [
                {
                  model: db.models.Organization,
                  as: "organization",
                  attributes: ["organizationId", "name"],
                },
              ],
            },
            {
              model: db.models.User,
              as: "users",
              where: { userId: isAdmin ? undefined : session?.user.id },
            },
          ],
        },
      ],
      where: { id: fileId, cityId },
    });

    if (!userFile) {
      throw new createHttpError.NotFound("User file not found");
    }

    const hasOrgLevelAccess = await hasOrgOwnerLevelAccess(
      userFile.city?.project?.organizationId,
      session.user.id,
    );

    if (userFile.city.users.length === 0 && !hasOrgLevelAccess) {
      throw new createHttpError.Unauthorized(
        "User is not part of this inventory's city",
      );
    }
    return userFile;
  }

  public static validateIsAdmin(session: AppSession | null) {
    if (!session || session.user.role !== Roles.Admin)
      throw new createHttpError.Forbidden("Forbidden");
  }

  private static async findAllProjectForAdminAndOwner(organizationId: string) {
    return await Project.findAll({
      where: { organizationId },
      attributes: ["projectId", "name", "description", "cityCountLimit"],
      include: [
        {
          model: db.models.ProjectAdmin,
          as: "projectAdmins",
          attributes: ["userId"],
          include: [
            {
              model: db.models.User,
              as: "user",
              attributes: ["userId", "name", "email"],
            },
          ],
        },
        {
          model: db.models.City,
          as: "cities",
          attributes: ["cityId", "name"],
          include: [
            {
              model: db.models.Inventory,
              as: "inventories",
              attributes: ["year", "inventoryId", "lastUpdated"],
            },
          ],
        },
      ],
    });
  }

  private static async findAllProjectForProjectAdmin(
    userId: string,
    organizationId: string,
  ) {
    return await db.models.ProjectAdmin.findAll({
      where: { userId },
      include: {
        model: db.models.Project,
        as: "project",
        where: { organizationId },
        include: [
          {
            model: db.models.City,
            as: "cities",
            attributes: ["cityId", "name"],
            include: [
              {
                model: db.models.Inventory,
                as: "inventories",
                attributes: ["year", "inventoryId", "lastUpdated"],
              },
            ],
          },
        ],
      },
    });
  }

  private static async findAllProjectForCollaborators(userId: string) {
    return await db.models.CityUser.findAll({
      where: { userId },
      attributes: [],
      include: {
        model: db.models.City,
        as: "city",
        attributes: ["cityId", "name"],
        include: [
          {
            model: db.models.Project,
            as: "project",
            attributes: ["projectId", "name"],
          },
          {
            model: db.models.Inventory,
            as: "inventories",
            attributes: ["year", "inventoryId", "lastUpdated"],
          },
        ],
      },
    });
  }

  public static async findUserProjectsAndCitiesInOrganization(
    organizationId: string,
    session: AppSession | null,
  ) {
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");

    // OEF admin and organization owner can see all projects
    const orgOwner = await hasOrgOwnerLevelAccess(
      organizationId,
      session.user.id,
    );
    if (session.user.role == Roles.Admin || orgOwner) {
      return await UserService.findAllProjectForAdminAndOwner(organizationId);
    }

    const [projectAdminProjects, cityUsersProjects] = await Promise.all([
      UserService.findAllProjectForProjectAdmin(
        session.user.id,
        organizationId,
      ),
      UserService.findAllProjectForCollaborators(session.user.id),
    ]);

    // Project admin can see projects they are admin of and the cities in those projects
    const projectsAndCities: ProjectWithCitiesResponse = [];

    // @ts-ignore
    projectsAndCities.concat(projectAdminProjects.map((pa) => pa.project));

    const groupedByProject: Record<string, ProjectWithCitiesResponse[0]> = {};

    for (const { city } of cityUsersProjects) {
      const projectName = city.project.name;
      const projectId = city.project.projectId;
      if (!groupedByProject[projectId]) {
        groupedByProject[projectId] = {
          projectId,
          name: projectName,
          cityCountLimit: city.project.cityCountLimit,
          cities: [],
        };
      }
      groupedByProject[projectId].cities.push({
        name: city.name as string,
        cityId: city.cityId as string,
        inventories: city.inventories as any,
      });
    }

    return projectsAndCities.concat(Object.values(groupedByProject));
  }

  public static async findUsersInProject(projectId: string) {
    const project = await Project.findByPk(projectId as string);
    if (!project) {
      throw new createHttpError.NotFound("project-not-found");
    }

    const users: {
      email: string;
      status: InviteStatus;
      role: OrganizationRole;
      cityId?: string;
    }[] = [];

    // org level users
    const orgInvites = await db.models.OrganizationInvite.findAll({
      where: { organizationId: project.organizationId },
    });

    users.push(
      ...orgInvites.map((invite) => ({
        email: invite?.email as string,
        status: invite?.status as InviteStatus,
        role: OrganizationRole.ORG_ADMIN,
      })),
    );

    // project level users
    const projectInvites = await db.models.ProjectInvite.findAll({
      where: { projectId },
    });
    users.push(
      ...projectInvites.map((invite) => ({
        email: invite?.email as string,
        status: invite?.status as InviteStatus,
        role: OrganizationRole.ADMIN,
      })),
    );

    // city collaborators level users -invites only.
    const cities = await db.models.City.findAll({
      where: { projectId },
      include: [
        {
          model: db.models.CityInvite,
          as: "cityInvites",
          attributes: ["email", "status"],
        },
      ],
    });

    const cityInvites = cities.flatMap((city) =>
      city.cityInvites.map((invite) => ({
        email: invite?.email as string,
        status: invite?.status as InviteStatus,
        role: OrganizationRole.COLLABORATOR,
        cityId: city.cityId as string,
      })),
    );

    users.push(...cityInvites);

    return users;
  }

  public static async removeUserFromProject(projectId: string, email: string) {
    const project = await Project.findByPk(projectId as string);

    if (!project) {
      throw new createHttpError.NotFound("project-not-found");
    }

    const user = await User.findOne({ where: { email } });
    const cities = await City.findAll({
      where: { projectId },
      attributes: ["cityId"],
      raw: true,
    });
    const cityIds = cities.map((city) => city.cityId);

    try {
      await db.sequelize?.transaction(async (t: Transaction) => {
        if (user) {
          // remove on project level
          await db.models.ProjectAdmin.destroy({
            where: {
              projectId: projectId,
              userId: user.userId,
            },
            transaction: t,
          });
          await db.models.CityUser.destroy({
            where: {
              cityId: cityIds,
              userId: user.userId,
            },
            transaction: t,
          });
        }
        await db.models.ProjectInvite.destroy({
          where: {
            projectId: projectId,
            email: email,
          },
          transaction: t,
        });
        await db.models.CityInvite.destroy({
          where: {
            cityId: cityIds,
            email: email,
          },
          transaction: t,
        });
      });
    } catch (error) {
      console.error("Error removing user from project:", error);
      throw new createHttpError.InternalServerError(
        "failed-to-remove-user-from-project",
      );
    }

    // remove from project admin
    return true;
  }

  public static async removeUserFromCity(cityId: string, email: string) {
    const city = await City.findByPk(cityId as string);

    if (!city) {
      throw new createHttpError.NotFound("city-not-found");
    }

    const user = await User.findOne({ where: { email } });

    try {
      await db.sequelize?.transaction(async (t: Transaction) => {
        if (user) {
          // remove on project level
          await db.models.CityUser.destroy({
            where: {
              cityId: cityId,
              userId: user.userId,
            },
            transaction: t,
          });
        }
        await db.models.CityInvite.destroy({
          where: {
            cityId: cityId,
            email: email,
          },
          transaction: t,
        });
      });
    } catch (error) {
      console.error("Error removing user from project:", error);
      throw new createHttpError.InternalServerError(
        "failed-to-remove-user-from-city",
      );
    }

    return true;
  }

  public static async removeOrganizationOwner(
    organizationId: string,
    email: string,
  ) {
    const user = await User.findOne({ where: { email } });
    try {
      await db.sequelize?.transaction(async (t: Transaction) => {
        if (user) {
          // remove on project level
          await db.models.OrganizationAdmin.destroy({
            where: {
              userId: user.userId,
              organizationId: organizationId,
            },
            transaction: t,
          });
        }
        await db.models.OrganizationInvite.destroy({
          where: {
            email: email,
          },
          transaction: t,
        });
      });
    } catch (error) {
      console.error("Error removing user from project:", error);
      throw new createHttpError.InternalServerError(
        "failed-to-remove-organization-owner",
      );
    }
  }

  public static async findUserAccessStatus(userId: string) {
    const responseObject = {
      isOrgOwner: false,
      isProjectAdmin: false,
      isCollaborator: false,
    };

    const orgOwner = await db.models.OrganizationAdmin.findOne({
      where: { userId },
    });
    if (orgOwner) {
      responseObject.isOrgOwner = true;
      return responseObject;
    }
    const projectAdmin = await db.models.ProjectAdmin.findOne({
      where: { userId },
    });
    if (projectAdmin) {
      responseObject.isProjectAdmin = true;
      return responseObject;
    }

    const collaborator = await db.models.CityUser.findOne({
      where: { userId },
    });
    if (collaborator) {
      responseObject.isCollaborator = true;
      return responseObject;
    }
    return responseObject;
  }

  public async fetchUserProjects(userId: string) {}
}
