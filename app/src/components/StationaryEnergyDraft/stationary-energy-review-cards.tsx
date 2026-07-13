"use client";

import {
  Badge,
  Box,
  Flex,
  HStack,
  Icon,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { MdCheckCircle, MdErrorOutline, MdInfoOutline } from "react-icons/md";
import { useParams } from "next/navigation";

import { useTranslation } from "@/i18n/client";
import { CHAT_SURFACE_MAX_W } from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import type { DecisionReviewContext } from "@/components/StationaryEnergyDraft/flow";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftProposal,
} from "@/components/StationaryEnergyDraft/types";
import { getParamValueRequired } from "@/util/helpers";

function useStationaryEnergyAgenticTranslation() {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  return useTranslation(lng, "stationary-energy-agentic");
}

function selectedDecisionOption(
  context: DecisionReviewContext,
  decision?: DraftDecisionState,
) {
  if (!decision) {
    return null;
  }

  if (decision.action === "leave_draft") {
    return context.leaveDraftOption;
  }

  const sourceOptions = [
    ...(context.recommendedOption ? [context.recommendedOption] : []),
    ...context.alternativeOptions,
  ];

  if (decision.action === "accept") {
    return context.recommendedOption ?? sourceOptions[0] ?? null;
  }

  if (decision.action === "override_source") {
    return (
      sourceOptions.find((option) => option.id === decision.selectedSourceId) ??
      null
    );
  }

  return null;
}

function resolvedDecisionBadgeLabel(
  t: TFunction,
  action: DraftDecisionAction | undefined,
): string {
  if (action === "leave_draft") {
    return t("review-badge-left-empty");
  }
  if (action === "override_source") {
    return t("review-badge-alternative-source");
  }
  if (action === "override_manual") {
    return t("review-badge-manual");
  }
  return t("review-badge-accepted");
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <Box
      w="20px"
      h="20px"
      flexShrink={0}
      mt="2px"
      borderRadius="full"
      borderWidth="2px"
      borderColor={selected ? "interactive.tertiary" : "border.overlay"}
      bg="base.light"
      display="grid"
      placeItems="center"
      transition="border-color 140ms ease"
    >
      {selected ? (
        <Box w="10px" h="10px" borderRadius="full" bg="interactive.tertiary" />
      ) : null}
    </Box>
  );
}

function DecisionReviewBaseCard(props: {
  title: string;
  description: string;
  reviewLabel: string;
  proposal: DraftProposal;
  options: Array<DecisionReviewContext["leaveDraftOption"]>;
  decision?: DraftDecisionState;
  resolved?: boolean;
  pristine?: boolean;
  onDecisionChoice: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  onAskAboutProposal: (label: string) => void;
  onViewSource?: (datasourceId: string) => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();
  const rationale = props.proposal.rationale?.trim();

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
      data-message-kind="decision-review"
      data-proposal-id={props.proposal.proposal_id}
      aria-label={t("review-card-aria-label")}
      bg="sentiment.positiveOverlay"
      borderColor="sentiment.positiveDefault"
      borderWidth="1px"
      borderRadius="rounded-xl"
      p="m"
    >
      <HStack
        justify="space-between"
        color="interactive.primary"
        fontSize="overline"
        fontWeight="semibold"
        mb="s"
      >
        <HStack gap="s">
          <Box
            w="28px"
            h="28px"
            display="grid"
            placeItems="center"
            borderRadius="rounded"
            bg="sentiment.positiveOverlay"
            color="interactive.tertiary"
          >
            <MdErrorOutline />
          </Box>
          <Text textTransform="uppercase" letterSpacing="0">
            {props.title}
          </Text>
        </HStack>
        {props.resolved ? (
          <Badge
            bg="base.light"
            color="interactive.primary"
            borderRadius="rounded"
            fontSize="label.sm"
          >
            {t("review-card-staged")}
          </Badge>
        ) : null}
      </HStack>
      <Text color="content.primary" fontSize="body.md" mb="m">
        {props.description}
      </Text>

      {rationale ? (
        <Box
          bg="base.light"
          borderWidth="1px"
          borderColor="border.overlay"
          borderRadius="rounded"
          px="m"
          py="s"
          mb="m"
        >
          <HStack gap="xs" mb="2px" color="content.secondary">
            <Icon as={MdInfoOutline} boxSize="14px" />
            <Text
              fontSize="label.sm"
              fontWeight="bold"
              textTransform="uppercase"
              letterSpacing="wide"
            >
              {t("review-card-why-recommended")}
            </Text>
          </HStack>
          <Text color="content.secondary" fontSize="label.md">
            {rationale}
          </Text>
        </Box>
      ) : null}

      <VStack
        align="stretch"
        gap="s"
        role="radiogroup"
        aria-label={t("review-card-aria-label")}
      >
        {props.options.map((option) => {
          // While the proposal is untouched (`pristine`), nothing is shown as
          // selected — the recommended source is only a hint (its badge), not a
          // staged choice. A real selection appears once the user clicks.
          const selected =
            !props.pristine &&
            props.decision?.action === option.action &&
            (option.action !== "override_source" ||
              props.decision.selectedSourceId === option.id);
          const isLeaveDraft = option.action === "leave_draft";

          return (
            <Box
              key={option.id}
              role="radio"
              tabIndex={0}
              aria-checked={selected}
              w="full"
              textAlign="left"
              px="m"
              py="s"
              borderWidth="1px"
              borderRadius="rounded"
              borderColor={selected ? "interactive.tertiary" : "border.overlay"}
              bg={selected ? "background.alternative" : "base.light"}
              color="content.primary"
              cursor="pointer"
              transition="background 140ms ease, border-color 140ms ease"
              _hover={{
                bg: selected ? "background.alternative" : "background.neutral",
              }}
              onClick={() =>
                props.onDecisionChoice(
                  props.proposal,
                  option.action,
                  option.action === "override_source" ? option.id : "",
                  option.label,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  props.onDecisionChoice(
                    props.proposal,
                    option.action,
                    option.action === "override_source" ? option.id : "",
                    option.label,
                  );
                }
              }}
            >
              <HStack align="flex-start" gap="s">
                <RadioDot selected={selected} />
                <Box flex="1 1 auto" minW={0}>
                  {option.recommended ? (
                    <Badge
                      bg="sentiment.positiveOverlay"
                      color="interactive.primary"
                      borderRadius="rounded"
                      fontSize="label.sm"
                      mb="xs"
                    >
                      {t("review-card-recommended")}
                    </Badge>
                  ) : null}

                  <Flex justify="space-between" align="baseline" gap="s">
                    <Text
                      fontFamily="heading"
                      fontWeight="semibold"
                      truncate
                      minW={0}
                    >
                      {option.shortLabel}
                    </Text>
                    {!isLeaveDraft ? (
                      <Text
                        fontFamily="heading"
                        fontSize="body.md"
                        fontWeight="semibold"
                        whiteSpace="nowrap"
                        flexShrink={0}
                      >
                        {option.value}
                      </Text>
                    ) : null}
                  </Flex>

                  {!isLeaveDraft && option.label !== option.shortLabel ? (
                    <Text
                      color="content.secondary"
                      fontSize="label.md"
                      lineClamp={2}
                      mt="2px"
                    >
                      {option.label}
                    </Text>
                  ) : null}
                  {option.meta && option.meta !== option.value ? (
                    <Text color="content.tertiary" fontSize="label.sm" mt="2px">
                      {option.meta}
                    </Text>
                  ) : null}

                  {!isLeaveDraft &&
                  option.datasourceId &&
                  props.onViewSource ? (
                    <chakra.button
                      type="button"
                      mt="s"
                      display="inline-flex"
                      alignItems="center"
                      gap="xs"
                      color="interactive.secondary"
                      fontFamily="heading"
                      fontSize="label.sm"
                      fontWeight="bold"
                      _hover={{ color: "interactive.primary" }}
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onViewSource?.(option.datasourceId as string);
                      }}
                    >
                      <Icon as={MdInfoOutline} boxSize="16px" />
                      {t("review-card-see-details")}
                    </chakra.button>
                  ) : null}
                </Box>
              </HStack>
            </Box>
          );
        })}
      </VStack>

      <Flex mt="m" align="stretch" gap="s" flexDir="column">
        <Text color="content.tertiary" fontSize="label.md">
          {t("review-card-helper")}
        </Text>
        <chakra.button
          type="button"
          alignSelf="stretch"
          textAlign="center"
          px="m"
          py="s"
          borderWidth="1px"
          borderColor="interactive.primary"
          borderRadius="rounded"
          bg="base.light"
          color="interactive.primary"
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="semibold"
          _hover={{ bg: "background.neutral" }}
          onClick={() => props.onAskAboutProposal(props.reviewLabel)}
        >
          {t("review-card-ask")}
        </chakra.button>
      </Flex>
    </Box>
  );
}

export function ResolvedDecisionSummaryCard(props: {
  context: DecisionReviewContext;
  decision?: DraftDecisionState;
  onEditDecision: (proposalId: string) => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();
  const selectedOption = selectedDecisionOption(props.context, props.decision);
  const badgeLabel = resolvedDecisionBadgeLabel(t, props.decision?.action);
  const summaryLabel =
    selectedOption?.action === "leave_draft"
      ? t("review-summary-leave-empty")
      : (selectedOption?.label ?? t("review-summary-choice-staged"));
  const summaryMeta =
    selectedOption?.action === "leave_draft"
      ? t("review-summary-set-notation")
      : [selectedOption?.meta, selectedOption?.value]
          .filter(Boolean)
          .join(" | ");

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
      data-message-kind="resolved-decision-summary"
      data-proposal-id={props.context.proposal_id}
      bg="base.light"
      borderColor="border.overlay"
      borderWidth="1px"
      borderRadius="rounded-xl"
      px={4}
      py={3}
    >
      <Flex align="flex-start" justify="space-between" gap={3}>
        <Box minW={0}>
          <HStack
            gap={2}
            color="interactive.primary"
            fontSize="label.sm"
            fontWeight="semibold"
            mb={2}
          >
            <MdCheckCircle />
            <Text textTransform="uppercase" letterSpacing="0">
              {t("review-summary-title")}
            </Text>
          </HStack>
          <Text
            fontFamily="heading"
            fontSize="body.md"
            fontWeight="semibold"
            truncate
          >
            {summaryLabel}
          </Text>
          {summaryMeta ? (
            <Text color="content.tertiary" fontSize="label.md" mt={1} truncate>
              {summaryMeta}
            </Text>
          ) : null}
          <Text color="content.secondary" fontSize="label.md" mt={2}>
            {props.context.label}
          </Text>
        </Box>
        <VStack align="end" gap={2} flexShrink={0}>
          <Badge
            bg="sentiment.positiveOverlay"
            color="interactive.primary"
            borderRadius="rounded"
            fontSize="label.sm"
          >
            {badgeLabel}
          </Badge>
          <chakra.button
            type="button"
            px={2.5}
            py={1.5}
            borderWidth="1px"
            borderColor="border.overlay"
            borderRadius="rounded"
            bg="background.backgroundGreyFlat"
            color="content.secondary"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
            onClick={() => props.onEditDecision(props.context.proposal_id)}
          >
            {t("review-summary-change")}
          </chakra.button>
        </VStack>
      </Flex>
    </Box>
  );
}

export function ActionCompletedDecisionCard(props: {
  context: DecisionReviewContext;
  decision?: DraftDecisionState;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();
  const selectedOption = selectedDecisionOption(props.context, props.decision);
  const sourceLabel =
    selectedOption?.action === "leave_draft" ? null : selectedOption?.label;
  const sourceMeta =
    selectedOption?.action === "leave_draft"
      ? t("review-summary-set-notation")
      : [selectedOption?.meta, selectedOption?.value]
          .filter(Boolean)
          .join(" | ");
  const actionText =
    props.decision?.action === "leave_draft"
      ? t("review-action-completed-left-empty", {
          label: props.context.label,
        })
      : t("review-action-completed-accepted", {
          label: props.context.label,
        });

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
      data-message-kind="action-completed"
      data-proposal-id={props.context.proposal_id}
      bg="sentiment.positiveOverlay"
      borderColor="sentiment.positiveDefault"
      borderWidth="1px"
      borderRadius="rounded-xl"
      px={4}
      py={3}
    >
      <Flex align="center" gap={3}>
        <Box
          w="36px"
          h="36px"
          flexShrink={0}
          display="grid"
          placeItems="center"
          borderRadius="full"
          bg="interactive.primary"
          color="base.light"
        >
          <MdCheckCircle />
        </Box>
        <Box flex="1 1 auto" minW={0}>
          <Text
            color="content.primary"
            fontFamily="heading"
            fontSize="body.md"
            fontWeight="semibold"
          >
            {t("review-action-completed-title")}
          </Text>
          <Text
            color="content.primary"
            fontSize="label.md"
            fontWeight="semibold"
            mt="2px"
          >
            {actionText}
          </Text>
          {sourceLabel ? (
            <Text color="content.secondary" fontSize="label.md" mt="2px">
              {t("review-action-completed-source", {
                source: sourceLabel,
              })}
            </Text>
          ) : null}
          {sourceMeta ? (
            <Text color="content.tertiary" fontSize="label.sm" mt="2px">
              {sourceMeta}
            </Text>
          ) : null}
        </Box>
      </Flex>
    </Box>
  );
}

export function SingleSourceProposalCard(props: {
  context: Extract<DecisionReviewContext, { kind: "single_source" }>;
  decision?: DraftDecisionState;
  resolved?: boolean;
  pristine?: boolean;
  onDecisionChoice: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  onAskAboutProposal: (label: string) => void;
  onViewSource?: (datasourceId: string) => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();

  return (
    <DecisionReviewBaseCard
      title={t("review-single-source-title")}
      description={t("review-single-source-description", {
        label: props.context.label,
      })}
      reviewLabel={props.context.label}
      proposal={props.context.proposal}
      options={[
        props.context.recommendedOption,
        props.context.leaveDraftOption,
      ]}
      decision={props.decision}
      resolved={props.resolved}
      pristine={props.pristine}
      onDecisionChoice={props.onDecisionChoice}
      onAskAboutProposal={props.onAskAboutProposal}
      onViewSource={props.onViewSource}
    />
  );
}

export function MultiSourceProposalCard(props: {
  context: Extract<DecisionReviewContext, { kind: "multi_source" }>;
  decision?: DraftDecisionState;
  resolved?: boolean;
  pristine?: boolean;
  onDecisionChoice: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  onAskAboutProposal: (label: string) => void;
  onViewSource?: (datasourceId: string) => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();
  const options = [
    ...(props.context.recommendedOption
      ? [props.context.recommendedOption]
      : []),
    ...props.context.alternativeOptions,
    props.context.leaveDraftOption,
  ];
  const sourcesAgree = props.context.status === "needs_review";

  return (
    <DecisionReviewBaseCard
      title={
        sourcesAgree
          ? t("review-agreement-source-title")
          : t("review-multi-source-title")
      }
      description={t(
        sourcesAgree
          ? "review-agreement-source-description"
          : "review-multi-source-description",
        {
          label: props.context.label,
        },
      )}
      reviewLabel={props.context.label}
      proposal={props.context.proposal}
      options={options}
      decision={props.decision}
      resolved={props.resolved}
      pristine={props.pristine}
      onDecisionChoice={props.onDecisionChoice}
      onAskAboutProposal={props.onAskAboutProposal}
      onViewSource={props.onViewSource}
    />
  );
}
