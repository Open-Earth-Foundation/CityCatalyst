"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/services/api";
import { useGetCityYearsQuery } from "@/services/api";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import HomePage from "@/components/GHGIHomePage/HomePage";

export default function GHGIPage() {
  const router = useRouter();
  const { lng, cityId, inventoryId } = useParams();

  const cityIdValue = Array.isArray(cityId) ? cityId[0] : cityId;
  const inventoryIdValue = Array.isArray(inventoryId)
    ? inventoryId[0]
    : inventoryId;

  // Get user info to check if they have default city/inventory
  const { data: userInfo, isLoading: userInfoLoading } =
    api.useGetUserInfoQuery();

  // Get city years to find the most recent inventory
  const { data: cityYears, isLoading: cityYearsLoading } = useGetCityYearsQuery(
    cityIdValue!,
    { skip: !cityIdValue },
  );

  useEffect(() => {
    if (userInfoLoading || cityYearsLoading) return;
    // no inventory in URL
    if (!inventoryIdValue) {
      // get the most recent inventory for the city
      if (cityYears?.years && cityYears.years.length > 0) {
        const mostRecentInventory = cityYears.years.sort(
          (a, b) => b.year - a.year,
        )[0];

        if (mostRecentInventory) {
          router.replace(
            `/${lng}/cities/${cityIdValue}/GHGI/${mostRecentInventory.inventoryId}`,
          );
          return;
        }
      } else {
        // there are no inventories for this city, redirect to onboarding
        router.replace(`/${lng}/cities/${cityIdValue}/GHGI/onboarding`);
      }
    }
  }, [
    userInfo,
    cityYears,
    userInfoLoading,
    cityYearsLoading,
    lng,
    router,
    cityIdValue,
    inventoryIdValue,
  ]);

  // Show loading state while determining where to redirect
  if (userInfoLoading || cityYearsLoading) {
    return <div>Loading...</div>;
  }

  // This should not render as we always redirect
  return null;
}
