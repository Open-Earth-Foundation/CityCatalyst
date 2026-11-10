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

/** Inventory, then city, then project, then org. Returns false when none are set. */
async function assertCanAccessIngestScope(
  session: AppSession | null,
  scope: IngestScope,
): Promise<boolean> {
  if (scope.inventoryId) {
    await PermissionService.canAccessInventory(session, scope.inventoryId);
    return true;
  }
  if (scope.cityId) {
    await PermissionService.canAccessCity(session, scope.cityId);
    return true;
  }
  if (scope.projectId) {
    await PermissionService.canAccessProject(session, scope.projectId);
    return true;
  }
  if (scope.organizationId) {
    await PermissionService.canAccessOrganization(
      session,
      scope.organizationId,
    );
    return true;
  }
  return false;
}

export async function assertCanEnqueueIngest(
  session: AppSession | null,
  scope: IngestScope,
): Promise<void> {
  if (await assertCanAccessIngestScope(session, scope)) {
    return;
  }
  throw new createHttpError.BadRequest(
    "Ingest enqueue requires a city, project, or organization",
  );
}

export async function assertCanAccessIngestItem(
  session: AppSession | null,
  job: IngestJobRecord,
  item: IngestItemRecord,
): Promise<void> {
  const ok = await assertCanAccessIngestScope(session, {
    inventoryId: item.targetInventoryId,
    cityId: item.targetCityId ?? job.cityId,
    projectId: job.projectId,
    organizationId: job.organizationId,
  });
  if (!ok) {
    throw new createHttpError.Forbidden("Ingest item has no accessible scope");
  }
}

export async function assertCanAccessIngestDocument(
  session: AppSession | null,
  document: IngestDocumentRecord,
): Promise<void> {
  const ok = await assertCanAccessIngestScope(session, {
    cityId: document.cityId,
    projectId: document.projectId,
    organizationId: document.organizationId,
  });
  if (!ok) {
    throw new createHttpError.Forbidden("Document has no accessible scope");
  }
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
