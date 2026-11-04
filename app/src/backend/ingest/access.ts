import createHttpError from "http-errors";
import type { AppSession } from "@/lib/auth";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Roles, UserRole } from "@/util/types";
import type { IngestDocumentRecord } from "./document-pool";
import type {
  IngestItemRecord,
  IngestJobRecord,
  IngestScope,
} from "./types";

export async function assertCanEnqueueIngest(
  session: AppSession | null,
  scope: IngestScope,
): Promise<void> {
  if (scope.inventoryId) {
    await PermissionService.canAccessInventory(session, scope.inventoryId);
    return;
  }
  if (scope.cityId) {
    await PermissionService.canAccessCity(session, scope.cityId);
    return;
  }
  if (scope.projectId) {
    await PermissionService.canAccessProject(session, scope.projectId);
    return;
  }
  if (scope.organizationId) {
    await PermissionService.canAccessOrganization(
      session,
      scope.organizationId,
    );
    return;
  }
  throw new createHttpError.BadRequest("Ingest enqueue requires a city, project, or organization");
}

export async function assertCanAccessIngestItem(
  session: AppSession | null,
  job: IngestJobRecord,
  item: IngestItemRecord,
): Promise<void> {
  const inventoryId = item.targetInventoryId ?? null;
  const cityId = item.targetCityId ?? job.cityId ?? null;
  if (inventoryId) {
    await PermissionService.canAccessInventory(session, inventoryId);
    return;
  }
  if (cityId) {
    await PermissionService.canAccessCity(session, cityId);
    return;
  }
  if (job.projectId) {
    await PermissionService.canAccessProject(session, job.projectId);
    return;
  }
  if (job.organizationId) {
    await PermissionService.canAccessOrganization(session, job.organizationId);
    return;
  }
  throw new createHttpError.Forbidden("Ingest item has no accessible scope");
}

export async function assertCanAccessIngestDocument(
  session: AppSession | null,
  document: IngestDocumentRecord,
): Promise<void> {
  if (document.cityId) {
    await PermissionService.canAccessCity(session, document.cityId);
    return;
  }
  if (document.projectId) {
    await PermissionService.canAccessProject(session, document.projectId);
    return;
  }
  if (document.organizationId) {
    await PermissionService.canAccessOrganization(
      session,
      document.organizationId,
    );
    return;
  }
  throw new createHttpError.Forbidden("Document has no accessible scope");
}

/** Org admin, project admin, or the uploader. Collaborators cannot withdraw. */
export async function assertCanManageIngestDocument(
  session: AppSession | null,
  document: IngestDocumentRecord,
): Promise<void> {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  if (session.user.role === Roles.Admin) {
    return;
  }
  if (document.uploadedByUserId === session.user.id) {
    return;
  }
  await assertCanAccessIngestDocument(session, document);
  const access = document.cityId
    ? await PermissionService.canAccessCity(session, document.cityId, {
        excludeResource: true,
      })
    : document.projectId
      ? await PermissionService.canAccessProject(session, document.projectId, {
          excludeResource: true,
        })
      : await PermissionService.canAccessOrganization(
          session,
          document.organizationId!,
          { excludeResource: true },
        );
  if (
    ![UserRole.ORG_ADMIN, UserRole.PROJECT_ADMIN].includes(access.userRole)
  ) {
    throw new createHttpError.Forbidden(
      "Only the author or an org/project admin can withdraw or replace this document",
    );
  }
}
