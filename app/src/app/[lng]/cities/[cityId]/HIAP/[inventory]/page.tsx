"use client";
import React, { useState, useEffect, useMemo } from "react";
import { use } from "react";
import { useTranslation } from "@/i18n/client";
import {
  useGetCityPopulationQuery,
  useGetHiapQuery,
  useGetInventoriesQuery,
} from "@/services/api";
import { ACTION_TYPES, LANGUAGES } from "@/util/types";
import { Box, Icon, Tabs, Text } from "@chakra-ui/react";
import { formatEmissions } from "@/util/helpers";
import { HiapTab } from "@/app/[lng]/cities/[cityId]/HIAP/HiapTab";
import ProgressLoader from "@/components/ProgressLoader";
import { AdaptationTabIcon, MitigationTabIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { ClimateActionsSection } from "@/components/HIAP/ClimateActionsSection";
import { HiapPageLayout } from "../HiapPageLayout";
import i18next from "i18next";
import { api } from "@/services/api";
import {
  YearSelector,
  YearSelectorItem,
} from "@/components/shared/YearSelector";

export default function HIAPInventoryPage(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = use(props.params);
  const { t } = useTranslation(lng, "hiap");
  const router = useRouter();
  const lang = i18next.language as LANGUAGES;

  const [ignoreExisting, setIgnoreExisting] = useState(false);
  const [shouldRefetch, setShouldRefetch] = useState(false);
  const [userTriggeredHiap, setUserTriggeredHiap] = useState(false);

  // Get inventory data
  const {
    data: inventory,
    isLoading: isInventoryLoading,
    error: inventoryError,
  } = api.useGetInventoryQuery(inventoryId!, { skip: !inventoryId });

  // getCityData
  const { data: city, isLoading: isCityLoading } = api.useGetCityQuery(cityId, {
    skip: !cityId,
  });

  // Fetch all inventories for the city to populate the year selector
  const { data: allInventories, isLoading: isInventoriesLoading } =
    useGetInventoriesQuery({ cityId: cityId! }, { skip: !cityId });

  // Transform inventories for the year selector
  const inventoriesForYearSelector: YearSelectorItem[] = useMemo(() => {
    if (!allInventories) return [];
    return allInventories
      .filter((inv) => inv.year && inv.inventoryId) // Only include inventories with year and ID
      .map((inv) => ({
        year: inv.year!,
        inventoryId: inv.inventoryId,
        lastUpdate: inv.lastUpdated || new Date(),
      }))
      .sort((a, b) => b.year - a.year); // Sort by year, newest first
  }, [allInventories]);

  const handleYearSelect = (yearData: YearSelectorItem) => {
    // Navigate to the HIAP page with the selected inventory
    router.push(`/${lng}/cities/${cityId}/HIAP/${yearData.inventoryId}`);
  };

  const {
    data: hiapData,
    isLoading,
    error,
    refetch,
  } = useGetHiapQuery(
    {
      inventoryId: inventory?.inventoryId || "",
      lng: lang,
      actionType: ACTION_TYPES.Mitigation,
      ignoreExisting: ignoreExisting,
    },
    { skip: !inventory?.inventoryId || !userTriggeredHiap },
  );

  // Handle reprioritization when ignoreExisting changes
  useEffect(() => {
    if (shouldRefetch && ignoreExisting) {
      refetch().finally(() => {
        setIgnoreExisting(false);
        setShouldRefetch(false);
      });
    }
  }, [ignoreExisting, shouldRefetch, refetch]);

  const formattedEmissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions)
    : { value: t("N/A"), unit: "" };

  const { data: population } = useGetCityPopulationQuery(
    { cityId: inventory?.cityId!, year: inventory?.year! },
    { skip: !inventory?.cityId || !inventory?.year },
  );

  // Show loading state while fetching
  if (isInventoryLoading || isInventoriesLoading || isCityLoading) {
    return (
      <Box
        h="full"
        display="flex"
        flexDirection="column"
        bg="background.backgroundLight"
      >
        <ProgressLoader />
      </Box>
    );
  }

  // If inventory doesn't exist or user doesn't have access, show error state
  if (inventoryError || !inventory) {
    // If city data is not loaded yet, show loading
    if (!city) {
      return (
        <Box
          h="full"
          display="flex"
          flexDirection="column"
          bg="background.backgroundLight"
        >
          <ProgressLoader />
        </Box>
      );
    }

    return (
      <HiapPageLayout
        inventory={null}
        formattedEmissions={formattedEmissions}
        lng={lng}
        population={null}
        city={city}
      >
        <ClimateActionsSection
          t={t}
          onReprioritize={() => {
            setIgnoreExisting(true);
            setShouldRefetch(true);
          }}
          setIgnoreExisting={setIgnoreExisting}
          actions={hiapData}
          inventory={null}
          actionType={ACTION_TYPES.Mitigation}
          lng={lng as any}
          isReprioritizing={isLoading}
        />
        <Tabs.Root
          variant="line"
          lazyMount
          defaultValue={ACTION_TYPES.Mitigation}
        >
          <Tabs.List>
            {Object.values(ACTION_TYPES).map((actionType) => (
              <Tabs.Trigger
                key={actionType}
                value={actionType}
                color="interactive.control"
                display="flex"
                gap="16px"
                _selected={{
                  color: "interactive.secondary",
                  fontFamily: "heading",
                  fontWeight: "bold",
                }}
              >
                <Icon
                  as={
                    actionType === ACTION_TYPES.Mitigation
                      ? MitigationTabIcon
                      : AdaptationTabIcon
                  }
                />
                {t(`action-type-${actionType}`)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {Object.values(ACTION_TYPES).map((actionType) => (
            <Tabs.Content key={actionType} value={actionType} p="0" w="full">
              <HiapTab
                type={actionType}
                inventory={null}
                cityData={city}
                onTriggerHiap={() => setUserTriggeredHiap(true)}
              />
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </HiapPageLayout>
    );
  }

  // If city data is not loaded yet, show loading
  if (!city) {
    return (
      <Box
        h="full"
        display="flex"
        flexDirection="column"
        bg="background.backgroundLight"
      >
        <ProgressLoader />
      </Box>
    );
  }

  return (
    <HiapPageLayout
      inventory={inventory}
      formattedEmissions={formattedEmissions}
      lng={lng}
      population={population || null}
      city={city}
    >
      {/* Year Selector Section */}
      {inventoriesForYearSelector.length > 1 && (
        <Box
          w="full"
          mb={6}
          display="flex"
          flexDirection="column"
          gap={6}
          py={6}
          bg="background.backgroundLight"
        >
          <Text
            color="content.primary"
            fontWeight="bold"
            lineHeight="24px"
            fontSize="headline.sm"
            fontFamily="heading"
            fontStyle="normal"
          >
            {t("inventory-year")}
          </Text>
          <YearSelector
            inventories={inventoriesForYearSelector}
            currentInventoryId={inventory.inventoryId}
            lng={lng}
            t={t}
            onYearSelect={handleYearSelect}
          />
        </Box>
      )}
      <ClimateActionsSection
        t={t}
        onReprioritize={() => {
          setIgnoreExisting(true);
          setShouldRefetch(true);
        }}
        actions={hiapData}
        inventory={inventory}
      />

      <Tabs.Root
        variant="line"
        lazyMount
        defaultValue={ACTION_TYPES.Mitigation}
      >
        <Tabs.List>
          {Object.values(ACTION_TYPES).map((actionType) => (
            <Tabs.Trigger
              key={actionType}
              value={actionType}
              color="interactive.control"
              display="flex"
              gap="16px"
              _selected={{
                color: "interactive.secondary",
                fontFamily: "heading",
                fontWeight: "bold",
              }}
            >
              <Icon
                as={
                  actionType === ACTION_TYPES.Mitigation
                    ? MitigationTabIcon
                    : AdaptationTabIcon
                }
              />
              {t(`action-type-${actionType}`)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {Object.values(ACTION_TYPES).map((actionType) => (
          <Tabs.Content key={actionType} value={actionType} p="0" w="full">
            <HiapTab
              type={actionType}
              inventory={inventory}
              cityData={city}
              onTriggerHiap={() => setUserTriggeredHiap(true)}
            />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </HiapPageLayout>
  );
}
