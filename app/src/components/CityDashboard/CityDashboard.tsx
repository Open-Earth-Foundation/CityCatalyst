import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { useTranslation } from "@/i18n/client";
import {
  api,
  useGetMostRecentCityPopulationQuery,
  useGetInventoriesQuery,
  useGetCityDashboardQuery,
} from "@/services/api";
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
import { EmptyDashboard } from "./EmptyDashboard";
import { ModuleDashboardWidgets } from "../ModuleWidgets";

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

  const {
    data: city,
    isLoading: isCityLoading,
    error: cityError,
  } = api.useGetCityQuery(cityId!, {
    skip: !cityIdFromParam,
  });

  const { data: population } = useGetMostRecentCityPopulationQuery(
    { cityId: cityIdFromParam! },
    { skip: !cityIdFromParam },
  );

  const { data: inventories, isLoading: isInventoriesLoading } =
    useGetInventoriesQuery(
      { cityId: cityIdFromParam! },
      { skip: !cityIdFromParam },
    );

  const latestInventory = inventories?.[0];


  const { data: dashboardData, isLoading: isDashboardLoading } =
    useGetCityDashboardQuery(
      { cityId: cityIdFromParam!, lng },
      { skip: !cityIdFromParam },
    );


  const { data: orgData, isLoading: isOrgDataLoading } =
    api.useGetOrganizationForCityQuery(cityIdFromParam!, {
      skip: !cityIdFromParam,
    });

  const { organization, setOrganization } = useOrganizationContext();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (orgData) {
      const logoUrl = orgData?.logoUrl ?? null;
      const active = orgData?.active ?? true;

      if (
        organization?.logoUrl !== logoUrl ||
        organization?.active !== active
      ) {
        setOrganization({ logoUrl, active });
      }
      setTheme(orgData?.theme?.themeKey ?? "blue_theme");
    } else if (!isOrgDataLoading && !orgData) {
      setTheme("blue_theme");
    }
  }, [isOrgDataLoading, orgData, setTheme]);

  if (
    isOrgDataLoading ||
    isUserInfoLoading ||
    isCityLoading ||
    isInventoriesLoading ||
    isDashboardLoading
  ) {
    return <ProgressLoader />;
  }

  return (
    <Box h="100%" minH="100vh" bg="base.light">
      {cityIdFromParam && city && orgData && latestInventory && (
        <>
          <Hero
            city={city}
            year={parsedYear}
            isPublic={isPublic}
            isLoading={isOrgDataLoading || isCityLoading}
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
              <Button variant="outline" onClick={onPublishOpen}>
                <Image
                  fill="pink"
                  src="/assets/public_blue.svg"
                  alt="publish-to-web"
                  width="24px"
                  height="24px"
                />
                Publish
              </Button>
            </HStack>
            <Box h="1px" mt="6" bg="border.neutral" />
            {dashboardData && Object.keys(dashboardData).length > 0 ? (
              <ModuleDashboardWidgets
                cityId={cityIdFromParam!}
                lng={lng}
                t={t}
              />
            ) : (
              <>
                <EmptyDashboard t={t} />
              </>
            )}
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
