"use client";

import { useParams } from "next/navigation";
import { api } from "@/services/api";
import HomePage from "@/components/GHGIHomePage/HomePage";
import { getParamValueRequired } from "@/util/helpers";
import { useResourceValidation } from "@/hooks/useResourceValidation";

export default function InventoryPage() {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const inventory = getParamValueRequired(params.inventory);

  // Get inventory data to validate if the inventory exists and user has access
  const inventoryQuery = api.useGetInventoryQuery(inventory, {
    skip: !inventory,
  });

  const { isLoading, shouldRender, LoadingComponent } = useResourceValidation({
    resourceId: inventory,
    resourceQuery: inventoryQuery,
    lng,
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

  return <HomePage lng={lng} isPublic={false} />;
}
