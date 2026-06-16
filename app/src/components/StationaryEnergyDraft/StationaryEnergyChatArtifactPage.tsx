"use client";

import { Box, Flex, HStack, Icon, Text, chakra } from "@chakra-ui/react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  MdArrowBack,
  MdChevronLeft,
  MdChevronRight,
  MdExpandMore,
} from "react-icons/md";

import { AskAiIcon } from "@/components/icons";
import ProgressLoader from "@/components/ProgressLoader";
import { ArtifactPanel } from "@/components/StationaryEnergyDraft/stationary-energy-artifact-panel";
import { ClimaChatPanel } from "@/components/StationaryEnergyDraft/stationary-energy-chat-artifact-panels";
import type { DraftStage } from "@/components/StationaryEnergyDraft/flow";
import { useStationaryEnergyChatArtifactController } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-artifact-controller";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import { getParamValueRequired } from "@/util/helpers";

interface StationaryEnergyChatArtifactPageProps {
  initialStage?: DraftStage;
}

export function StationaryEnergyChatArtifactPage({
  initialStage = "start",
}: StationaryEnergyChatArtifactPageProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const params = useParams();
  const searchParams = useSearchParams();
  const lng = getParamValueRequired(params.lng);
  const { t } = useTranslation(lng, "stationary-energy-agentic");
  const cityId = getParamValueRequired(params.cityId);
  const inventoryId = getParamValueRequired(params.inventory);
  const queryDraftRunId = searchParams.get("draftRunId");
  const featureEnabled =
    hasFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION) &&
    hasFeatureFlag(FeatureFlags.STATIONARY_ENERGY_AGENTIC);

  const { data: inventory, isLoading: inventoryLoading } =
    api.useGetInventoryQuery(inventoryId, {
      skip: !inventoryId,
    });
  const [desktopViewportHeight, setDesktopViewportHeight] = useState<
    number | null
  >(null);
  const [progressPanelOpen, setProgressPanelOpen] = useState(true);
  const controller = useStationaryEnergyChatArtifactController({
    cityId,
    featureEnabled,
    initialStage,
    inventoryId,
    lng,
    queryDraftRunId,
    t,
  });

  useEffect(() => {
    const updateDesktopViewportHeight = () => {
      if (window.innerWidth < 1280) {
        setDesktopViewportHeight(null);
        return;
      }

      const surface = surfaceRef.current;
      if (!surface) {
        return;
      }

      const { top } = surface.getBoundingClientRect();
      setDesktopViewportHeight(Math.max(window.innerHeight - top, 480));
    };

    updateDesktopViewportHeight();
    window.addEventListener("resize", updateDesktopViewportHeight);

    return () => {
      window.removeEventListener("resize", updateDesktopViewportHeight);
    };
  }, []);

  if (inventoryLoading) {
    return <ProgressLoader />;
  }

  const cityName = inventory?.city?.name ?? t("chat-page-selected-city");
  const inventoryYear =
    inventory?.year ?? t("chat-page-inventory-year-unavailable");
  const { actions, state } = controller;
  const backHref = `/${lng}/cities/${cityId}/GHGI/${inventoryId}`;
  const draftedCount = state.rows.filter((row) =>
    ["done", "manual"].includes(row.state),
  ).length;
  const progress =
    state.rows.length > 0
      ? Math.round((draftedCount / state.rows.length) * 100)
      : 0;

  return (
    <Box
      ref={surfaceRef}
      bg="background.neutral"
      position="relative"
      minH={{
        base: "100dvh",
        xl: desktopViewportHeight
          ? `${desktopViewportHeight}px`
          : "calc(100dvh - 88px)",
      }}
      h={{
        base: "auto",
        xl: desktopViewportHeight
          ? `${desktopViewportHeight}px`
          : "calc(100dvh - 88px)",
      }}
      overflow={{ base: "visible", xl: "hidden" }}
    >
      <Flex
        align="center"
        justify="space-between"
        gap={4}
        h="56px"
        px={{ base: 3, md: 6 }}
        bg="base.light"
        borderBottomWidth="1px"
        borderColor="border.neutral"
        flexShrink={0}
      >
        <HStack gap={4} minW={0}>
          <HStack gap={2} minW={0}>
            <Box
              w="28px"
              h="28px"
              display="grid"
              placeItems="center"
              borderRadius="full"
              bg="interactive.tertiary"
              color="base.light"
              flexShrink={0}
            >
              <Icon as={AskAiIcon} h={18} w={18} />
            </Box>
            <Text
              fontFamily="heading"
              fontSize="title.sm"
              fontWeight="semibold"
              color="content.primary"
            >
              {t("chat-panel-title")}
            </Text>
          </HStack>
          <chakra.button
            type="button"
            display={{ base: "none", sm: "inline-flex" }}
            alignItems="center"
            gap={2}
            minH="36px"
            px={3}
            borderWidth="1px"
            borderColor="border.overlay"
            borderRadius="rounded"
            bg="base.light"
            color="content.primary"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
          >
            {t("artifact-sector-title")}
            <Icon as={MdExpandMore} boxSize={4} color="content.secondary" />
          </chakra.button>
        </HStack>

        <HStack gap={{ base: 2, md: 4 }} flexShrink={0}>
          <Text
            display={{ base: "none", md: "block" }}
            color="content.secondary"
            fontSize="label.md"
            fontWeight="semibold"
          >
            {t("chat-page-inventory-label", {
              year: inventoryYear,
            })}
          </Text>
          <NextLink href={backHref} style={{ textDecoration: "none" }}>
            <Flex
              align="center"
              gap={2}
              w="fit-content"
              color="interactive.secondary"
              _hover={{ color: "interactive.primary" }}
            >
              <Icon as={MdArrowBack} boxSize={5} />
              <Text
                display={{ base: "none", sm: "block" }}
                textTransform="uppercase"
                fontFamily="heading"
                fontSize="button.sm"
                fontWeight="bold"
              >
                {t("chat-page-back")}
              </Text>
            </Flex>
          </NextLink>
        </HStack>
      </Flex>

      <Box
        h={{ base: "auto", xl: "calc(100% - 56px)" }}
        minH={0}
        position="relative"
        overflow={{ base: "visible", xl: "hidden" }}
      >
        {!featureEnabled ? (
          <Box bg="base.light" borderRadius="rounded" p={5} m={6}>
            <Text color="content.primary" fontWeight="semibold">
              {t("chat-page-feature-disabled")}
            </Text>
          </Box>
        ) : (
          <Box
            h={{ base: "auto", xl: "full" }}
            minH={0}
            position="relative"
            overflow={{ base: "visible", xl: "hidden" }}
          >
            <Box
              h={{ base: "auto", xl: "full" }}
              minH={0}
              pr={{
                base: 0,
                xl: progressPanelOpen ? "520px" : 0,
              }}
              transition="padding-right 220ms ease"
              overflow={{ base: "visible", xl: "hidden" }}
            >
              <ClimaChatPanel actions={actions} state={state} />
            </Box>

            <Box
              display={{ base: "none", xl: "block" }}
              position="absolute"
              top={0}
              right={0}
              bottom={0}
              w="520px"
              pt={0}
              pb={0}
              pr={0}
              transform={
                progressPanelOpen
                  ? "translateX(0)"
                  : "translateX(100%)"
              }
              transition="transform 220ms ease"
              zIndex={4}
            >
              <Flex
                position="absolute"
                left="-44px"
                top="50%"
                transform="translateY(-50%)"
                flexDir="column"
                align="stretch"
                gap={2}
                zIndex={5}
              >
                <chakra.button
                  type="button"
                  aria-label={
                    progressPanelOpen
                      ? t("artifact-panel-collapse")
                      : t("artifact-panel-expand")
                  }
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  w="44px"
                  h="56px"
                  borderWidth="1px"
                  borderColor="border.neutral"
                  borderRightWidth={0}
                  borderLeftRadius="rounded-xl"
                  bg="base.light"
                  color="content.primary"
                  onClick={() => setProgressPanelOpen((open) => !open)}
                >
                  <Icon
                    as={progressPanelOpen ? MdChevronRight : MdChevronLeft}
                    boxSize={7}
                  />
                </chakra.button>
              </Flex>
              <Box
                h="full"
                minH={0}
                pointerEvents={progressPanelOpen ? "auto" : "none"}
                aria-hidden={!progressPanelOpen}
              >
                <ArtifactPanel
                  actions={actions}
                  cityName={cityName}
                  flush
                  inventoryYear={inventoryYear}
                  squared
                  state={state}
                />
              </Box>
            </Box>

            <Box display={{ base: "block", xl: "none" }} px={3} pb={4}>
              <chakra.button
                type="button"
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                w="full"
                px={4}
                py={3}
                borderWidth="1px"
                borderColor="border.neutral"
                borderRadius="rounded-xl"
                bg="base.light"
                color="content.primary"
                fontFamily="heading"
                fontWeight="semibold"
                onClick={() => setProgressPanelOpen((open) => !open)}
              >
                {t("artifact-panel-expand")}
                <Text color="interactive.tertiary">{progress}%</Text>
              </chakra.button>
              {progressPanelOpen ? (
                <Box mt={3}>
                  <ArtifactPanel
                    actions={actions}
                    cityName={cityName}
                    inventoryYear={inventoryYear}
                    state={state}
                  />
                </Box>
              ) : null}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
