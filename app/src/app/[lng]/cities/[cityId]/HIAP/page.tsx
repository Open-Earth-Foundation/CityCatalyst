"use client";
import React from "react";
import { use } from "react";
import { useTranslation } from "@/i18n/client";
import {
  useGetCityPopulationQuery,
  useGetHiapQuery,
  useGetInventoryByCityIdQuery,
} from "@/services/api";
import { ACTION_TYPES, LANGUAGES } from "@/util/types";
import { Box, Button, Icon, Tabs, Text } from "@chakra-ui/react";
import { formatEmissions } from "@/util/helpers";
import { HiapTab } from "@/app/[lng]/cities/[cityId]/HIAP/HiapTab";
import ProgressLoader from "@/components/ProgressLoader";
import { AdaptationTabIcon, MitigationTabIcon } from "@/components/icons";
import { LuRefreshCw, LuFileX } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { ClimateActionsSection } from "@/components/HIAP/ClimateActionsSection";
import { HiapPageLayout } from "./HiapPageLayout";
import i18next from "i18next";
import { api } from "@/services/api";

export default function HIAPPage(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const { lng, cityId } = use(props.params);
  const { t } = useTranslation(lng, "hiap");
  const router = useRouter();
  const lang = i18next.language as LANGUAGES;

  const {
    data: inventory,
    isLoading: isInventoryLoading,
    error: inventoryError,
  } = useGetInventoryByCityIdQuery(cityId);

  // getCityData
  const { data: city } = api.useGetCityQuery(cityId, {
    skip: !cityId,
  });

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
    },
    { skip: !inventory?.inventoryId },
  );

  const formattedEmissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions)
    : { value: t("N/A"), unit: "" };

  const { data: population } = useGetCityPopulationQuery(
    { cityId: inventory?.cityId!, year: inventory?.year! },
    { skip: !inventory?.cityId || !inventory?.year },
  );

  // fetch city data
  const { data: cityData } = api.useGetCityQuery(cityId, {
    skip: !cityId,
  });

  // Show loading state while fetching
  if (isInventoryLoading) {
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

  // Show empty state if no inventory found
  if (!inventory) {
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
          onReprioritize={() => refetch()}
          actions={hiapData}
          inventory={null}
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
                cityData={cityData!}
              />
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </HiapPageLayout>
    );
  }

  return (
    <HiapPageLayout
      inventory={inventory}
      formattedEmissions={formattedEmissions}
      lng={lng}
      population={population || null}
    >
      <ClimateActionsSection
        t={t}
        onReprioritize={() => refetch()}
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
              cityData={cityData!}
            />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </HiapPageLayout>
  );
}
