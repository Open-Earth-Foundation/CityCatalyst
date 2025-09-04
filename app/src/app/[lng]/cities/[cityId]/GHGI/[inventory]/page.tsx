"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/services/api";
import InventoryPage from "@/components/shared/InventoryPage";

export default function CityInventoryPage() {
  const router = useRouter();
  const { cityId, inventory, lng } = useParams();

  const cityIdValue = Array.isArray(cityId) ? cityId[0] : cityId;
  const inventoryValue = Array.isArray(inventory) ? inventory[0] : inventory;
  const lngValue = Array.isArray(lng) ? lng[0] : lng;

  // Get user info to check for default inventory
  const { data: userInfo, isLoading: userInfoLoading } =
    api.useGetUserInfoQuery();

  // Get inventory data to validate if the inventory exists and user has access
  const {
    data: inventoryData,
    error: inventoryError,
    isLoading: inventoryLoading,
  } = api.useGetInventoryQuery(inventoryValue!, { skip: !inventoryValue });

  useEffect(() => {
    if (userInfoLoading || inventoryLoading) return;

    // If inventory doesn't exist or user doesn't have access, redirect appropriately
    if (inventoryError || !inventoryData) {
      if (userInfo?.defaultInventoryId) {
        // Redirect to default inventory
        router.replace(`/${lngValue}/${userInfo.defaultInventoryId}`);
      } else if (userInfo?.defaultCityId) {
        // Redirect to default city
        router.replace(`/${lngValue}/cities/${userInfo.defaultCityId}`);
      } else {
        // Redirect to onboarding
        router.replace(`/${lngValue}/onboarding`);
      }
    }
  }, [
    inventoryError,
    inventoryData,
    userInfo,
    userInfoLoading,
    inventoryLoading,
    lngValue,
    router,
  ]);

  // Show loading state while validating
  if (userInfoLoading || inventoryLoading) {
    return <div>Loading...</div>;
  }

  // If inventory doesn't exist, don't render (will redirect)
  if (inventoryError || !inventoryData) {
    return null;
  }

  return <InventoryPage />;
}
