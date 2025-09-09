"use server";

import { PermissionService } from "@/backend/permissions/PermissionService";
import { hasServerFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { redirect } from "next/navigation";
import { Inventory } from "@/models/Inventory";
import { db } from "@/models";

export async function checkInventoryRedirect(inventoryId: string, lng: string) {
  if (!hasServerFeatureFlag(FeatureFlags.JN_ENABLED)) {
    return null; // No redirect needed
  }

  try {
    if (!db.initialized) {
      await db.initialize();
    }

    // Use PermissionService to check if inventory is accessible (handles public inventories)
    const { resource } = await PermissionService.canAccessInventory(
      null, // No session for public access
      inventoryId,
      { includeResource: true },
    );

    const inventory = resource as Inventory;

    if (inventory?.cityId) {
      redirect(`/${lng}/public/cities/${inventory.cityId}/dashboard`);
    }

    return inventory;
  } catch (error) {
    // Don't log redirect errors - they are expected behavior
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error; // Re-throw redirect errors so Next.js can handle them
    }

    console.error("Error checking inventory for redirect:", error);
    return null;
  }
}
