import { PermissionService } from "./PermissionService";
import type { AppSession } from "@/lib/auth";
import createHttpError from "http-errors";
import { 
  CityWithProject, 
  InventoryWithRelations,
  ProjectWithOrganization,
  AuthorizedOrganization,
  TypedResourceAccess 
} from "./ResourceTypes";


export class PermissionHelpers {
  

  static async getAuthorizedCity(
    session: AppSession | null,
    cityId: string
  ): Promise<CityWithProject> {
    const access = await PermissionService.canAccessCity(session, cityId, {
      includeResource: true
    });

    if (!access.hasAccess) {
      throw new createHttpError.Forbidden("Access denied to city");
    }

    if (!access.resource) {
      throw new createHttpError.NotFound("City not found");
    }

    return access.resource as CityWithProject;
  }


  static async getAuthorizedInventory(
    session: AppSession | null,
    inventoryId: string
  ): Promise<InventoryWithRelations> {
    const access = await PermissionService.canAccessInventory(session, inventoryId, {
      includeResource: true
    });

    if (!access.hasAccess) {
      throw new createHttpError.Forbidden("Access denied to inventory");
    }

    if (!access.resource) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    return access.resource as InventoryWithRelations;
  }


  static async getAuthorizedProject(
    session: AppSession | null,
    projectId: string
  ): Promise<ProjectWithOrganization> {
    const access = await PermissionService.canAccessProject(session, projectId, {
      includeResource: true
    });

    if (!access.hasAccess) {
      throw new createHttpError.Forbidden("Access denied to project");
    }

    if (!access.resource) {
      throw new createHttpError.NotFound("Project not found");
    }

    return access.resource as ProjectWithOrganization;
  }


  static async getAuthorizedOrganization(
    session: AppSession | null,
    organizationId: string
  ): Promise<AuthorizedOrganization> {
    const access = await PermissionService.canAccessOrganization(session, organizationId, {
      includeResource: true
    });

    if (!access.hasAccess) {
      throw new createHttpError.Forbidden("Access denied to organization");
    }

    if (!access.resource) {
      throw new createHttpError.NotFound("Organization not found");
    }

    return access.resource as AuthorizedOrganization;
  }


  static async canCreateInventory(
    session: AppSession | null,
    cityId: string
  ): Promise<CityWithProject> {
    const access = await PermissionService.canCreateInventory(session, cityId);

    if (!access.hasAccess) {
      throw new createHttpError.Forbidden("Cannot create inventory in this city");
    }

    if (!access.resource) {
      throw new createHttpError.NotFound("City not found");
    }

    return access.resource as CityWithProject;
  }


  static async canCreateCity(
    session: AppSession | null,
    projectId: string
  ): Promise<ProjectWithOrganization> {
    const access = await PermissionService.canCreateCity(session, projectId);

    if (!access.hasAccess) {
      throw new createHttpError.Forbidden("Cannot create city in this project");
    }

    if (!access.resource) {
      throw new createHttpError.NotFound("Project not found");
    }

    return access.resource as ProjectWithOrganization;
  }
}