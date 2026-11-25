import createHttpError from "http-errors";
import type { NextRequest } from "next/server";

import type { AppSession } from "@/lib/auth";
import { PermissionService } from "@/backend/permissions/PermissionService";
import type { Inventory } from "@/models/Inventory";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

export function requireClimateAdvisorIntegrationEnabled(): void {
  if (!hasServerFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION)) {
    throw new createHttpError.NotFound("Not found");
  }
}

export function requireStationaryEnergyAgenticEnabled(): void {
  if (
    !hasServerFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION) ||
    !hasServerFeatureFlag(FeatureFlags.STATIONARY_ENERGY_AGENTIC)
  ) {
    throw new createHttpError.NotFound("Not found");
  }
}

export function requireClimateAdvisorServiceRequest(req: NextRequest): void {
  const serviceName = req.headers.get("X-Service-Name");
  const serviceKey = req.headers.get("X-Service-Key");
  if (
    serviceName !== "climate-advisor" ||
    !serviceKey ||
    serviceKey !== process.env.CC_SERVICE_API_KEY
  ) {
    throw new createHttpError.Unauthorized(
      "Climate Advisor service authentication required",
    );
  }
}

export function requireRequestUser(
  session: AppSession | null,
  userId: string,
): void {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  if (session.user.id !== userId) {
    throw new createHttpError.Forbidden(
      "Request user does not match authenticated service token",
    );
  }
}

export async function requireStationaryEnergyInventoryEditor(
  session: AppSession | null,
  inventoryId: string,
  cityId: string,
): Promise<Inventory> {
  const { resource } = await PermissionService.canAccessInventory(
    session,
    inventoryId,
    { allowPublicRead: false },
  );
  const inventory = resource as Inventory | undefined;
  if (!inventory || inventory.cityId !== cityId) {
    throw new createHttpError.BadRequest(
      "Inventory does not belong to the requested city",
    );
  }
  return inventory;
}
