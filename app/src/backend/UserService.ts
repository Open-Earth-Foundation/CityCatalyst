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
import {
  hasOrgOwnerLevelAccess,
  hasProjectOwnerLevelAccess,
} from "@/backend/RoleBasedAccessService";
import { logger } from "@/services/logger";
import EmailService from "@/backend/EmailService";
import uniqBy from "lodash/uniqBy";

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
    include: Includeable[] = [],
  ): Promise<City> {
    const isAdmin = session?.user?.role === Roles.Admin;

    const city = await db.models.City.findOne({
      where: { cityId },
      include: [
        ...include,
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
    });

    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }
    if (isReadOnly || isAdmin) {
      return city;
    }
    if (!session) throw new createHttpError.Unauthorized("Not signed in");

    const hasOrgLevelAccess = await hasOrgOwnerLevelAccess(
      city.project?.organizationId,
      session.user.id,
    );

    if (hasOrgLevelAccess) {
      return city;
    }

    // Project admins are not CityUser members, but own every city in their project.
    const hasProjectLevelAccess = city.projectId
      ? await hasProjectOwnerLevelAccess(city.projectId, session.user.id)
      : false;
    if (hasProjectLevelAccess) {
      return city;
    }

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

    const hasProjectLevelAccess = inventory.city?.projectId
      ? await hasProjectOwnerLevelAccess(
          inventory.city.projectId,
          session.user.id,
        )
      : false;

    const hasNoCityAccess =
      inventory.city.users.length === 0 ||
      !session?.user?.id ||
      !inventory.city.users.map((u) => u.userId).includes(session?.user?.id);

    if (!hasOrgLevelAccess && !hasProjectLevelAccess && hasNoCityAccess) {
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

    if (inventory) {
      await db.models.User.update(
        {
          defaultInventoryId: inventory?.inventory_id,
        },
        { where: { userId } },
      );
      return inventory?.inventory_id;
    }

    const adminData = await db.models.OrganizationAdmin.findOne({
      where: {
        userId: userId,
      },
      include: {
        model: db.models.Organization,
        as: "organization",
        include: [
          {
            model: db.models.Project,
            as: "projects",
            include: [
              {
                model: db.models.City,
                as: "cities",
                include: [
                  {
                    model: db.models.Inventory,
                    as: "inventories",
                    attributes: ["inventoryId"],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    let newDefaultInventoryId: string | null = null;

    if (adminData) {
      // if the user is an org owner, they can pick any of the inventories belonging to his organization
      const inventories = adminData.organization.projects.flatMap((project) =>
        project.cities.flatMap((city) => city.inventories),
      );

      if (inventories.length > 0) {
        newDefaultInventoryId = inventories[0].inventoryId;
      }
    }

    if (newDefaultInventoryId) {
      await db.models.User.update(
        {
          defaultInventoryId: newDefaultInventoryId,
        },
        { where: { userId } },
      );
      return newDefaultInventoryId;
    }

    throw new createHttpError.NotFound("Inventory not found");
  }

  public static async updateDefaults(userId: string) {
    // First, try to find the most recent inventory for the user
    const [inventory] = (await db.sequelize!.query(
      `
            SELECT i.inventory_id, i.city_id
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
    )) as { inventory_id: string; city_id: string }[];

    if (inventory) {
      // User has an inventory, set both defaults
      await db.models.User.update(
        {
          defaultInventoryId: inventory?.inventory_id,
          defaultCityId: inventory?.city_id,
        },
        { where: { userId } },
      );
      return inventory?.inventory_id;
    }

    // No inventory found, but let's try to set a default city if possible
    const [city] = (await db.sequelize!.query(
      `
            SELECT c.city_id, c.name, c.created
            FROM "City" c
                     JOIN "CityUser" cu ON c.city_id = cu.city_id
            WHERE cu.user_id = :userId
            ORDER BY c.created DESC
        `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
      },
    )) as { city_id: string; name: string; created: string }[];

    if (city) {
      // User has a city but no inventory, set default city only
      await db.models.User.update(
        {
          defaultCityId: city?.city_id,
        },
        { where: { userId } },
      );

      return null; // No inventory to return
    }

    // If user is an org admin, try to find any city/inventory from their organization
    const adminData = await db.models.OrganizationAdmin.findOne({
      where: {
        userId: userId,
      },
      include: {
        model: db.models.Organization,
        as: "organization",
        include: [
          {
            model: db.models.Project,
            as: "projects",
            include: [
              {
                model: db.models.City,
                as: "cities",
                include: [
                  {
                    model: db.models.Inventory,
                    as: "inventories",
                    attributes: ["inventoryId"],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    if (adminData) {
      // if the user is an org owner, they can pick any of the inventories belonging to his organization
      const inventories = adminData.organization.projects.flatMap((project) =>
        project.cities.flatMap((city) => city.inventories),
      );

      if (inventories.length > 0) {
        const newDefaultInventoryId = inventories[0].inventoryId;
        // Find the city for this inventory
        const cityForInventory = adminData.organization.projects
          .flatMap((project) => project.cities)
          .find((city) =>
            city.inventories.some(
              (inv) => inv.inventoryId === newDefaultInventoryId,
            ),
          );

        await db.models.User.update(
          {
            defaultInventoryId: newDefaultInventoryId,
            defaultCityId: cityForInventory?.cityId || null,
          },
          { where: { userId } },
        );
        return newDefaultInventoryId;
      } else {
        // No inventories, but maybe there are cities
        const cities = adminData.organization.projects.flatMap(
          (project) => project.cities,
        );
        if (cities.length > 0) {
          await db.models.User.update(
            {
              defaultCityId: cities[0].cityId,
              defaultInventoryId: null,
            },
            { where: { userId } },
          );
          return null;
        }
      }
    }

    // No city or inventory found at all
    await db.models.User.update(
      {
        defaultCityId: null,
        defaultInventoryId: null,
      },
      { where: { userId } },
    );

    return null;
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

    if (!user.defaultInventoryId || !user.defaultCityId) {
      await UserService.updateDefaults(user.userId);
    }

    return user.defaultInventoryId!;
  }

  public static async findUserDefaultCity(
    session: AppSession | null,
  ): Promise<string> {
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const userId = session.user.id;
    const user = await db.models.User.findOne({
      attributes: ["defaultCityId", "userId"],
      where: {
        userId,
      },
    });
    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }

    if (!user.defaultCityId) {
      await UserService.updateDefaults(user.userId);
    }

    return user.defaultCityId!;
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

  public static async validateIsAdminOrOrgAdmin(
    session: AppSession | null,
    organizationId: string,
  ) {
    if (!session) throw new createHttpError.Forbidden("Forbidden");

    const adminUser = session.user.role === Roles.Admin;

    if (adminUser) {
      return;
    }

    const orgOwner = await db.models.OrganizationAdmin.findOne({
      where: { userId: session.user.id, organizationId: organizationId },
    });

    if (orgOwner) {
      return;
    }

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
          attributes: ["cityId", "name", "countryLocode", "country"],
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
            attributes: ["cityId", "name", "countryLocode", "country"],
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
        attributes: ["cityId", "name", "countryLocode", "country", "locode"],
        include: [
          {
            model: db.models.Project,
            as: "project",
            attributes: [
              "projectId",
              "name",
              "organizationId",
              "cityCountLimit",
              "description",
            ],
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

  /**
   * List projects (with cities) visible to the session user inside one organization.
   * Org/system admins see every project; project admins and collaborators are scoped.
   */
  public static async findUserProjectsAndCitiesInOrganization(
    organizationId: string,
    session: AppSession | null,
  ) {
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");

    // OEF admin and organization owner can see all projects
    const orgOwner =
      (await hasOrgOwnerLevelAccess(organizationId, session.user.id)) ||
      session.user.role === Roles.Admin;
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

    // Seed with projects the user administers (concat returns a new array — do not discard it).
    const projectsById: Record<string, ProjectWithCitiesResponse[0]> = {};
    for (const projectAdmin of projectAdminProjects) {
      const project = projectAdmin.project;
      if (!project) {
        continue;
      }
      projectsById[project.projectId] = {
        projectId: project.projectId,
        name: project.name,
        organizationId: project.organizationId,
        cityCountLimit: project.cityCountLimit,
        description: project.description,
        cities: (project.cities ?? []).map((city) => ({
          name: city.name as string,
          cityId: city.cityId as string,
          inventories: city.inventories as any,
          country: city.country as string,
          countryLocode: city.countryLocode as string,
          locode: city.locode as string,
        })),
      };
    }

    // Merge collaborator city memberships for this organization only.
    for (const { city } of cityUsersProjects) {
      const project = city?.project;
      if (!project || project.organizationId !== organizationId) {
        continue;
      }
      const projectId = project.projectId;
      if (!projectsById[projectId]) {
        projectsById[projectId] = {
          projectId,
          name: project.name,
          organizationId: project.organizationId,
          cityCountLimit: project.cityCountLimit,
          description: project.description,
          cities: [],
        };
      }
      const alreadyListed = projectsById[projectId].cities.some(
        (listed) => listed.cityId === city.cityId,
      );
      if (!alreadyListed) {
        projectsById[projectId].cities.push({
          name: city.name as string,
          cityId: city.cityId as string,
          inventories: city.inventories as any,
          country: city.country as string,
          countryLocode: city.countryLocode as string,
          locode: city.locode as string,
        });
      }
    }

    return Object.values(projectsById);
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

    const orgAdmins = await db.models.OrganizationAdmin.findAll({
      where: { organizationId: project.organizationId },
      include: [
        {
          model: db.models.User,
          as: "user",
        },
      ],
    });

    const invitedEmails = new Set(orgInvites.map((invite) => invite.email));

    const dedupedOrgAdmin: {
      email: string;
      status: InviteStatus;
      role: OrganizationRole;
    }[] = orgAdmins
      .filter((orgAdmin) => !invitedEmails.has(orgAdmin.user.email))
      .map((orgAdmin) => ({
        email: orgAdmin.user.email as string,
        status: InviteStatus.ACCEPTED,
        role: OrganizationRole.ORG_ADMIN,
      }));

    users.push(
      ...orgInvites.map((invite) => ({
        email: invite?.email as string,
        status: invite?.status as InviteStatus,
        role: OrganizationRole.ORG_ADMIN,
      })),
      ...dedupedOrgAdmin,
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

    const cityUsersData = await db.models.CityUser.findAll({
      include: [
        {
          model: db.models.User,
          as: "user",
        },
        {
          model: db.models.City,
          as: "city",
          where: {
            projectId,
          },
        },
      ],
    });

    const cityUsers = cityUsersData.map((cityUser) => ({
      email: cityUser.user.email as string,
      status: InviteStatus.ACCEPTED,
      role: OrganizationRole.COLLABORATOR,
      cityId: cityUser.cityId as string,
    }));

    const cityInvites = cities.flatMap((city) =>
      city.cityInvites.map((invite) => ({
        email: invite?.email as string,
        status: invite?.status as InviteStatus,
        role: OrganizationRole.COLLABORATOR,
        cityId: city.cityId as string,
      })),
    );

    users.push(...cityUsers, ...cityInvites);
    return uniqBy(users, "email");
  }

  public static async removeUserFromProject(projectId: string, email: string) {
    const project = await Project.findByPk(projectId, {
      include: [
        {
          model: db.models.Organization,
          as: "organization",
          include: [
            {
              model: db.models.Theme,
              as: "theme",
            },
          ],
        },
      ],
    });

    if (!project) {
      throw new createHttpError.NotFound("project-not-found");
    }

    const user = await User.findOne({ where: { email } });
    const cities = await City.findAll({
      where: { projectId },
      include: [
        {
          model: db.models.Project,
          as: "project",
          include: [
            {
              model: db.models.Organization,
              as: "organization",
              include: [
                {
                  model: db.models.Theme,
                  as: "theme",
                },
              ],
            },
          ],
        },
      ],
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

        EmailService.sendChangeToCityAccessNotification({
          cities: cities as City[],
          email: user ? (user.email as string) : email,
          brandInformation: {
            logoUrl: project.organization.logoUrl || "",
            color: project.organization.theme?.primaryColor,
          },
          user: user,
        });
      });
    } catch (error) {
      logger.error(
        { projectId, email, err: error },
        "Error removing user from project",
      );
      throw new createHttpError.InternalServerError(
        "failed-to-remove-user-from-project",
      );
    }

    // remove from project admin
    return true;
  }

  public static async removeUserFromCity(cityId: string, email: string) {
    const city = await City.findByPk(cityId as string, {
      include: [
        {
          model: db.models.Project,
          as: "project",
          include: [
            {
              model: db.models.Organization,
              as: "organization",
              include: [
                {
                  model: db.models.Theme,
                  as: "theme",
                  attributes: ["primaryColor"],
                },
              ],
            },
          ],
        },
      ],
    });

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

        EmailService.sendChangeToCityAccessNotification({
          cities: [city],
          email: user ? (user.email as string) : email,
          brandInformation: {
            logoUrl: city.project.organization.logoUrl || "",
            color: city.project.organization.theme?.primaryColor,
          },
          user: user,
        });
      });
    } catch (error) {
      logger.error({ err: error }, "Error removing user from project:");
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
      logger.error({ err: error }, "Error removing user from project:");
      throw new createHttpError.InternalServerError(
        "failed-to-remove-organization-owner",
      );
    }
  }

  /**
   * Summarize the user's highest-privilege access path and the related org/project
   * IDs used by navigation (e.g. All projects drawer link).
   */
  public static async findUserAccessStatus(userId: string) {
    const responseObject: {
      isOrgOwner: boolean;
      isProjectAdmin: boolean;
      isCollaborator: boolean;
      organizationId: string | null;
      projectId: string | null;
    } = {
      isOrgOwner: false,
      isProjectAdmin: false,
      isCollaborator: false,
      organizationId: null,
      projectId: null,
    };

    const user = await db.models.User.findOne({ where: { userId } });
    // System admins are treated as org owners for UI gates, without a single org.
    if (user?.role === Roles.Admin) {
      responseObject.isOrgOwner = true;
      return responseObject;
    }

    // TODO a user can own multiple organizations now
    const orgOwner = await db.models.OrganizationAdmin.findOne({
      where: { userId },
    });
    if (orgOwner) {
      responseObject.isOrgOwner = true;
      responseObject.organizationId = orgOwner.organizationId;
      return responseObject;
    }

    // TODO might be able to have multiple project admin roles as well
    const projectAdmin = await db.models.ProjectAdmin.findOne({
      where: { userId },
      include: [
        {
          model: db.models.Project,
          as: "project",
          attributes: ["projectId", "organizationId"],
        },
      ],
    });
    if (projectAdmin) {
      responseObject.isProjectAdmin = true;
      responseObject.projectId = projectAdmin.projectId;
      responseObject.organizationId =
        projectAdmin.project?.organizationId ?? null;
      return responseObject;
    }

    // Collaborators only have CityUser rows — resolve org/project via city.
    const collaborator = await db.models.CityUser.findOne({
      where: { userId },
      include: [
        {
          model: db.models.City,
          as: "city",
          attributes: ["cityId", "projectId"],
          include: [
            {
              model: db.models.Project,
              as: "project",
              attributes: ["projectId", "organizationId"],
            },
          ],
        },
      ],
    });
    if (collaborator) {
      responseObject.isCollaborator = true;
      responseObject.projectId =
        collaborator.city?.project?.projectId ??
        collaborator.city?.projectId ??
        null;
      responseObject.organizationId =
        collaborator.city?.project?.organizationId ?? null;
      return responseObject;
    }
    return responseObject;
  }

  public async fetchUserProjects(userId: string) {}

  public static ensureIsAdmin(session: AppSession | null) {
    // Ensure user is signed in
    const isSignedIn = !!session?.user;
    if (!isSignedIn) {
      throw new createHttpError.Unauthorized("Not signed in");
    }

    // Ensure user has admin role
    const isAdmin = session?.user?.role === Roles.Admin;
    if (!isAdmin) {
      throw new createHttpError.Unauthorized(
        "Not signed in as an admin: " + session?.user?.role,
      );
    }
  }
}
