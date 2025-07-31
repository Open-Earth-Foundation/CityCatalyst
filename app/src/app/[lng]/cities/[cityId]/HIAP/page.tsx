"use client";
import React from "react";
import { use } from "react";
import { useTranslation } from "@/i18n/client";
import {
  useGetCityPopulationQuery,
  useGetInventoryByCityIdQuery,
} from "@/services/api";
import { ACTION_TYPES } from "@/util/types";
import { Box, Tabs } from "@chakra-ui/react";
import { formatEmissions } from "@/util/helpers";
import { Hero } from "@/components/GHGIHomePage/Hero";
import { HiapTab } from "@/app/[lng]/cities/[cityId]/HIAP/HiapTab";
import { NavigationBar } from "@/components/navigation-bar";
import ProgressLoader from "@/components/ProgressLoader";

export default function HIAPPage(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const { lng, cityId } = use(props.params);
  const { t } = useTranslation(lng, "hiap");
  const { data: inventory, isLoading: isInventoryLoading } =
    useGetInventoryByCityIdQuery(cityId);

  const formattedEmissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions)
    : { value: t("N/A"), unit: "" };

  const { data: population } = useGetCityPopulationQuery(
    { cityId: inventory?.cityId!, year: inventory?.year! },
    { skip: !inventory?.cityId || !inventory?.year },
  );
  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar showMenu lng={lng} />
      {isInventoryLoading || !inventory ? (
        <ProgressLoader />
      ) : (
        <>
          <Hero
            inventory={inventory}
            isPublic={false}
            currentInventoryId={inventory?.inventoryId}
            isInventoryLoading={isInventoryLoading}
            formattedEmissions={formattedEmissions}
            t={t}
            population={population}
          />
          <Box display="flex" mx="auto" mt="80px" w="full" maxW="1090px">
            <Tabs.Root
              variant="line"
              lazyMount
              defaultValue={ACTION_TYPES.Mitigation}
            >
              <Tabs.List>
                {Object.values(ACTION_TYPES).map((actionType) => (
                  <Tabs.Trigger key={actionType} value={actionType}>
                    {t(`action-type-${actionType}`)}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              {Object.values(ACTION_TYPES).map((actionType) => (
                <Tabs.Content key={actionType} value={actionType}>
                  <HiapTab type={actionType} inventory={inventory} />
                </Tabs.Content>
              ))}
            </Tabs.Root>
          </Box>
        </>
      )}
    </Box>
  );
}
