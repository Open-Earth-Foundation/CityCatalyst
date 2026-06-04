"use client";
/* eslint-disable i18next/no-literal-string */

import { Box, Grid, Text } from "@chakra-ui/react";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ArtifactPanel } from "@/components/StationaryEnergyDraft/stationary-energy-artifact-panel";
import { ClimaChatPanel } from "@/components/StationaryEnergyDraft/stationary-energy-chat-artifact-panels";
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

  const cityName = inventory?.city?.name ?? "Selected city";
  const inventoryYear = inventory?.year ?? "Inventory year unavailable";
  const { actions, state } = controller;

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
        gap={{ base: 3, md: 5 }}
      >
        {!featureEnabled ? (
          <Box bg="base.light" borderRadius="rounded" p={5}>
            <Text color="content.primary" fontWeight="semibold">
              Enable CA_SERVICE_INTEGRATION and STATIONARY_ENERGY_AGENTIC to use
              this workflow.
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
              <ClimaChatPanel
                stage={state.stage}
                draftState={state.draftState}
                counts={state.counts}
                pendingDecisionCount={state.pendingDecisionCount}
                decisionReviewContext={state.decisionReviewContext}
                decisionState={state.decisionState}
                resolvedProposalIds={state.resolvedProposalIds}
                sourcePreference={state.sourcePreference}
                sourcePreferenceOptions={state.sourcePreferenceOptions}
                chatMessages={state.chatMessages}
                chatInput={state.chatInput}
                loadingAction={state.loadingAction}
                canPersistDraftReview={state.canPersistDraftReview}
                canSaveToInventory={state.canSaveToInventory}
                hasSourceBackedProposals={state.hasSourceBackedProposals}
                errorMessage={state.errorMessage}
                showStaleWarning={state.showStaleWarning}
                staleDraft={state.staleDraft}
                onChatInputChange={actions.setChatInput}
                onChatSubmit={actions.submitChat}
                onStopChat={actions.stopChat}
                onStartDraft={actions.startDraftFromChat}
                onPreference={actions.choosePreference}
                onDecisionChoice={actions.chooseDecision}
                onEditDecision={actions.editDecision}
                onContinueStaleDraft={actions.continueStaleDraft}
                onStartOver={actions.startOver}
                onSaveDraft={actions.saveDraft}
                onSaveToInventory={actions.saveToInventory}
              />
            </Box>

            <Box
              minW={0}
              minH={0}
              order={{ base: 1, xl: 2 }}
              overflow={{ base: "visible", xl: "hidden" }}
            >
              <ArtifactPanel
                cityName={cityName}
                inventoryYear={inventoryYear}
                stage={state.stage}
                rows={state.rows}
                counts={state.counts}
                activeProposalId={state.activeProposalId}
                loadingAction={state.loadingAction}
                draftStatus={state.draftStatus}
                hasSourceBackedProposals={state.hasSourceBackedProposals}
                hasDraft={state.hasDraft}
                draftRuns={state.draftRuns}
                draftListLoading={state.draftListLoading}
                activeDraftRunId={state.activeDraftRunId}
                canPersistDraftReview={state.canPersistDraftReview}
                canSaveToInventory={state.canSaveToInventory}
                unresolvedCount={state.unresolvedCount}
                onStartDraft={actions.startDraftFromArtifact}
                onRefresh={actions.refreshActiveDraft}
                onSelectDraft={actions.selectDraft}
                onSaveDraft={actions.saveDraft}
                onSaveToInventory={actions.saveToInventory}
              />
            </Box>
          </Grid>
        )}
      </Box>
    </Box>
  );
}
