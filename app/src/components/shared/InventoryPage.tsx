"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/services/api";
import HomePage from "@/components/GHGIHomePage/HomePage";
import { getParamValueRequired } from "@/util/helpers";
import ProgressLoader from "@/components/ProgressLoader";

export default function InventoryPage() {
  const params = useParams();
  const router = useRouter();
  const lng = getParamValueRequired(params.lng);
  const inventory = getParamValueRequired(params.inventory);

  // Get user info to check for default inventory
  const { data: userInfo, isLoading: userInfoLoading } =
    api.useGetUserInfoQuery();

  // Get inventory data to validate if the inventory exists and user has access
  const {
    data: inventoryData,
    error: inventoryError,
    isLoading: inventoryLoading,
  } = api.useGetInventoryQuery(inventory, { skip: !inventory });

  useEffect(() => {
    if (userInfoLoading || inventoryLoading) return;

    // If inventory doesn't exist or user doesn't have access, redirect appropriately
    if (inventoryError || !inventoryData) {
      if (userInfo?.defaultInventoryId) {
        // Redirect to default inventory
        router.replace(`/${lng}/${userInfo.defaultInventoryId}`);
      } else if (userInfo?.defaultCityId) {
        // Redirect to default city
        router.replace(`/${lng}/cities/${userInfo.defaultCityId}`);
      } else {
        // Redirect to onboarding
        router.replace(`/${lng}/onboarding`);
      }
    }
  }, [
    inventoryError,
    inventoryData,
    userInfo,
    userInfoLoading,
    inventoryLoading,
    lng,
    router,
  ]);

  // Show loading state while validating
  if (userInfoLoading || inventoryLoading) {
    return <ProgressLoader />;
  }

  // If inventory doesn't exist, don't render (will redirect)
  if (inventoryError || !inventoryData) {
    return null;
  }

  return <HomePage lng={lng} isPublic={false} />;
}
