import createHttpError from "http-errors";
import type { AppSession } from "@/lib/auth";
import { PermissionService } from "@/backend/permissions/PermissionService";
import type { IngestItemRecord, IngestJobRecord } from "./types";

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
