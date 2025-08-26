"use client";
import React from "react";
import { use } from "react";
import { useTranslation } from "@/i18n/client";
import {
  useGetCityPopulationQuery,
  useGetInventoryByCityIdQuery,
} from "@/services/api";
import { ACTION_TYPES } from "@/util/types";
import { Box, Button, Icon, Tabs, Text } from "@chakra-ui/react";
import { formatEmissions } from "@/util/helpers";
import { Hero } from "@/components/GHGIHomePage/Hero";
import { HiapTab } from "@/app/[lng]/cities/[cityId]/HIAP/HiapTab";
import ProgressLoader from "@/components/ProgressLoader";
import { AdaptationTabIcon, MitigationTabIcon } from "@/components/icons";
import { LuRefreshCw } from "react-icons/lu";

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
            lng={lng}
            population={population}
          />

          <Box
            display="flex"
            mx="auto"
            py="56px"
            w="full"
            maxW="1090px"
            flexDirection="column"
            gap="24px"
          >
            {/* citycatalyst actions section */}
            <Box display="flex" flexDirection="column" gap="24px" pb="24px">
              <Box display="flex" flexDirection="column" gap="16px">
                <Text
                  color="content.link"
                  fontFamily="heading"
                  fontSize="title.sm"
                  fontWeight="bold"
                  textTransform="uppercase"
                >
                  {t("citycatalyst-actions-title")}
                </Text>
              </Box>
              <Box
                display="flex"
                flexDirection="row"
                gap="24px"
                alignItems="center"
              >
                <Box display="flex" flexDirection="column" gap="8px">
                  <Text
                    fontFamily="heading"
                    fontWeight="bold"
                    fontSize="headline.sm"
                    color="content.secondary"
                  >
                    {t("top-actions-for-your-city")}
                  </Text>
                  <Text
                    fontFamily="body"
                    fontSize="body.lg"
                    color="content.tertiary"
                  >
                    {t("top-actions-for-your-city-description")}
                  </Text>
                </Box>
                <Box>
                  <Button
                    bg="content.link"
                    color="white"
                    px="24px"
                    h="84px"
                    borderRadius="16px"
                    gap="12px"
                    onClick={() => {
                      // TODO: add logic to re-prioritize actions
                    }}
                  >
                    <Icon
                      as={LuRefreshCw}
                      rotate={"270deg"}
                      boxSize={"36px"}
                      color="white"
                    />
                    <Text
                      fontFamily="heading"
                      fontWeight="bold"
                      fontSize="headline.sm"
                      textTransform="none"
                    >
                      {t("re-prioritize-actions")}
                    </Text>
                  </Button>
                </Box>
              </Box>
            </Box>
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
                <Tabs.Content
                  key={actionType}
                  value={actionType}
                  p="0"
                  w="full"
                >
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
