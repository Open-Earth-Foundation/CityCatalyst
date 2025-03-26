import { db } from "@/models";
import createHttpError from "http-errors";

import { ProjectWithCitiesResponse, Roles } from "@/util/types";
import { type AppSession } from "@/lib/auth";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { User } from "@/models/User";
import { Includeable, QueryTypes } from "sequelize";
import { UserFile } from "@/models/UserFile";
import { Project } from "@/models/Project";
import { hasOrgLevelAccess } from "@/backend/RoleBasedAccessService";

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

    if (
      inventory.city.users.length === 0 ||
      !session?.user?.id ||
      !inventory.city.users.map((u) => u.userId).includes(session?.user?.id)
    ) {
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
    if (userFile.city.users.length === 0) {
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

  public static async findUserProjectsAndCitiesInOrganization(
    organizationId: string,
    session: AppSession | null,
  ) {
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");

    // OEF admin and organization owner can see all projects
    const orgOwner = await hasOrgLevelAccess(organizationId, session.user.id);
    if (session.user.role == Roles.Admin || orgOwner) {
      return await Project.findAll({
        where: { organizationId },
        attributes: ["projectId", "name"],
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
      });
    }

    // Project admin can see projects they are admin of and the cities in those projects
    const projectsAndCities: ProjectWithCitiesResponse = [];
    const projectAdmin = await db.models.ProjectAdmin.findAll({
      where: { userId: session.user.id },
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

    // @ts-ignore
    projectsAndCities.concat(projectAdmin.map((pa) => pa.project));

    //Collaborators can see projects they are part of and the cities in those projects
    const cityUsersProjects = await db.models.CityUser.findAll({
      where: { userId: session.user.id },
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
    const groupedByProject: Record<string, ProjectWithCitiesResponse[0]> = {};

    for (const cu of cityUsersProjects) {
      const projectName = cu.city.project.name;
      const projectId = cu.city.project.projectId;
      if (!groupedByProject[projectId]) {
        groupedByProject[projectId] = {
          projectId,
          name: projectName,
          cities: [],
        };
      }
      groupedByProject[projectId].cities.push({
        name: cu.city.name as string,
        cityId: cu.city.cityId as string,
        inventories: cu.city.inventories as any,
      });
    }

    return projectsAndCities.concat(Object.values(groupedByProject));
  }
}
