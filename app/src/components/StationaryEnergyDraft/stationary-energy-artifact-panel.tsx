"use client";

import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  Icon,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  MdAdd,
  MdCheckCircle,
  MdExpandMore,
  MdRefresh,
  MdSave,
} from "react-icons/md";

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
    | "requestSaveToInventoryConfirmation"
    | "saveDraft"
    | "saveToInventory"
    | "selectDraft"
    | "setFocusedProposal"
    | "startDraftFromArtifact"
  >;
  cityName: string;
  inventoryYear: string | number;
  flush?: boolean;
  squared?: boolean;
  state: Pick<
    StationaryEnergyChatArtifactControllerState,
    | "activeDraftRunId"
    | "focusedProposalId"
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
      ? `${draftRun.resolved_review_count}/${draftRun.reviewable_proposal_count}`
      : null;
  return [
    draftRunStatusLabel(t, draftRun.status),
    reviewLabel,
    formatDraftRunUpdatedAt(draftRun.updated_at),
  ]
    .filter(Boolean)
    .join(" · ");
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
      flexShrink={0}
      borderWidth="2px"
      borderColor={color}
      bg={state === "queued" || state === "empty" ? "transparent" : color}
      borderRadius="full"
    />
  );
}

type RowGroup = {
  key: string;
  ref: string;
  label: string;
  rows: ArtifactRow[];
};

// Rows arrive sorted by GPC reference, so rows from the same sub-sector are
// already adjacent — collapse those runs into a group we can put a heading on.
function groupArtifactRows(rows: ArtifactRow[]): RowGroup[] {
  const groups: RowGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.ref === row.subsectorRef) {
      last.rows.push(row);
    } else {
      groups.push({
        key: `${row.subsectorRef || "ungrouped"}-${groups.length}`,
        ref: row.subsectorRef,
        label: row.subsectorLabel,
        rows: [row],
      });
    }
  }
  return groups;
}

function RowGroupHeading({
  refLabel,
  name,
}: {
  refLabel: string;
  name: string;
}) {
  return (
    <HStack
      gap="s"
      px="m"
      py="s"
      bg="base.light"
      borderBottomWidth="1px"
      borderColor="border.neutral"
    >
      <Text
        fontFamily="heading"
        fontSize="label.sm"
        fontWeight="bold"
        color="interactive.secondary"
        whiteSpace="nowrap"
      >
        {refLabel}
      </Text>
      {name ? (
        <Text
          fontSize="label.sm"
          fontWeight="semibold"
          color="content.secondary"
          textTransform="uppercase"
          letterSpacing="wide"
          truncate
        >
          {name}
        </Text>
      ) : null}
    </HStack>
  );
}

function SourceChip({
  name,
  fullName,
  meta,
}: {
  name: string;
  fullName: string | null;
  meta: string | null;
}) {
  // The pill stays compact (dot + short brand); the full name and the
  // year/geography are available on hover.
  const title = [fullName, meta].filter(Boolean).join(" · ") || name;
  return (
    <HStack
      title={title}
      alignSelf="flex-start"
      maxW="full"
      minW={0}
      gap="xs"
      px="s"
      py="1px"
      bg="background.backgroundGreyFlat"
      borderWidth="1px"
      borderColor="border.overlay"
      borderRadius="rounded"
    >
      <Box
        w="6px"
        h="6px"
        borderRadius="full"
        bg="content.tertiary"
        flexShrink={0}
      />
      <Text
        color="content.secondary"
        fontSize="label.sm"
        fontWeight="semibold"
        truncate
      >
        {name}
      </Text>
    </HStack>
  );
}

function ArtifactRowView(props: {
  row: ArtifactRow;
  selected?: boolean;
  onSelect?: () => void;
  drafting: boolean;
  t: TFunction;
}) {
  const isGenerating = props.drafting && props.row.id === "placeholder-0";
  const bg = props.selected
    ? "background.alternative"
    : props.row.state === "warning"
      ? "sentiment.warningOverlay"
      : "base.light";

  return (
    <Flex
      direction="column"
      gap="s"
      px="m"
      py="m"
      bg={bg}
      borderBottomWidth="1px"
      borderColor="border.neutral"
      borderLeftWidth="3px"
      borderLeftColor={props.selected ? "interactive.primary" : "transparent"}
      data-row-id={props.row.id}
      onClick={props.onSelect}
      cursor={props.onSelect ? "pointer" : "default"}
      role={props.onSelect ? "button" : undefined}
      _hover={
        props.onSelect
          ? {
              bg: props.selected
                ? "background.alternative"
                : "background.neutral",
            }
          : undefined
      }
    >
      <HStack align="flex-start" gap="s" minW={0}>
        <Box pt="3px" flexShrink={0}>
          <RowMarker state={isGenerating ? "active" : props.row.state} />
        </Box>
        <Box flex="1 1 auto" minW={0}>
          <Flex align="flex-start" justify="space-between" gap="m">
            <Text
              color="content.primary"
              fontSize="body.md"
              lineHeight="20px"
              minW={0}
            >
              {props.row.subcategoryLabel}
            </Text>
            {props.row.value ? (
              <Text
                fontFamily="heading"
                fontSize="body.md"
                fontWeight="semibold"
                whiteSpace="nowrap"
                flexShrink={0}
              >
                {props.row.value}
              </Text>
            ) : (
              <Text
                color="content.tertiary"
                fontSize="label.md"
                whiteSpace="nowrap"
                flexShrink={0}
              >
                {props.row.status}
              </Text>
            )}
          </Flex>
          <Text color="content.tertiary" fontSize="label.sm" mt="xs">
            {props.row.scope || props.t("artifact-scope-fallback")}
          </Text>
          {props.row.sourceName ? (
            <Box mt="s">
              <SourceChip
                name={props.row.sourceName}
                fullName={props.row.sourceFullName}
                meta={props.row.sourceMeta}
              />
            </Box>
          ) : null}
        </Box>
      </HStack>
    </Flex>
  );
}

function CurrentActionCard({ row, t }: { row: ArtifactRow; t: TFunction }) {
  return (
    <Box
      mt="m"
      bg="sentiment.positiveOverlay"
      borderColor="sentiment.positiveDefault"
      borderWidth="1px"
      borderRadius="rounded"
      px="m"
      py="s"
    >
      <HStack align="flex-start" gap="s">
        <Box
          w="22px"
          h="22px"
          flexShrink={0}
          display="grid"
          placeItems="center"
          borderRadius="full"
          bg="interactive.primary"
          color="base.light"
          mt="1px"
        >
          <Icon as={MdCheckCircle} boxSize="14px" />
        </Box>
        <Box minW={0}>
          <Text
            color="content.primary"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
          >
            {t("artifact-current-action-title")}
          </Text>
          <Text
            color="content.primary"
            fontSize="label.md"
            fontWeight="semibold"
            mt="2px"
            lineClamp={1}
          >
            {t("artifact-current-action-accepted", {
              label: row.subcategoryLabel,
            })}
          </Text>
          {row.sourceName ? (
            <Text color="content.secondary" fontSize="label.sm" mt="2px">
              {t("artifact-current-action-source", {
                source: row.sourceName,
              })}
            </Text>
          ) : null}
        </Box>
      </HStack>
    </Box>
  );
}

export function ArtifactPanel({
  actions,
  cityName,
  flush = false,
  inventoryYear,
  squared = false,
  state,
}: ArtifactPanelProps) {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const { t } = useTranslation(lng, "stationary-energy-agentic");
  const rowsScrollRef = useRef<HTMLDivElement | null>(null);
  const focusedProposalId = state.focusedProposalId;
  // Keep the focused row visible as the user steps through reviews.
  useEffect(() => {
    if (!focusedProposalId) {
      return;
    }
    const target = rowsScrollRef.current?.querySelector<HTMLElement>(
      `[data-row-id="${CSS.escape(focusedProposalId)}"]`,
    );
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedProposalId]);
  const draftedCount = state.rows.filter((row) =>
    ["done", "manual"].includes(row.state),
  ).length;
  const progress =
    state.rows.length > 0
      ? Math.round((draftedCount / state.rows.length) * 100)
      : 0;
  const chip = stageChip(t, state.stage, state.draftStatus);
  const activeDraftRun = state.draftRuns.find(
    (draftRun) => draftRun.draft_run_id === state.activeDraftRunId,
  );
  const currentActionRow =
    state.rows.find(
      (row) =>
        row.id === state.focusedProposalId &&
        ["done", "manual"].includes(row.state),
    ) ??
    state.rows.find((row) => ["done", "manual"].includes(row.state)) ??
    null;

  return (
    <Box
      minW={0}
      h={{ base: "auto", xl: "full" }}
      minH={0}
      display="flex"
      flexDir="column"
      overflow={{ base: "visible", xl: "hidden" }}
      bg="base.light"
      borderColor="border.neutral"
      borderWidth={flush ? 0 : "1px"}
      borderRadius={squared ? "none" : "rounded-xl"}
    >
      <Box borderBottomWidth="1px" borderColor="border.neutral" px="m" py="m">
        <VStack align="stretch" gap="m">
          <HStack gap="s" minW={0}>
            <Box
              w="36px"
              h="36px"
              flexShrink={0}
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
            <Box minW={0}>
              <Heading
                fontSize="title.md"
                fontWeight="semibold"
                whiteSpace="nowrap"
              >
                {t("artifact-sector-title")}
              </Heading>
              <Text color="content.tertiary" fontSize="label.md" truncate>
                {cityName} · {inventoryYear} · {t("artifact-header-framework")}
              </Text>
            </Box>
          </HStack>

          <Flex gap="s" align="center">
            {state.draftRuns.length > 0 ? (
              <Box position="relative" flex="1 1 auto" minW={0}>
                <chakra.select
                  value={state.activeDraftRunId ?? ""}
                  onChange={(event) => {
                    if (event.target.value) {
                      actions.selectDraft(event.target.value);
                    }
                  }}
                  disabled={state.draftListLoading}
                  aria-label={t("artifact-drafts-saved")}
                  title={
                    activeDraftRun
                      ? draftRunOptionLabel(t, activeDraftRun)
                      : undefined
                  }
                  appearance="none"
                  w="full"
                  minH="40px"
                  pl="s"
                  pr="xl"
                  fontSize="label.md"
                  whiteSpace="nowrap"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  borderWidth="1px"
                  borderColor="border.overlay"
                  borderRadius="rounded"
                  bg="base.light"
                  color="content.primary"
                  cursor="pointer"
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
                <Icon
                  as={MdExpandMore}
                  position="absolute"
                  right="s"
                  top="50%"
                  transform="translateY(-50%)"
                  pointerEvents="none"
                  color="content.secondary"
                  boxSize="20px"
                />
              </Box>
            ) : (
              <Box flex="1 1 auto" />
            )}
            <Button
              borderRadius={FLOW_BUTTON_RADIUS}
              loading={state.loadingAction === "start"}
              onClick={actions.startDraftFromArtifact}
              gap="xs"
              flexShrink={0}
            >
              <MdAdd />
              {t("artifact-new-draft")}
            </Button>
          </Flex>

          <Box>
            <Flex justify="space-between" align="center" gap="m" mb="s">
              <HStack gap="s" minW={0}>
                <Text
                  fontFamily="heading"
                  fontSize="body.md"
                  fontWeight="semibold"
                  truncate
                >
                  {overviewTitle(t, state.stage)}
                </Text>
                <Badge
                  bg={chip.bg}
                  color={chip.color}
                  borderRadius="rounded"
                  px="s"
                  py="2px"
                  flexShrink={0}
                >
                  {chip.label}
                </Badge>
              </HStack>
              <Text
                color="content.secondary"
                fontSize="label.md"
                flexShrink={0}
                whiteSpace="nowrap"
              >
                {t("artifact-progress-drafted", {
                  drafted: draftedCount,
                  total: state.rows.length,
                })}
              </Text>
            </Flex>
            <Box
              h="6px"
              bg="background.neutral"
              borderRadius="minimal"
              overflow="hidden"
            >
              <Box
                h="full"
                w={progress > 0 ? `max(${progress}%, 6px)` : "0%"}
                bg="interactive.tertiary"
                borderRadius="minimal"
                transition="width 220ms ease"
              />
            </Box>
            {currentActionRow ? (
              <CurrentActionCard row={currentActionRow} t={t} />
            ) : null}
          </Box>
        </VStack>
      </Box>

      <VStack
        align="stretch"
        gap={0}
        flex={{ base: "initial", xl: 1 }}
        minH={0}
        overflowY={{ base: "visible", xl: "auto" }}
        ref={rowsScrollRef}
        data-testid="artifact-rows-scroll-region"
      >
        {groupArtifactRows(state.rows).map((group) => (
          <Box key={group.key}>
            {group.ref ? (
              <RowGroupHeading refLabel={group.ref} name={group.label} />
            ) : null}
            {group.rows.map((row) => (
              <ArtifactRowView
                key={row.id}
                row={row}
                selected={row.id === state.focusedProposalId}
                onSelect={
                  row.id.startsWith("placeholder-")
                    ? undefined
                    : () => actions.setFocusedProposal(row.id)
                }
                drafting={
                  state.stage === "drafting" && state.loadingAction === "start"
                }
                t={t}
              />
            ))}
          </Box>
        ))}
      </VStack>

      <Flex
        align="stretch"
        justify="space-between"
        gap="m"
        flexDir="column"
        borderTopWidth="1px"
        borderColor="border.neutral"
        px="m"
        py="m"
      >
        <Text color="content.secondary" fontSize="body.md">
          {state.canSaveToInventory
            ? t("artifact-footer-ready", {
                ready: state.counts.ready + state.counts.accepted,
                gaps: state.counts.gap,
              })
            : state.stage === "review"
              ? state.canPersistDraftReview
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
        <HStack gap="s" justify="flex-end" flexWrap="wrap" w="full">
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
              onClick={actions.requestSaveToInventoryConfirmation}
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
