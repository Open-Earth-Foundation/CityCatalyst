"use client";
import { useEffect } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import { useGetInventoriesQuery } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";

export default function HIAPPage(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const router = useRouter();
  const { lng, cityId } = use(props.params);

  const cityIdValue = Array.isArray(cityId) ? cityId[0] : cityId;

  // Get city inventories to find the most recent one
  const { data: cityInventories, isLoading: cityInventoriesLoading } = useGetInventoriesQuery(
    { cityId: cityIdValue! },
    { skip: !cityIdValue },
  );

  useEffect(() => {
    if (cityInventoriesLoading) return;
    
    // If we have inventories, redirect to the most recent one
    if (cityInventories && cityInventories.length > 0) {
      const mostRecentInventory = [...cityInventories].sort(
        (a, b) => (b.year || 0) - (a.year || 0),
      )[0];

      if (mostRecentInventory) {
        router.replace(
          `/${lng}/cities/${cityIdValue}/HIAP/${mostRecentInventory.inventoryId}`,
        );
        return;
      }
    } else {
      // No inventories for this city, redirect to GHGI onboarding
      router.replace(`/${lng}/cities/${cityIdValue}/GHGI/onboarding`);
    }
  }, [
    cityInventories,
    cityInventoriesLoading,
    lng,
    router,
    cityIdValue,
  ]);

  // Show loading state while determining where to redirect
  if (cityInventoriesLoading) {
    return <ProgressLoader />;
  }

  // Show loading state while redirecting (prevents blank screen)
  return <ProgressLoader />;
}
