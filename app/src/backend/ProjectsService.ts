import { db } from "@/models";
import { logger } from "@/services/logger";
import { uniqBy } from "lodash";
import { ProjectWithCities } from "@/util/types";

interface ProjectInfo {
  projectId: string;
  name: string;
  organizationId: string;
  description?: string | null;
  cityCountLimit?: Number;
}

export class ProjectService {
  public static async fetchUserProjects(
    userId: string,
  ): Promise<ProjectWithCities[]> {
    // perform access control
    await db.models.User.findByPk(userId, {});

    const projectAdminAssociations = await db.models.ProjectAdmin.findAll({
      where: {
        userId: userId,
      },
      include: [
        {
          model: db.models.Project,
          as: "project",
          include: [
            {
              model: db.models.City,
              as: "cities",
              include: [
                {
                  model: db.models.Inventory,
                  as: "inventories",
                },
              ],
            },
          ],
        },
      ],
    });

    const organizationAdminAssociations =
      await db.models.OrganizationAdmin.findAll({
        where: {
          userId: userId,
        },
        include: [
          {
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
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

    const cityUserAssociations = await db.models.CityUser.findAll({
      where: {
        userId: userId,
      },
      include: [
        {
          model: db.models.City,
          as: "city",
          include: [
            {
              model: db.models.Project,
              as: "project",
            },
            {
              model: db.models.Inventory,
              as: "inventories",
            },
          ],
        },
      ],
    });

    const dataList: ProjectWithCities[] = [
      ...projectAdminAssociations
        .filter((assoc) => {
          if (!assoc.project) {
            logger.warn(
              `ProjectAdmin's project not found for project id: ${assoc.projectId}`,
            );
          }
          return !!assoc.project;
        })
        .map((assoc) => ({
          projectId: assoc.project.projectId,
          name: assoc.project.name,
          organizationId: assoc.project.organizationId,
          description: assoc.project.description,
          cityCountLimit: assoc.project.cityCountLimit,
          cities: assoc.project.cities.map((city) => ({
            name: city.name as string,
            cityId: city.cityId as string,
            inventories: city.inventories as any,
            countryLocode: city.countryLocode as string,
            locode: city.locode as string,
          })),
        })),
      ...organizationAdminAssociations.flatMap((assoc) =>
        assoc.organization?.projects.map((project) => ({
          projectId: project.projectId,
          name: project.name,
          organizationId: assoc.organization.organizationId,
          description: project.description,
          cityCountLimit: project.cityCountLimit,
          cities: project.cities.map((city) => ({
            name: city.name as string,
            cityId: city.cityId as string,
            inventories: city.inventories as any,
            countryLocode: city.countryLocode as string,
            locode: city.locode as string,
          })),
        })),
      ),
    ];

    //   city user has access to only the cities
    const cityUserDataList: Record<string, ProjectWithCities> =
      cityUserAssociations
        .filter((assoc) => {
          if (!assoc.city?.project) {
            logger.warn(
              `CityUser's city project not found for city id: ${assoc.cityId}`,
            );
          }
          return !!assoc.city?.project;
        })
        .reduce((acc: Record<string, any>, cityUserAsocc) => {
          const projectId = cityUserAsocc.city?.project?.projectId;
          const project = cityUserAsocc.city?.project;
          const existingProject = acc[projectId];
          const city = {
            name: cityUserAsocc.city.name as string,
            cityId: cityUserAsocc.city.cityId as string,
            inventories: cityUserAsocc.city.inventories as any,
          };
          if (!existingProject) {
            acc[projectId] = {
              projectId: project.projectId,
              name: project.name,
              organizationId: project.organizationId,
              description: project.description,
              cityCountLimit: project.cityCountLimit,
              cities: [city],
            };
          } else {
            existingProject.cities.push(city);
          }
          return acc;
        }, {});

    const projectList = dataList.concat(Object.values(cityUserDataList));

    // Remove duplicates based on projectId
    return uniqBy(projectList, "projectId");
  }
}
