"use client";

import { useTranslation } from "@/i18n/client";
import { api, useGetMostRecentCityPopulationQuery } from "@/services/api";
import { Box, HStack, Separator } from "@chakra-ui/react";
import { use } from "react";
import ProgressLoader from "../ProgressLoader";
import { Hero } from "../HomePageJN/Hero";
import { MdBarChart } from "react-icons/md";
import { HeadlineMedium } from "@/components/package/Texts/Headline";
import { ModuleDashboardWidgets } from "../ModuleWidgets";
import MissingCityDashboard from "../missing-city-dashboard";
import { isFetchBaseQueryError } from "@/util/helpers";

export default function PublicDashboard({
  params,
}: {
  params: Promise<{ lng: string; cityId: string; params?: string[] }>;
}) {
  const { lng, cityId, params: routeParams } = use(params);
  const year = routeParams?.[0]; // First param is the year
  const { t } = useTranslation(lng, "dashboard");


  // Get public city data
  const {
    data: publicCity,
    isLoading: isPublicCityLoading,
    error: publicCityError,
  } = api.useGetPublicCityQuery(cityId!, {
    skip: !cityId,
  });

  const { data: population } = useGetMostRecentCityPopulationQuery(
    { cityId: cityId! },
    { skip: !cityId },
  );

  // Get public city inventories
  const { data: publicInventories, isLoading: isPublicInventoriesLoading } =
    api.useGetPublicCityInventoriesQuery(cityId!, {
      skip: !cityId,
    });


  const latestInventory = publicInventories?.[0];

  if (isFetchBaseQueryError(publicCityError)) {
    return (
      <MissingCityDashboard
        lng={lng}
        cityId={cityId}
        error={publicCityError}
        isPublic={true}
      />
    );
  }

  if (isPublicCityLoading || isPublicInventoriesLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box h="100%" minH="100vh" bg="base.light">
      {cityId && publicCity && latestInventory && (
        <>
          <Hero
            city={publicCity}
            year={latestInventory.year}
            isPublic={true}
            isLoading={isPublicCityLoading}
            t={t}
            population={population}
            hideMap={true}
          />
          <Box maxW="1090px" mx="auto">
            <HStack gap={4} mb={6}>
              <MdBarChart color="#7A7B9A" />
              <HeadlineMedium>
                {t("journey.your-city-dashboard")}
              </HeadlineMedium>
            </HStack>
            <Box h="1px" mt="6" bg="border.neutral" />
            <ModuleDashboardWidgets
              cityId={cityId!}
              lng={lng}
              t={t}
              isPublic={true}
              year={year ? parseInt(year) : undefined}
            />
          </Box>
        </>
      )}
    </Box>
  );
}
