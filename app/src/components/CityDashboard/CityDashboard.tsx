"use client";

import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { useTranslation } from "@/i18n/client";
import {
  api,
  useGetMostRecentCityPopulationQuery,
  useGetInventoriesQuery,
} from "@/services/api";
import { useInventoryOrganization } from "@/hooks/use-inventory-organization";
import { Box, HStack, Separator, useDisclosure, Image } from "@chakra-ui/react";
import Cookies from "js-cookie";
import { useTheme } from "next-themes";
import { useParams, useRouter } from "next/navigation";
import { use, useEffect } from "react";
import ProgressLoader from "../ProgressLoader";
import { Hero } from "../HomePageJN/Hero";
import { MdBarChart } from "react-icons/md";
import { HeadlineMedium } from "../Texts/Headline";
import ModalPublish from "../GHGIHomePage/DownloadAndShareModals/ModalPublish";
import { InventoryResponse } from "@/util/types";
import { Button } from "../ui/button";
import { ModuleDashboardWidgets } from "../ModuleWidgets";
import MissingCityDashboard from "../missing-city-dashboard";
import { isFetchBaseQueryError } from "@/util/helpers";

export default function CitiesDashboardPage({
  params,
  isPublic,
}: {
  params: Promise<{ lng: string; cityId: string }>;
  isPublic: boolean;
}) {
  const { lng, cityId } = use(params);
  const { t } = useTranslation(lng, "dashboard");
  const cookieLanguage = Cookies.get("i18next");
  const router = useRouter();
  const { year } = useParams();

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  // make sure that the inventory ID is using valid values
  let cityIdFromParam = (cityId as string) ?? userInfo?.defaultCityId;
  const parsedYear = parseInt(year as string);

  const {
    open: isPublishOpen,
    onOpen: onPublishOpen,
    onClose: onPublishClose,
  } = useDisclosure();

  // Use different API calls based on public mode
  const {
    data: privateCity,
    isLoading: isPrivateCityLoading,
    error: privateCityError,
  } = api.useGetCityQuery(cityId!, {
    skip: !cityIdFromParam || isPublic,
  });

  const {
    data: publicCity,
    isLoading: isPublicCityLoading,
    error: publicCityError,
  } = api.useGetPublicCityQuery(cityId!, {
    skip: !cityIdFromParam || !isPublic,
  });

  // Use the appropriate data based on mode
  const city = isPublic ? publicCity : privateCity;
  const isCityLoading = isPublic ? isPublicCityLoading : isPrivateCityLoading;
  const cityError = isPublic ? publicCityError : privateCityError;

  const { data: population } = useGetMostRecentCityPopulationQuery(
    { cityId: cityIdFromParam! },
    { skip: !cityIdFromParam },
  );

  // Use different inventory queries based on public mode
  const { data: privateInventories, isLoading: isPrivateInventoriesLoading } =
    useGetInventoriesQuery(
      { cityId: cityIdFromParam! },
      { skip: !cityIdFromParam || isPublic },
    );

  const { data: publicInventories, isLoading: isPublicInventoriesLoading } =
    api.useGetPublicCityInventoriesQuery(cityIdFromParam!, {
      skip: !cityIdFromParam || !isPublic,
    });

  // Use the appropriate data based on mode
  const inventories = isPublic ? publicInventories : privateInventories;
  const isInventoriesLoading = isPublic
    ? isPublicInventoriesLoading
    : isPrivateInventoriesLoading;

  const latestInventory = inventories?.[0];

  // Use inventory organization hook for theming
  const { isInventoryOrgDataLoading } = useInventoryOrganization(
    latestInventory?.inventoryId!,
  );

  if (isFetchBaseQueryError(cityError)) {
    return (
      <MissingCityDashboard
        lng={lng}
        cityId={cityIdFromParam}
        error={cityError}
        isPublic={isPublic}
      />
    );
  }

  if (
    isInventoryOrgDataLoading ||
    isUserInfoLoading ||
    isCityLoading ||
    isInventoriesLoading
  ) {
    return <ProgressLoader />;
  }

  return (
    <Box h="100%" minH="100vh" bg="base.light">
      {cityIdFromParam && city && latestInventory && (
        <>
          <Hero
            city={city}
            year={parsedYear}
            isPublic={isPublic}
            isLoading={isInventoryOrgDataLoading || isCityLoading}
            t={t}
            population={population}
          />
          <Box maxW="1090px" mx="auto">
            <HStack justifyContent="space-between" w="full">
              <HStack gap={4}>
                <MdBarChart color="#7A7B9A" />
                <HeadlineMedium>
                  {t("journey.your-city-dashboard")}
                </HeadlineMedium>
              </HStack>
              {!isPublic && (
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
              inventoryId={latestInventory?.inventoryId}
            />
          </Box>
        </>
      )}
      <ModalPublish
        // Todo: add close state action
        setModalOpen={() => {}}
        t={t}
        isPublishOpen={isPublishOpen}
        onPublishClose={onPublishClose}
        inventoryId={latestInventory?.inventoryId!}
        inventory={latestInventory as InventoryResponse}
      />
    </Box>
  );
}
