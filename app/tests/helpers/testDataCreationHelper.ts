import { db } from "@/models";
import { randomUUID } from "crypto";

export interface TestData {
  organizationId: string;
  projectId: string;
  cityId: string;
  userId: string;
}

export interface CreateTestDataOptions {
  organizationName?: string;
  projectName?: string;
  cityName?: string;
  userName?: string;
  userEmail?: string;
  countryLocode?: string;
  cityCountLimit?: number;
}

/**
 * Creates basic test data: Organization, Project, City, and User
 * Returns the IDs of all created entities
 */
export async function createTestData(
  options: CreateTestDataOptions = {},
): Promise<TestData> {
  const {
    organizationName = "Test Organization",
    projectName = "Test Project",
    cityName = "Test City",
    userName = "TEST_USER",
    userEmail = "test+" + new Date().toISOString() + "@example.com",
    countryLocode = "US",
    cityCountLimit = 10,
  } = options;

  const organizationId = randomUUID();
  const projectId = randomUUID();
  const cityId = randomUUID();
  const userId = randomUUID();

  await db.models.City.destroy({ where: { cityId } });
  await db.models.Project.destroy({ where: { projectId } });
  await db.models.Organization.destroy({ where: { organizationId } });
  await db.models.User.destroy({ where: { userId } });

  // Create all entities in a transaction to ensure consistency
  await db.sequelize!.transaction(async (transaction) => {
    // Create test user
    await db.models.User.create(
      {
        userId,
        name: userName,
        email: userEmail,
      },
      { transaction },
    );

    // Create test organization
    const organization = await db.models.Organization.create(
      {
        organizationId,
        name: organizationName,
        contactEmail: userEmail,
        active: true,
      },
      { transaction },
    );

    // Verify organization was created
    if (!organization) {
      throw new Error(
        `Failed to create organization with ID: ${organizationId}`,
      );
    }

    // Create test project
    const project = await db.models.Project.create(
      {
        projectId,
        name: projectName,
        description: "Test project description",
        organizationId,
        cityCountLimit,
      },
      { transaction },
    );

    // Verify project was created
    if (!project) {
      throw new Error(`Failed to create project with ID: ${projectId}`);
    }

    // Create test city
    await db.models.City.create(
      {
        cityId,
        name: cityName,
        countryLocode,
        projectId,
      },
      { transaction },
    );
  });

  return {
    organizationId,
    projectId,
    cityId,
    userId,
  };
}

/**
 * Cleans up test data created by createTestData
 */
export async function cleanupTestData(testData: TestData): Promise<void> {
  const { organizationId, projectId, cityId, userId } = testData;

  // Clean up in reverse order of dependencies
  await db.models.City.destroy({
    where: { cityId },
  });

  await db.models.Project.destroy({
    where: { projectId },
  });

  await db.models.Organization.destroy({
    where: { organizationId },
  });

  await db.models.User.destroy({
    where: { userId },
  });
}

/**
 * Creates a city without a project (for testing edge cases)
 */
export async function createCityWithoutProject(
  options: { cityName?: string; countryLocode?: string } = {},
): Promise<string> {
  const { cityName = "City Without Project", countryLocode = "US" } = options;
  const cityId = randomUUID();

  await db.models.City.create({
    cityId,
    name: cityName,
    countryLocode,
    projectId: undefined,
  });

  return cityId;
}

/**
 * Creates a module for testing
 */
export async function createTestModule(moduleId?: string): Promise<string> {
  const id = moduleId || randomUUID();

  await db.models.Module.create({
    id: id,
    name: { en: "Test Module" },
    description: { en: "Test module description" },
    tagline: { en: "Test module tagline" },
    type: "OEF",
    stage: "assess-&-analyze",
    author: "OEF",
    url: "https://example.com",
  });

  return id;
}

/**
 * Associates a project with a module
 */
export async function associateProjectWithModule(
  projectId: string,
  moduleId: string,
): Promise<void> {
  await db.models.ProjectModules.create({
    projectId,
    moduleId,
  });
}
