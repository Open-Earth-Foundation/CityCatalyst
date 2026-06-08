"use client";

import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { useParams } from "next/navigation";
import { MdRefresh, MdSave } from "react-icons/md";

import { useTranslation } from "@/i18n/client";
import ProgressLoader from "@/components/ProgressLoader";
import { FLOW_BUTTON_RADIUS } from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import type {
  ArtifactRow,
  DraftCounts,
  DraftStage,
} from "@/components/StationaryEnergyDraft/flow";
import type { DraftListItem } from "@/components/StationaryEnergyDraft/types";
import type {
  StationaryEnergyChatArtifactControllerActions,
  StationaryEnergyChatArtifactControllerState,
} from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-artifact-controller";
import { Button } from "@/components/ui/button";
import { getParamValueRequired } from "@/util/helpers";

export type ArtifactPanelProps = {
  actions: Pick<
    StationaryEnergyChatArtifactControllerActions,
    | "refreshActiveDraft"
    | "saveDraft"
    | "saveToInventory"
    | "selectDraft"
    | "startDraftFromArtifact"
  >;
  cityName: string;
  inventoryYear: string | number;
  state: Pick<
    StationaryEnergyChatArtifactControllerState,
    | "activeDraftRunId"
    | "activeProposalId"
    | "canPersistDraftReview"
    | "canSaveToInventory"
    | "counts"
    | "draftListLoading"
    | "draftRuns"
    | "draftStatus"
    | "hasDraft"
    | "hasSourceBackedProposals"
    | "loadingAction"
    | "rows"
    | "stage"
    | "unresolvedCount"
  >;
};

function draftRunStatusLabel(t: TFunction, status: string): string {
  if (status === "reviewed") {
    return t("artifact-draft-status-reviewed");
  }
  if (status === "ready") {
    return t("artifact-draft-status-ready");
  }
  if (status === "failed") {
    return t("artifact-draft-status-failed");
  }
  return status.replaceAll("_", " ");
}

function formatDraftRunUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function draftRunOptionLabel(t: TFunction, draftRun: DraftListItem): string {
  const reviewLabel =
    draftRun.reviewable_proposal_count > 0
      ? t("artifact-draft-review-label", {
          resolved: draftRun.resolved_review_count,
          total: draftRun.reviewable_proposal_count,
        })
      : t("artifact-draft-review-empty");
  return `${draftRunStatusLabel(t, draftRun.status)} | ${reviewLabel} | ${formatDraftRunUpdatedAt(draftRun.updated_at)}`;
}

function stageChip(
  t: TFunction,
  stage: DraftStage,
  status: string,
): {
  bg: string;
  color: string;
  label: string;
} {
  if (status === "saved") {
    return {
      bg: "sentiment.positiveOverlay",
      color: "interactive.primary",
      label: t("artifact-stage-saved"),
    };
  }
  if (status === "partially_saved") {
    return {
      bg: "sentiment.warningOverlay",
      color: "interactive.quaternary",
      label: t("artifact-stage-partially-saved"),
    };
  }
  if (status === "no_changes") {
    return {
      bg: "background.backgroundGreyFlat",
      color: "content.secondary",
      label: t("artifact-stage-no-changes"),
    };
  }
  if (stage === "start") {
    return {
      bg: "background.backgroundGreyFlat",
      color: "content.secondary",
      label: t("artifact-stage-ready-to-draft"),
    };
  }
  if (stage === "drafting") {
    return {
      bg: "background.alternative",
      color: "interactive.primary",
      label: t("artifact-stage-drafting"),
    };
  }
  if (stage === "decision") {
    return {
      bg: "sentiment.warningOverlay",
      color: "interactive.quaternary",
      label: t("artifact-stage-needs-review"),
    };
  }
  return {
    bg: "sentiment.positiveOverlay",
    color: "interactive.primary",
    label: t("artifact-stage-review-complete"),
  };
}

function overviewTitle(t: TFunction, stage: DraftStage): string {
  if (stage === "start") {
    return t("artifact-overview-start");
  }
  if (stage === "drafting") {
    return t("artifact-overview-drafting");
  }
  if (stage === "decision") {
    return t("artifact-overview-decision");
  }
  return t("artifact-overview-review");
}

function RowMarker({ state }: { state: ArtifactRow["state"] }) {
  if (state === "active") {
    return <ProgressLoader boxHeight="12px" boxWidth="12px" size="sm" />;
  }
  const color =
    state === "done"
      ? "interactive.tertiary"
      : state === "manual" || state === "warning"
        ? "interactive.quaternary"
        : "border.neutral";
  return (
    <Box
      w="12px"
      h="12px"
      borderWidth="2px"
      borderColor={color}
      bg={state === "queued" || state === "empty" ? "transparent" : color}
      borderRadius="full"
    />
  );
}

function ArtifactRowView(props: {
  row: ArtifactRow;
  active: boolean;
  drafting: boolean;
  t: TFunction;
}) {
  const isActive =
    props.active || (props.drafting && props.row.id === "placeholder-0");
  const bg =
    props.row.state === "warning"
      ? "sentiment.warningOverlay"
      : isActive
        ? "background.neutral"
        : "base.light";

  return (
    <Flex
      align="center"
      gap={4}
      minH="66px"
      px={4}
      py={3}
      bg={bg}
      borderBottomWidth="1px"
      borderColor="border.neutral"
      _last={{ borderBottomWidth: 0 }}
    >
      <RowMarker state={isActive ? "active" : props.row.state} />
      <Box minW={0} flex="1">
        <Text color="content.primary" fontSize="body.md" truncate>
          {props.row.label}
        </Text>
        <Text color="content.tertiary" fontSize="label.md" truncate>
          {props.row.scope || props.t("artifact-scope-fallback")}
        </Text>
      </Box>
      <Box minW="150px" textAlign="right">
        {props.row.value ? (
          <>
            <Text fontFamily="heading" fontSize="body.md" fontWeight="semibold">
              {props.row.value}
            </Text>
            <Text color="content.secondary" fontSize="label.sm" truncate>
              {props.row.source}
            </Text>
          </>
        ) : (
          <Text color="content.tertiary" fontSize="label.md">
            {props.row.status}
          </Text>
        )}
      </Box>
    </Flex>
  );
}

export function ArtifactPanel({
  actions,
  cityName,
  inventoryYear,
  state,
}: ArtifactPanelProps) {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const { t } = useTranslation(lng, "stationary-energy-agentic");
  const draftedCount = state.rows.filter((row) =>
    ["done", "manual"].includes(row.state),
  ).length;
  const progress =
    state.rows.length > 0
      ? Math.round((draftedCount / state.rows.length) * 100)
      : 0;
  const chip = stageChip(t, state.stage, state.draftStatus);

  return (
    <Box
      minW={0}
      h={{ base: "auto", xl: "full" }}
      minH={0}
      display="flex"
      flexDir="column"
      overflow="hidden"
    >
      <Box
        bg="background.backgroundLight"
        borderColor="border.neutral"
        borderWidth="1px"
        borderRadius="rounded"
        overflow="hidden"
      >
        <Flex
          align={{ base: "flex-start", md: "center" }}
          justify="space-between"
          gap={4}
          px={5}
          py={4}
          bg="base.light"
          borderBottomWidth="1px"
          borderColor="border.neutral"
          flexDir={{ base: "column", md: "row" }}
        >
          <HStack gap={3}>
            <Box
              w="34px"
              h="34px"
              display="grid"
              placeItems="center"
              borderRadius="rounded"
              bg="brand.primary"
              color="base.light"
              fontFamily="heading"
              fontWeight="semibold"
            >
              I
            </Box>
            <Box>
              <Heading fontSize="title.md" fontWeight="semibold">
                {t("artifact-header-title")}
              </Heading>
              <Text color="content.tertiary" fontSize="label.md">
                {cityName} / {inventoryYear} /{" "}
                {t("artifact-header-framework")}
              </Text>
            </Box>
          </HStack>
          <VStack
            align={{ base: "stretch", md: "end" }}
            gap={2}
            w={{ base: "full", md: "auto" }}
          >
            {state.draftRuns.length > 0 ? (
              <Box minW={{ base: "full", md: "320px" }}>
                <Flex
                  align={{ base: "flex-start", sm: "center" }}
                  justify="space-between"
                  gap={2}
                  mb={1}
                  flexDir={{ base: "column", sm: "row" }}
                >
                  <Text
                    color="content.tertiary"
                    fontSize="label.sm"
                    fontWeight="semibold"
                  >
                    {t("artifact-drafts-saved")}
                  </Text>
                  <Button
                    variant="outline"
                    borderRadius={FLOW_BUTTON_RADIUS}
                    loading={state.loadingAction === "start"}
                    onClick={actions.startDraftFromArtifact}
                  >
                    {t("artifact-new-draft")}
                  </Button>
                </Flex>
                <chakra.select
                  value={state.activeDraftRunId ?? ""}
                  onChange={(event) => {
                    if (event.target.value) {
                      actions.selectDraft(event.target.value);
                    }
                  }}
                  disabled={state.draftListLoading}
                  w="full"
                  minH="40px"
                  px={3}
                  borderWidth="1px"
                  borderColor="border.overlay"
                  borderRadius="rounded"
                  bg="base.light"
                  color="content.primary"
                >
                  {!state.activeDraftRunId ? (
                    <option value="">{t("artifact-select-saved-draft")}</option>
                  ) : null}
                  {state.draftRuns.map((draftRun) => (
                    <option
                      key={draftRun.draft_run_id}
                      value={draftRun.draft_run_id}
                    >
                      {draftRunOptionLabel(t, draftRun)}
                    </option>
                  ))}
                </chakra.select>
              </Box>
            ) : null}
            <Badge
              bg={chip.bg}
              color={chip.color}
              borderRadius="rounded"
              px={3}
              alignSelf={{ base: "flex-start", md: "auto" }}
            >
              {chip.label}
            </Badge>
          </VStack>
        </Flex>
      </Box>

      <Box
        mt={4}
        p={4}
        bg="base.light"
        borderColor="border.neutral"
        borderWidth="1px"
        borderRadius="rounded"
      >
        <Flex justify="space-between" align="center" gap={4}>
          <Text fontFamily="heading" fontSize="body.md" fontWeight="semibold">
            {overviewTitle(t, state.stage)}
          </Text>
          <Text color="content.secondary" fontSize="label.md">
            {t("artifact-progress-drafted", {
              drafted: draftedCount,
              total: state.rows.length,
            })}
          </Text>
        </Flex>
        <Box mt={3} h="8px" bg="background.neutral" borderRadius="full">
          <Box
            h="full"
            w={`${progress}%`}
            bg="interactive.tertiary"
            borderRadius="full"
            transition="width 180ms ease"
          />
        </Box>
      </Box>

      <Box
        mt={4}
        flex={{ base: "initial", xl: 1 }}
        minH={0}
        bg="base.light"
        borderColor="border.neutral"
        borderWidth="1px"
        borderRadius="rounded"
        overflow="hidden"
      >
        <VStack
          align="stretch"
          gap={0}
          h="full"
          minH={0}
          overflowY={{ base: "visible", xl: "auto" }}
          data-testid="artifact-rows-scroll-region"
        >
          {state.rows.map((row) => (
            <ArtifactRowView
              key={row.id}
              row={row}
              active={row.id === state.activeProposalId}
              drafting={
                state.stage === "drafting" && state.loadingAction === "start"
              }
              t={t}
            />
          ))}
        </VStack>
      </Box>

      <Flex
        mt={4}
        align={{ base: "stretch", md: "center" }}
        justify="space-between"
        gap={3}
        flexDir={{ base: "column", md: "row" }}
        bg="base.light"
        borderColor="border.neutral"
        borderWidth="1px"
        borderRadius="rounded"
        px={5}
        py={4}
      >
        <Text color="content.secondary" fontSize="body.md">
          {state.stage === "review"
            ? state.canSaveToInventory
              ? t("artifact-footer-ready", {
                  ready: state.counts.ready + state.counts.accepted,
                  gaps: state.counts.gap,
                })
              : state.canPersistDraftReview
                ? t("artifact-footer-save-draft-ready")
                : state.hasSourceBackedProposals
                  ? t("artifact-footer-no-staged")
                  : t("artifact-footer-no-ready")
            : state.unresolvedCount > 0
              ? t("artifact-footer-decisions-needed", {
                  count: state.unresolvedCount,
                })
              : t("artifact-footer-nothing-written")}
        </Text>
        <HStack gap={2} justify={{ base: "flex-end", md: "initial" }}>
          <Button
            variant="outline"
            borderRadius={FLOW_BUTTON_RADIUS}
            disabled={!state.hasDraft}
            loading={state.loadingAction === "refresh"}
            onClick={actions.refreshActiveDraft}
          >
            <MdRefresh />
            {t("artifact-refresh")}
          </Button>
          {state.stage === "start" ? (
            <Button
              data-testid="start-draft-button"
              borderRadius={FLOW_BUTTON_RADIUS}
              loading={state.loadingAction === "start"}
              onClick={actions.startDraftFromArtifact}
            >
              {t("artifact-start-draft")}
            </Button>
          ) : null}
          {state.stage !== "start" && state.canPersistDraftReview ? (
            <Button
              data-testid="save-review-draft-button"
              variant="outline"
              borderRadius={FLOW_BUTTON_RADIUS}
              loading={state.loadingAction === "save_draft"}
              onClick={actions.saveDraft}
            >
              <MdSave />
              {t("chat-quick-reply-save-draft")}
            </Button>
          ) : null}
          {state.stage !== "start" && state.canSaveToInventory ? (
            <Button
              data-testid="save-inventory-button"
              borderRadius={FLOW_BUTTON_RADIUS}
              disabled={!state.canSaveToInventory}
              loading={state.loadingAction === "save_inventory"}
              onClick={actions.saveToInventory}
            >
              <MdSave />
              {t("chat-quick-reply-save-to-inventory")}
            </Button>
          ) : null}
        </HStack>
      </Flex>
    </Box>
  );
}
