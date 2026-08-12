"use client";
import { useEffect } from "react";
import { use } from "react";
import { Box } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { useGetInventoriesQuery } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { MeedErrorCard } from "./components/MeedErrorCard";

export default function MEEDPage(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const router = useRouter();
  const { lng, cityId } = use(props.params);
  const { t } = useTranslation(lng, "meed");

  const cityIdValue = Array.isArray(cityId) ? cityId[0] : cityId;

  // Get city inventories to find the most recent one
  const {
    data: cityInventories,
    isLoading: cityInventoriesLoading,
    isError,
    refetch,
  } = useGetInventoriesQuery({ cityId: cityIdValue! }, { skip: !cityIdValue });

  useEffect(() => {
    if (cityInventoriesLoading || isError) return;

    // If we have inventories, redirect to the most recent one
    if (cityInventories && cityInventories.length > 0) {
      const mostRecentInventory = [...cityInventories].sort(
        (a, b) => (b.year || 0) - (a.year || 0),
      )[0];

      if (mostRecentInventory) {
        router.replace(
          `/${lng}/cities/${cityIdValue}/MEED/${mostRecentInventory.inventoryId}`,
        );
        return;
      }
    } else if (cityInventories) {
      // Genuinely no inventories for this city — send them to create one.
      // Only this branch may redirect: a failed request is not the same as an
      // empty list, and treating it as one told the user their city had no
      // inventories when the request had simply errored.
      router.replace(`/${lng}/cities/${cityIdValue}/GHGI/onboarding`);
    }
  }, [
    cityInventories,
    cityInventoriesLoading,
    isError,
    lng,
    router,
    cityIdValue,
  ]);

  if (isError) {
    return (
      <Box
        h="full"
        bg="background.backgroundLight"
        display="flex"
        justifyContent="center"
        py="xxl-3"
        px="l"
      >
        <Box w="full" maxW="640px">
          <MeedErrorCard
            variant="panel"
            title={t("inventories-error-title")}
            body={t("inventories-error-body")}
            retryLabel={t("retry")}
            onRetry={() => void refetch()}
          />
        </Box>
      </Box>
    );
  }

  // Show loading state while determining where to redirect
  return <ProgressLoader />;
}
