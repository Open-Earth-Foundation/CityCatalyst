"use client";

import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { useInventoryOrganization } from "@/hooks/use-inventory-organization";
import { Box, HStack, useDisclosure, Image } from "@chakra-ui/react";
import { useParams } from "next/navigation";
import { use } from "react";
import ProgressLoader from "../ProgressLoader";
import { Hero } from "../HomePageJN/Hero";
import { MdBarChart } from "react-icons/md";
import { HeadlineMedium } from "@/components/package/Texts/Headline";
import ModalPublish from "../GHGIHomePage/DownloadAndShareModals/ModalPublish";
import { CityWithProjectDataResponse, InventoryResponse } from "@/util/types";
import { Button } from "../ui/button";
import { ModuleDashboardWidgets } from "../ModuleWidgets";
import MissingCityDashboard from "../missing-city-dashboard";
import { isFetchBaseQueryError } from "@/util/helpers";
import Footer from "../Sections/Footer";

export default function CitiesDashboardPage({
  params,
  isPublic,
}: {
  params: Promise<{ lng: string; cityId: string }>;
  isPublic: boolean;
}) {
  const { lng, cityId } = use(params);
  const { t } = useTranslation(lng, "dashboard");
  const { year } = useParams();

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  // Get the city ID from params or user's default
  const cityIdFromParam = (cityId as string) ?? userInfo?.defaultCityId;
  const parsedYear = parseInt(year as string);

  const {
    open: isPublishOpen,
    onOpen: onPublishOpen,
    onClose: onPublishClose,
  } = useDisclosure();

  // Single consolidated API call for all dashboard data
  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    error: dashboardError,
  } = api.useGetCityDashboardQuery(
    {
      cityId: cityIdFromParam!,
      lng,
      isPublic,
    },
    {
      skip: !cityIdFromParam,
    },
  );

  // Extract data from consolidated response
  const city = dashboardData?.city;
  const inventories = dashboardData?.inventories || [];
  const population = dashboardData?.population;
  const organization = dashboardData?.organization;
  const widgets = dashboardData?.widgets;

  const latestInventory = inventories?.[0] as InventoryResponse | undefined;

  // Use inventory organization hook for theming - pass pre-fetched organization data if available
  const { isInventoryOrgDataLoading } = useInventoryOrganization(
    latestInventory?.inventoryId ?? "",
    organization ?? undefined, // Pass pre-fetched organization data to skip API call
  );

  if (isFetchBaseQueryError(dashboardError)) {
    return (
      <MissingCityDashboard
        lng={lng}
        cityId={cityIdFromParam}
        error={dashboardError}
        isPublic={isPublic}
      />
    );
  }

  if (isDashboardLoading || isUserInfoLoading || isInventoryOrgDataLoading) {
    return <ProgressLoader />;
  }

  // Always render the dashboard - let widgets handle their own empty states
  return (
    <Box h="100%" minH="100vh" bg="base.light">
      {cityIdFromParam && city && (
        <>
          <Hero
            city={city as CityWithProjectDataResponse}
            year={parsedYear}
            ghgiCityData={latestInventory as InventoryResponse}
            isPublic={isPublic}
            isLoading={isInventoryOrgDataLoading}
            t={t}
            population={population ?? undefined}
          />
          <Box maxW="1090px" mx="auto">
            <HStack justifyContent="space-between" w="full">
              <HStack gap={4}>
                <MdBarChart color="#7A7B9A" />
                <HeadlineMedium>
                  {t("journey.your-city-dashboard")}
                </HeadlineMedium>
              </HStack>
              {!isPublic && latestInventory && (
                <Button variant="outline" onClick={onPublishOpen}>
                  <Image
                    fill="pink"
                    src="/assets/public_blue.svg"
                    alt="publish-to-web"
                    width="24px"
                    height="24px"
                  />
                  {t("publish")}
                </Button>
              )}
            </HStack>
            <Box h="1px" mt="6" bg="border.neutral" />
            <ModuleDashboardWidgets
              cityId={cityIdFromParam!}
              lng={lng}
              t={t}
              isPublic={isPublic}
              ghgiData={widgets?.ghgi}
              hiapData={widgets?.hiap}
              ccraData={widgets?.ccra}
              inventories={inventories}
              city={city as CityWithProjectDataResponse | undefined}
              population={population}
            />
          </Box>
        </>
      )}
      {latestInventory && (
        <ModalPublish
          // Todo: add close state action
          setModalOpen={() => {}}
          t={t}
          isPublishOpen={isPublishOpen}
          onPublishClose={onPublishClose}
          inventoryId={latestInventory.inventoryId}
          inventory={latestInventory as InventoryResponse}
        />
      )}
      <Footer lng={lng} />
    </Box>
  );
}
