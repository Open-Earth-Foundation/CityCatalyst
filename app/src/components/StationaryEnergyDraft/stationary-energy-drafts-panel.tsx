"use client";

import {
  Badge,
  Box,
  Heading,
  HStack,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { useParams } from "next/navigation";
import { MdAdd } from "react-icons/md";

import { useTranslation } from "@/i18n/client";
import { FLOW_BUTTON_RADIUS } from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import {
  draftRunStatusLabel,
  formatDraftRunUpdatedAt,
} from "@/components/StationaryEnergyDraft/stationary-energy-drafts-panel-format";
import type { DraftListItem } from "@/components/StationaryEnergyDraft/types";
import type {
  StationaryEnergyChatArtifactControllerActions,
  StationaryEnergyChatArtifactControllerState,
} from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-artifact-controller";
import { Button } from "@/components/ui/button";
import { getParamValueRequired } from "@/util/helpers";

export type DraftsPanelProps = {
  actions: Pick<
    StationaryEnergyChatArtifactControllerActions,
    "selectDraft" | "startOver"
  >;
  state: Pick<
    StationaryEnergyChatArtifactControllerState,
    "activeDraftRunId" | "draftRuns" | "draftListLoading" | "loadingAction"
  >;
};

function draftReviewLabel(draftRun: DraftListItem): string | null {
  return draftRun.reviewable_proposal_count > 0
    ? `${draftRun.resolved_review_count}/${draftRun.reviewable_proposal_count}`
    : null;
}

function DraftSessionButton(props: {
  draftRun: DraftListItem;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
  lng: string;
  t: TFunction;
}) {
  const reviewLabel = draftReviewLabel(props.draftRun);
  return (
    <chakra.button
      type="button"
      onClick={props.disabled ? undefined : props.onSelect}
      disabled={props.disabled}
      aria-current={props.active ? "true" : undefined}
      display="block"
      w="full"
      textAlign="left"
      px="m"
      py="s"
      borderWidth="1px"
      borderRadius="rounded"
      borderColor={props.active ? "interactive.primary" : "border.overlay"}
      borderLeftWidth="3px"
      borderLeftColor={props.active ? "interactive.primary" : "transparent"}
      bg={props.active ? "background.alternative" : "base.light"}
      cursor={props.disabled ? "not-allowed" : "pointer"}
      transition="background 140ms ease, border-color 140ms ease"
      _hover={
        props.disabled
          ? undefined
          : {
              bg: props.active
                ? "background.alternative"
                : "background.neutral",
            }
      }
    >
      <HStack justify="space-between" gap="s">
        <Text
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="semibold"
          color="content.primary"
          truncate
          minW={0}
        >
          {draftRunStatusLabel(props.t, props.draftRun.status)}
        </Text>
        {reviewLabel ? (
          <Badge
            bg="background.backgroundGreyFlat"
            color="content.secondary"
            borderRadius="rounded"
            fontSize="label.sm"
            flexShrink={0}
          >
            {reviewLabel}
          </Badge>
        ) : null}
      </HStack>
      <Text color="content.tertiary" fontSize="label.sm" mt="2px">
        {formatDraftRunUpdatedAt(props.t, props.draftRun.updated_at, props.lng)}
      </Text>
    </chakra.button>
  );
}

export function StationaryEnergyDraftsPanel({
  actions,
  state,
}: DraftsPanelProps) {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const { t } = useTranslation(lng, "stationary-energy-agentic");
  const hasDrafts = state.draftRuns.length > 0;

  return (
    <Box
      h={{ base: "auto", xl: "full" }}
      minH={0}
      display="flex"
      flexDir="column"
      overflow={{ base: "visible", xl: "hidden" }}
      bg="base.light"
      borderColor="border.neutral"
      borderRightWidth={{ base: 0, xl: "1px" }}
    >
      <Box borderBottomWidth="1px" borderColor="border.neutral" px="m" py="m">
        <VStack align="stretch" gap="s">
          <Heading fontSize="title.sm" fontWeight="semibold">
            {t("drafts-panel-title")}
          </Heading>
          <Button
            borderRadius={FLOW_BUTTON_RADIUS}
            loading={state.loadingAction === "start"}
            onClick={actions.startOver}
            gap="xs"
            w="full"
          >
            <MdAdd />
            {t("artifact-new-draft")}
          </Button>
        </VStack>
      </Box>

      <VStack
        align="stretch"
        gap="s"
        flex={{ base: "initial", xl: 1 }}
        minH={0}
        overflowY={{ base: "visible", xl: "auto" }}
        px="m"
        py="m"
      >
        {hasDrafts ? (
          state.draftRuns.map((draftRun) => (
            <DraftSessionButton
              key={draftRun.draft_run_id}
              draftRun={draftRun}
              active={draftRun.draft_run_id === state.activeDraftRunId}
              disabled={state.draftListLoading}
              onSelect={() => actions.selectDraft(draftRun.draft_run_id)}
              lng={lng}
              t={t}
            />
          ))
        ) : (
          <Text color="content.tertiary" fontSize="label.md" px="xs">
            {t("drafts-panel-empty")}
          </Text>
        )}
      </VStack>
    </Box>
  );
}
