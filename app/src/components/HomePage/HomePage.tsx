"use client";

import React, { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { BsPlus } from "react-icons/bs";
import Cookies from "js-cookie";

import Footer from "@/components/Sections/Footer";
import { useTranslation } from "@/i18n/client";
import {
  api,
  useGetCityPopulationQuery,
  useGetCityYearsQuery,
  useGetOrganizationForInventoryQuery,
  useGetUserAccessStatusQuery,
} from "@/services/api";
import { CheckUserSession } from "@/util/check-user-session";
import { formatEmissions } from "@/util/helpers";
import { Box, Icon, Tabs, Text, VStack } from "@chakra-ui/react";
import MissingInventory from "@/components/missing-inventory";
import InventoryCalculationTab from "@/components/HomePage/InventoryCalculationTab";
import InventoryReportTab from "../../app/[lng]/[inventory]/InventoryResultTab";
import NotAvailable from "@/components/NotAvailable";
import { Hero } from "@/components/HomePage/Hero";
import { ActionCards } from "@/components/HomePage/ActionCards";
import { InventoryPreferencesCard } from "@/components/HomePage/InventoryPreferencesCard";
import { YearSelectorCard } from "@/components/Cards/years-selection-card";
import { Button } from "../ui/button";
import CapTab from "@/app/[lng]/[inventory]/CapTab";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import ProgressLoader from "@/components/ProgressLoader";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { logger } from "@/services/logger";

function isFetchBaseQueryError(error: unknown): error is FetchBaseQueryError {
  return typeof error === "object" && error != null && "status" in error;
}

export default function HomePage({
  lng,
  isPublic,
  inventoryId,
}: {
  lng: string;
  isPublic: boolean;
  inventoryId?: string;
}) {
  const { t } = useTranslation(lng, "dashboard");
  const cookieLanguage = Cookies.get("i18next");
  const router = useRouter();
  // Check if user is authenticated otherwise route to login page
  isPublic || CheckUserSession();
  const language = cookieLanguage ?? lng;
  const { inventory: inventoryParam } = useParams();

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  // make sure that the inventory ID is using valid values
  let inventoryIdFromParam: string | undefined;
  if (inventoryId && inventoryId != "null") {
    inventoryIdFromParam = inventoryId;
  } else if (inventoryParam && inventoryParam != "null") {
    if (typeof inventoryParam !== "string") {
      inventoryIdFromParam = inventoryParam[0];
    } else {
      inventoryIdFromParam = inventoryParam;
    }
  } else {
    inventoryIdFromParam = userInfo?.defaultInventoryId ?? undefined;
  }

  const {
    data: inventory,
    isLoading: isInventoryLoading,
    error: inventoryError,
  } = api.useGetInventoryQuery(inventoryIdFromParam ?? "default");

  useEffect(() => {
    if (inventoryError) {
      logger.error(
        { inventoryError, inventoryId: inventoryIdFromParam ?? "default" },
        "Failed to load inventory",
      );

      // 401 status can be cached from logged-out state, ignore it but redirect to onboarding on other errors
      if (
        !isFetchBaseQueryError(inventoryError) ||
        inventoryError.status !== 401
      ) {
        setTimeout(() => router.push("/onboarding"), 0);
      }
    } else if (!inventoryIdFromParam && !isInventoryLoading && inventory) {
      if (inventory.inventoryId) {
        // fix inventoryId in URL without reloading page
        const newPath = "/" + language + "/" + inventory.inventoryId;
        history.replaceState(null, "", newPath);
        if (typeof window !== "undefined") {
          const currentPath = window.location.pathname;
          if (!currentPath.endsWith("/")) {
            router.replace(`${currentPath}/`);
          }
        } else {
          return;
        }
      } else {
        // fixes warning "Cannot update a component (`Router`) while rendering a different component (`Home`)"
        setTimeout(() => router.push("/onboarding"), 0);
      }
    }
  }, [
    isInventoryLoading,
    inventory,
    inventoryIdFromParam,
    language,
    router,
    inventoryError,
  ]);

  // query API data
  // TODO maybe rework this logic into one RTK query:
  // https://redux-toolkit.js.org/rtk-query/usage/customizing-queries#performing-multiple-requests-with-a-single-query

  const { data: inventoryProgress, isLoading: isInventoryProgressLoading } =
    api.useGetInventoryProgressQuery(inventoryIdFromParam ?? "default");

  const { data: city } = api.useGetCityQuery(inventory?.cityId!, {
    skip: !inventory?.cityId,
  });

  const { data: population } = useGetCityPopulationQuery(
    { cityId: inventory?.cityId!, year: inventory?.year! },
    { skip: !inventory?.cityId || !inventory?.year },
  );

  const { data: cityYears, isLoading } = useGetCityYearsQuery(
    inventory?.cityId as string,
    { skip: !inventory?.cityId || !inventory?.year },
  );

  const formattedEmissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions)
    : { value: t("N/A"), unit: "" };

  const inventoriesForCurrentCity = useMemo(() => {
    if (!cityYears) return [];
    return [...cityYears.years].sort((a, b) => b.year - a.year) || [];
  }, [cityYears]);

  const { data: inventoryOrgData, isLoading: isInventoryOrgDataLoading } =
    useGetOrganizationForInventoryQuery(inventoryIdFromParam!, {
      skip: !inventoryIdFromParam,
    });

  const { isFrozenCheck, organization, setOrganization } =
    useOrganizationContext();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (inventoryOrgData) {
      const logoUrl = inventoryOrgData?.logoUrl ?? null;
      const active = inventoryOrgData?.active ?? true;

      if (organization.logoUrl !== logoUrl || organization.active !== active) {
        setOrganization({ logoUrl, active });
      }
      setTheme(inventoryOrgData?.theme?.themeKey ?? "blue_theme");
    } else if (!isInventoryOrgDataLoading && !inventoryOrgData) {
      setTheme("blue_theme");
    }
  }, [isInventoryOrgDataLoading, inventoryOrgData, setTheme]);

  if (isInventoryLoading || isInventoryOrgDataLoading || isUserInfoLoading) {
    return <ProgressLoader />;
  }

  return (
    <>
      {inventory === null && !isInventoryLoading && !isUserInfoLoading && (
        <>
          {isPublic ? (
            <NotAvailable lng={language} />
          ) : (
            <MissingInventory lng={language} />
          )}
          <Footer lng={language} />
        </>
      )}
      {inventory && (
        <>
          <Hero
            inventory={inventory}
            isPublic={isPublic}
            currentInventoryId={inventory?.inventoryId}
            isInventoryLoading={isInventoryLoading}
            formattedEmissions={formattedEmissions}
            t={t}
            population={population}
          />

          <Box className="flex mx-auto mt-[80px] w-full max-w-[1090px]">
            <VStack align="start">
              <InventoryPreferencesCard t={t} isPublic={isPublic} />
              {!isPublic && (
                <ActionCards
                  inventoryId={inventory?.inventoryId}
                  t={t}
                  lng={language}
                  city={city}
                  inventory={inventory}
                />
              )}
            </VStack>
          </Box>
          <Box
            className="h-full pt-[48px] pb-[100px]"
            bg="background.backgroundLight"
            px={8}
          >
            <Box className="mx-auto w-full max-w-[1090px] css-0">
              {/* Years section */}
              {!isPublic ? (
                <>
                  <Box className="w-full mb-6 flex items-center justify-between">
                    <Text
                      color="content.primary"
                      fontWeight="bold"
                      lineHeight="24px"
                      fontSize="headline.sm"
                      fontFamily="heading"
                      fontStyle="normal"
                      data-testid="inventory-year-title"
                    >
                      {t("inventory-year")}
                    </Text>
                    <Button
                      data-testid="add-new-inventory-button"
                      title={t("add-new-inventory")}
                      h="48px"
                      aria-label="activity-button"
                      fontSize="button.md"
                      gap="8px"
                      onClick={() =>
                        isFrozenCheck() ? null : router.push("/onboarding")
                      }
                    >
                      <Icon as={BsPlus} h="16px" w="16px" />
                      {t("add-new-inventory")}
                    </Button>
                  </Box>
                  <YearSelectorCard
                    cityId={inventory.cityId as string}
                    inventories={inventoriesForCurrentCity}
                    currentInventoryId={inventory.inventoryId}
                    lng={language}
                    t={t}
                  />
                  <Tabs.Root
                    className="mt-12"
                    variant="line"
                    lazyMount
                    defaultValue="tab-emission-inventory-calculation-title"
                  >
                    <Tabs.List>
                      {[
                        "tab-emission-inventory-calculation-title",
                        "tab-emission-inventory-results-title",
                        ...(inventory?.city?.country === "Brazil" &&
                        hasFeatureFlag(FeatureFlags.CAP_TAB_ENABLED)
                          ? ["tab-cap-title"]
                          : []),
                      ].map((tab, index) => (
                        <Tabs.Trigger key={index} value={tab}>
                          <Text
                            fontFamily="heading"
                            fontSize="title.md"
                            fontWeight="medium"
                            data-testid={tab}
                          >
                            {t(tab)}
                          </Text>
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                    <Tabs.Content value="tab-emission-inventory-calculation-title">
                      <InventoryCalculationTab
                        lng={language}
                        inventory={inventory}
                        inventoryProgress={inventoryProgress}
                        isInventoryProgressLoading={isInventoryProgressLoading}
                      />
                    </Tabs.Content>
                    <Tabs.Content value="tab-emission-inventory-results-title">
                      <InventoryReportTab
                        isPublic={isPublic}
                        lng={language}
                        population={population}
                        inventory={inventory}
                      />
                    </Tabs.Content>
                    {inventory?.city?.country === "Brazil" && (
                      <Tabs.Content value="tab-cap-title">
                        <CapTab inventory={inventory} lng={lng} />
                      </Tabs.Content>
                    )}
                  </Tabs.Root>
                </>
              ) : (
                <InventoryReportTab
                  lng={language}
                  population={population}
                  inventory={inventory}
                  isPublic={isPublic}
                />
              )}
            </Box>
          </Box>
          <Footer lng={language} />
        </>
      )}
    </>
  );
}
