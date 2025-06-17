import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  GET as getProjects,
  POST as createProject,
} from "@/app/api/v0/organizations/[organization]/projects/route";

import {
  DELETE as deleteProject,
  GET as getProject,
  PATCH as updateProject,
} from "@/app/api/v0/projects/[project]/route";
import { mockRequest, setupTests, testUserID } from "../helpers";

import {
  CreateOrganizationRequest,
  CreateProjectRequest,
} from "@/util/validation";
import { AppSession, Auth } from "@/lib/auth";
import { Roles } from "@/util/types";
import { db } from "@/models";
import { randomUUID } from "node:crypto";
import { Organization } from "@/models/Organization";

const organizationData: CreateOrganizationRequest = {
  name: "Test Organization project",
  contactEmail: "testproject@organization.com",
};

const projectData: CreateProjectRequest = {
  name: "Test Project",
  cityCountLimit: 10,
  description: "Test Description",
};

const invalidProject: CreateProjectRequest = {
  name: "",
  cityCountLimit: -1,
  description: "",
};

const mockUserSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};

const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};

describe("Project API", () => {
  let organization: Organization;
  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    organization = await db.models.Organization.create({
      active: true,
      ...organizationData,
      organizationId: randomUUID(),
    });
  });

  beforeEach(async () => {
    await db.models.Organization.destroy({
      where: { name: organizationData.name },
    });
    organization = await db.models.Organization.create({
      active: true,
      ...organizationData,
      organizationId: randomUUID(),
    });
  });

  afterAll(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  describe("POST /api/v0/organizations/[organizationId]/projects", () => {
    it("should create a project", async () => {
      const req = mockRequest({
        ...projectData,
        organizationId: organization.organizationId,
      });
      const response = await createProject(req, {
        params: { organizationId: organization.organizationId },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe(projectData.name);

      // destroy the project
      await db.models.Project.destroy({
        where: { projectId: data.projectId },
      });
    });

    it("should return 400 if invalid project data is provided", async () => {
      const req = await mockRequest({
        ...invalidProject,
        organizationId: organization.organizationId,
      });
      const response = await createProject(req, {
        params: { organizationId: organization.organizationId },
      });
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/v0/organizations/[organizationId]/projects", () => {
    it("should return all projects belonging to an organization", async () => {
      //   create a project in the organization
      //     fetch all projects in the organization, should return an array with the created project
      const project = await db.models.Project.create({
        projectId: randomUUID(),
        ...projectData,
        organizationId: organization.organizationId,
      });

      const req = await mockRequest();
      const response = await getProjects(req, {
        params: { organizationId: organization.organizationId },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.length).toBe(1);

      //  destroy the project
      await db.models.Project.destroy({
        where: { projectId: project.projectId },
      });
    });
  });

  describe("GET /api/v0/projects/[projectId]", () => {
    it("should return a project", async () => {
      //   create a project
      //     fetch the project, should return the created project
      const project = await db.models.Project.create({
        projectId: randomUUID(),
        ...projectData,
        organizationId: organization.organizationId,
      });

      const req = await mockRequest();
      const response = await getProject(req, {
        params: { projectId: project.projectId },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe(projectData.name);

      // destroy the project
      await db.models.Project.destroy({
        where: { projectId: project.projectId },
      });
    });

    it("should return 404 if project does not exist", async () => {
      const req = await mockRequest();
      const response = await getProject(req, {
        params: { projectId: randomUUID() },
      });
      const data = await response.json();
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/v0/projects/[projectId]", () => {
    it("should update a project", async () => {
      const project = await db.models.Project.create({
        projectId: randomUUID(),
        ...projectData,
        organizationId: organization.organizationId,
      });

      const updatedProject = {
        ...projectData,
        name: "Updated Project",
      };

      const req = await mockRequest(updatedProject);
      const response = await updateProject(req, {
        params: { projectId: project.projectId },
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe(updatedProject.name);

      // destroy the project
      await db.models.Project.destroy({
        where: { projectId: project.projectId },
      });
    });
  });

  describe("PATCH /api/v0/projects/[projectId]", () => {
    it("should delete a project", async () => {
      const project = await db.models.Project.create({
        projectId: randomUUID(),
        ...projectData,
        cityCountLimit: 10,
        organizationId: organization.organizationId,
      });

      const req = await mockRequest();
      const response = await deleteProject(req, {
        params: { projectId: project.projectId },
      });
      expect(response.status).toBe(200);
    });
  });
});
