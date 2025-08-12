import { beforeAll, afterAll, describe, expect, it } from "@jest/globals";
import { db } from "@/models";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { UserRole } from "@/util/types";
import { Roles } from "@/util/types";
import { createTestData, cleanupTestData, TestData } from "../helpers/testDataCreationHelper";
import { setupTests } from "../helpers";
import { randomUUID } from "crypto";
import { createPermissionError, PERMISSION_ERRORS } from "@/util/permission-errors";

describe("PermissionService", () => {
  let testData: TestData;
  let collaboratorUserId: string;
  let projectAdminUserId: string;
  let orgAdminUserId: string;
  let systemAdminUserId: string;
  let otherOrgAdminUserId: string;
  let otherTestData: TestData;

  // Mock session objects
  const createSession = (userId: string, role: Roles = Roles.User) => ({
    user: { id: userId, role },
    expires: "1h"
  });

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    // Create main test data hierarchy
    testData = await createTestData({
      organizationName: "Test Organization",
      projectName: "Test Project", 
      cityName: "Test City"
    });

    // Create another organization for cross-org access tests
    otherTestData = await createTestData({
      organizationName: "Other Organization",
      projectName: "Other Project",
      cityName: "Other City"
    });

    // Create test users with different permission levels
    collaboratorUserId = randomUUID();
    projectAdminUserId = randomUUID();
    orgAdminUserId = randomUUID();
    systemAdminUserId = randomUUID();
    otherOrgAdminUserId = randomUUID();

    // Create users in database
    await db.models.User.bulkCreate([
      { userId: collaboratorUserId, name: "Collaborator User" },
      { userId: projectAdminUserId, name: "Project Admin User" },
      { userId: orgAdminUserId, name: "Org Admin User" },
      { userId: systemAdminUserId, name: "System Admin User" },
      { userId: otherOrgAdminUserId, name: "Other Org Admin User" }
    ]);

    // Set up permissions
    // 1. Collaborator - city access only
    const city = await db.models.City.findByPk(testData.cityId);
    await city!.addUser(collaboratorUserId);

    // 2. Project Admin
    await db.models.ProjectAdmin.create({
      projectAdminId: randomUUID(),
      userId: projectAdminUserId,
      projectId: testData.projectId
    });

    // 3. Organization Admin
    await db.models.OrganizationAdmin.create({
      organizationAdminId: randomUUID(),
      userId: orgAdminUserId,
      organizationId: testData.organizationId
    });

    // 4. Admin in different organization
    await db.models.OrganizationAdmin.create({
      organizationAdminId: randomUUID(),
      userId: otherOrgAdminUserId,
      organizationId: otherTestData.organizationId
    });
  });

  afterAll(async () => {
    await cleanupTestData(testData);
    await cleanupTestData(otherTestData);
    if (db.sequelize) await db.sequelize.close();
  });

  describe("checkAccess", () => {
    it("should allow system admin to access any resource", async () => {
      const session = createSession(systemAdminUserId, Roles.Admin);
      
      const result = await PermissionService.checkAccess(session, {
        inventoryId: randomUUID() // Non-existent inventory
      });

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.ORG_ADMIN);
    });

    it("should throw unauthorized for null session", async () => {
      await expect(
        PermissionService.checkAccess(null, { cityId: testData.cityId })
      ).rejects.toThrow("Authentication required");
    });

    it("should throw resource not found for non-existent resource", async () => {
      const session = createSession(orgAdminUserId);
      
      await expect(
        PermissionService.checkAccess(session, { inventoryId: randomUUID() })
      ).rejects.toThrow("The requested resource was not found");
    });

    it("should return correct access for org admin", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.checkAccess(session, {
        cityId: testData.cityId
      });

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.ORG_ADMIN);
      expect(result.organizationId).toBe(testData.organizationId);
    });

    it("should return correct access for project admin", async () => {
      const session = createSession(projectAdminUserId);
      
      const result = await PermissionService.checkAccess(session, {
        cityId: testData.cityId
      });

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.PROJECT_ADMIN);
      expect(result.organizationId).toBe(testData.organizationId);
    });

    it("should return correct access for collaborator", async () => {
      const session = createSession(collaboratorUserId);
      
      const result = await PermissionService.checkAccess(session, {
        cityId: testData.cityId
      });

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.COLLABORATOR);
      expect(result.organizationId).toBe(testData.organizationId);
    });

    it("should deny access to user with no permissions", async () => {
      const session = createSession(randomUUID()); // User not in any org
      
      await expect(
        PermissionService.checkAccess(session, { cityId: testData.cityId })
      ).rejects.toThrow("You do not have access to this resource");
    });

    it("should deny cross-organization access", async () => {
      const session = createSession(orgAdminUserId); // Admin of testData org
      
      // Try to access city from other organization
      await expect(
        PermissionService.checkAccess(session, { cityId: otherTestData.cityId })
      ).rejects.toThrow("You do not have access to this resource");
    });
  });

  describe("canAccessOrganization", () => {
    it("should allow org admin to access organization", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.canAccessOrganization(
        session, 
        testData.organizationId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.ORG_ADMIN);
    });

    it("should deny project admin access to organization", async () => {
      const session = createSession(projectAdminUserId);
      
      await expect(
        PermissionService.canAccessOrganization(session, testData.organizationId)
      ).rejects.toThrow("You do not have access to this organization");
    });

    it("should deny collaborator access to organization", async () => {
      const session = createSession(collaboratorUserId);
      
      await expect(
        PermissionService.canAccessOrganization(session, testData.organizationId)
      ).rejects.toThrow("You do not have access to this organization");
    });
  });

  describe("canAccessProject", () => {
    it("should allow org admin to access project", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.canAccessProject(
        session, 
        testData.projectId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.ORG_ADMIN);
    });

    it("should allow project admin to access their project", async () => {
      const session = createSession(projectAdminUserId);
      
      const result = await PermissionService.canAccessProject(
        session, 
        testData.projectId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.PROJECT_ADMIN);
    });

    it("should deny collaborator access to project", async () => {
      const session = createSession(collaboratorUserId);
      
      await expect(
        PermissionService.canAccessProject(session, testData.projectId)
      ).rejects.toThrow("You do not have access to this project");
    });
  });

  describe("canCreateCity", () => {
    it("should allow org admin to create city", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.canCreateCity(
        session, 
        testData.projectId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.ORG_ADMIN);
    });

    it("should allow project admin to create city", async () => {
      const session = createSession(projectAdminUserId);
      
      const result = await PermissionService.canCreateCity(
        session, 
        testData.projectId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.PROJECT_ADMIN);
    });

    it("should deny collaborator ability to create city", async () => {
      const session = createSession(collaboratorUserId);
      
      await expect(
        PermissionService.canCreateCity(session, testData.projectId)
      ).rejects.toThrow("You do not have access to this project");
    });
  });

  describe("canCreateInventory", () => {
    it("should allow org admin to create inventory", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.canCreateInventory(
        session, 
        testData.cityId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.ORG_ADMIN);
    });

    it("should allow project admin to create inventory", async () => {
      const session = createSession(projectAdminUserId);
      
      const result = await PermissionService.canCreateInventory(
        session, 
        testData.cityId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.PROJECT_ADMIN);
    });

    it("should deny collaborator ability to create inventory", async () => {
      const session = createSession(collaboratorUserId);
      
      await expect(
        PermissionService.canCreateInventory(session, testData.cityId)
      ).rejects.toThrow("You do not have permission to create inventories in this city");
    });
  });

  describe("canAccessCity", () => {
    it("should allow org admin to access city", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.canAccessCity(
        session, 
        testData.cityId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.ORG_ADMIN);
    });

    it("should allow project admin to access city", async () => {
      const session = createSession(projectAdminUserId);
      
      const result = await PermissionService.canAccessCity(
        session, 
        testData.cityId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.PROJECT_ADMIN);
    });

    it("should allow collaborator to access their assigned city", async () => {
      const session = createSession(collaboratorUserId);
      
      const result = await PermissionService.canAccessCity(
        session, 
        testData.cityId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.COLLABORATOR);
    });
  });

  describe("canDeleteCity", () => {
    it("should allow org admin to delete city", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.canDeleteCity(
        session, 
        testData.cityId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.ORG_ADMIN);
    });

    it("should deny project admin ability to delete city", async () => {
      const session = createSession(projectAdminUserId);
      
      await expect(
        PermissionService.canDeleteCity(session, testData.cityId)
      ).rejects.toThrow("You do not have permission to delete this city");
    });

    it("should deny collaborator ability to delete city", async () => {
      const session = createSession(collaboratorUserId);
      
      await expect(
        PermissionService.canDeleteCity(session, testData.cityId)
      ).rejects.toThrow("You do not have permission to delete this city");
    });
  });

  describe("canAccessInventory", () => {
    let inventoryId: string;

    beforeAll(async () => {
      // Create a test inventory
      const inventory = await db.models.Inventory.create({
        inventoryId: randomUUID(),
        inventoryName: "Test Inventory",
        year: 2023,
        cityId: testData.cityId
      });
      inventoryId = inventory.inventoryId;
    });

    it("should allow org admin to access inventory", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.canAccessInventory(
        session, 
        inventoryId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.ORG_ADMIN);
    });

    it("should allow project admin to access inventory", async () => {
      const session = createSession(projectAdminUserId);
      
      const result = await PermissionService.canAccessInventory(
        session, 
        inventoryId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.PROJECT_ADMIN);
    });

    it("should allow collaborator to access inventory in their city", async () => {
      const session = createSession(collaboratorUserId);
      
      const result = await PermissionService.canAccessInventory(
        session, 
        inventoryId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.COLLABORATOR);
    });
  });

  describe("canDeleteInventory", () => {
    let inventoryId: string;

    beforeAll(async () => {
      // Create a test inventory for deletion tests
      const inventory = await db.models.Inventory.create({
        inventoryId: randomUUID(),
        inventoryName: "Test Delete Inventory", 
        year: 2023,
        cityId: testData.cityId
      });
      inventoryId = inventory.inventoryId;
    });

    it("should allow org admin to delete inventory", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.canDeleteInventory(
        session, 
        inventoryId
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRole).toBe(UserRole.ORG_ADMIN);
    });

    it("should deny project admin ability to delete inventory", async () => {
      const session = createSession(projectAdminUserId);
      
      await expect(
        PermissionService.canDeleteInventory(session, inventoryId)
      ).rejects.toThrow("You do not have permission to delete this inventory");
    });

    it("should deny collaborator ability to delete inventory", async () => {
      const session = createSession(collaboratorUserId);
      
      await expect(
        PermissionService.canDeleteInventory(session, inventoryId)
      ).rejects.toThrow("You do not have permission to delete this inventory");
    });
  });

  describe("edge cases", () => {
    it("should handle inactive organization gracefully", async () => {
      // Create inactive organization
      const inactiveOrg = await db.models.Organization.create({
        organizationId: randomUUID(),
        name: "Inactive Org",
        contactEmail: "inactive@test.com", 
        active: false
      });

      const session = createSession(orgAdminUserId);
      
      await expect(
        PermissionService.checkAccess(session, { 
          organizationId: inactiveOrg.organizationId 
        }, { requireActive: true })
      ).rejects.toThrow("Organization is not active");
    });

    it("should properly resolve organization context from project", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.checkAccess(session, {
        projectId: testData.projectId
      });

      expect(result.organizationId).toBe(testData.organizationId);
    });

    it("should properly resolve organization context from city", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.checkAccess(session, {
        cityId: testData.cityId
      });

      expect(result.organizationId).toBe(testData.organizationId);
    });
  });

  describe("resource loading", () => {
    it("should load resource when includeResource is true", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.checkAccess(session, {
        cityId: testData.cityId
      }, { includeResource: true });

      expect(result.resource).toBeDefined();
      expect(result.resource.cityId).toBe(testData.cityId);
    });

    it("should not load resource when excludeResource is true", async () => {
      const session = createSession(orgAdminUserId);
      
      const result = await PermissionService.checkAccess(session, {
        cityId: testData.cityId
      }, { excludeResource: true });

      expect(result.resource).toBeUndefined();
    });
  });
});