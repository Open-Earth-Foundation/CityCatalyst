"use client";
import { useParams } from "next/navigation";
import { api } from "@/services/api";
import InventoryPage from "@/components/shared/InventoryPage";
import { useResourceValidation } from "@/hooks/useResourceValidation";

export default function PrivateHome() {
  const { inventory, lng } = useParams();

  const inventoryValue = Array.isArray(inventory) ? inventory[0] : inventory;
  const lngValue = Array.isArray(lng) ? lng[0] : lng;

  // Get inventory data to validate if the inventory exists and user has access
  const inventoryQuery = api.useGetInventoryQuery(inventoryValue!, {
    skip: !inventoryValue,
  });

  const { isLoading, shouldRender, LoadingComponent } = useResourceValidation({
    resourceId: inventoryValue!,
    resourceQuery: inventoryQuery,
    lng: lngValue!,
    resourceType: "inventory",
  });

  // Show loading state while validating
  if (isLoading) {
    return <LoadingComponent />;
  }

  // If inventory doesn't exist, don't render (will redirect)
  if (!shouldRender) {
    return null;
  }

  return <InventoryPage />;
}
