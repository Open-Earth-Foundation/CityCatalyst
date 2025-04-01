import { db } from "@/models";
import { uniqBy } from "lodash";

interface ProjectInfo {
  projectId: string;
  name: string;
  organizationId: string;
  description?: string | null;
  cityCountLimit?: Number;
}

export class ProjectService {
  // Or UserService, etc.

  public static async fetchUserProjects(
    userId: string,
  ): Promise<ProjectInfo[]> {
    const user = await db.models.User.findByPk(userId, {});
    const projectAdminAssociations = await db.models.ProjectAdmin.findAll({
      where: {
        userId: userId,
      },
      include: [
        {
          model: db.models.Project,
          as: "project",
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
          ],
        },
      ],
    });

    const projectsData: ProjectInfo[] = [
      ...projectAdminAssociations.map((assoc) => ({
        projectId: assoc.project.projectId,
        name: assoc.project.name,
        organizationId: assoc.project.organizationId,
        description: assoc.project.description,
        cityCountLimit: assoc.project.cityCountLimit,
      })),
      ...organizationAdminAssociations.flatMap((assoc) =>
        assoc.organization.projects.map((project) => ({
          projectId: project.projectId,
          name: project.name,
          organizationId: assoc.organization.organizationId,
          description: project.description,
          cityCountLimit: project.cityCountLimit,
        })),
      ),
      ...cityUserAssociations.map((assoc) => ({
        projectId: assoc.city.project.projectId,
        name: assoc.city.project.name,
        organizationId: assoc.city.project.organizationId,
        description: assoc.city.project.description,
        cityCountLimit: assoc.city.project.cityCountLimit,
      })),
    ];

    // Remove duplicates based on projectId
    return uniqBy(projectsData, "projectId");
  }
}
