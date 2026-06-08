"use client";

import { Box, Flex, Grid, Icon, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MdArrowBack } from "react-icons/md";

import { useTranslation } from "@/i18n/client";
import { ArtifactPanel } from "@/components/StationaryEnergyDraft/stationary-energy-artifact-panel";
import { ClimaChatPanel } from "@/components/StationaryEnergyDraft/stationary-energy-chat-artifact-panels";
import { SourceDetailPane } from "@/components/StationaryEnergyDraft/stationary-energy-source-detail-pane";
import ProgressLoader from "@/components/ProgressLoader";
import { api } from "@/services/api";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import { getParamValueRequired } from "@/util/helpers";

import type { DraftStage } from "@/components/StationaryEnergyDraft/flow";
import { useStationaryEnergyChatArtifactController } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-artifact-controller";

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

  return (
    <Box
      ref={surfaceRef}
      bg="background.neutral"
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
      py={{ base: 3, md: 6 }}
    >
      <Box
        maxW="1480px"
        mx="auto"
        px={{ base: 3, md: 6 }}
        h="full"
        display="flex"
        flexDir="column"
        minH={0}
        gap={{ base: 3, md: 4 }}
      >
        <NextLink href={backHref} style={{ textDecoration: "none" }}>
          <Flex
            align="center"
            gap={2}
            w="fit-content"
            flexShrink={0}
            color="interactive.secondary"
            _hover={{ color: "interactive.primary" }}
          >
            <Icon as={MdArrowBack} boxSize={5} />
            <Text
              textTransform="uppercase"
              fontFamily="heading"
              fontSize="button.sm"
              fontWeight="bold"
            >
              {t("chat-page-back")}
            </Text>
          </Flex>
        </NextLink>

        {!featureEnabled ? (
          <Box bg="base.light" borderRadius="rounded" p={5}>
            <Text color="content.primary" fontWeight="semibold">
              {t("chat-page-feature-disabled")}
            </Text>
          </Box>
        ) : (
          <Grid
            flex="1"
            minH={0}
            templateColumns={{ base: "1fr", xl: "430px minmax(0, 1fr)" }}
            gap={{ base: 4, xl: 6 }}
            alignItems="stretch"
            overflow={{ base: "visible", xl: "hidden" }}
          >
            <Box
              minW={0}
              minH={0}
              order={{ base: 2, xl: 1 }}
              overflow={{ base: "visible", xl: "hidden" }}
            >
              <ClimaChatPanel actions={actions} state={state} />
            </Box>

            {/*
              From xl up, the rows panel and the source-review panel sit
              side-by-side in a locked two-column grid (each scrolls
              internally); the source column just widens at 2xl. Below xl they
              stack and the page scrolls. The split must engage at xl — when it
              only engaged at 2xl, laptop widths (1280–1535px) fell back to a
              single stacked column and the row list collapsed.
            */}
            <Box
              display={{ base: "flex", xl: "grid" }}
              flexDir="column"
              minW={0}
              minH={0}
              order={{ base: 1, xl: 2 }}
              overflow={{ base: "visible", xl: "hidden" }}
              gridTemplateColumns={{
                xl: "minmax(0, 1fr) 340px",
                "2xl": "minmax(0, 1fr) 380px",
              }}
              gap={{ base: 4, xl: 5 }}
            >
              <Box minW={0} minH={0} overflow={{ base: "visible", xl: "hidden" }}>
                <ArtifactPanel
                  actions={actions}
                  cityName={cityName}
                  inventoryYear={inventoryYear}
                  state={state}
                />
              </Box>
              <Box minW={0} minH={0} overflow={{ base: "visible", xl: "hidden" }}>
                <SourceDetailPane actions={actions} state={state} />
              </Box>
            </Box>
          </Grid>
        )}
      </Box>
    </Box>
  );
}
