"use client";

import {
  Badge,
  Box,
  Flex,
  HStack,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { MdCheckCircle, MdErrorOutline } from "react-icons/md";
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

function DecisionReviewBaseCard(props: {
  title: string;
  description: string;
  reviewLabel: string;
  proposal: DraftProposal;
  options: Array<DecisionReviewContext["leaveDraftOption"]>;
  decision?: DraftDecisionState;
  resolved?: boolean;
  onDecisionChoice: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  onAskAboutProposal: (label: string) => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();

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
      p={4}
    >
      <HStack
        justify="space-between"
        color="interactive.primary"
        fontSize="overline"
        fontWeight="semibold"
        mb={3}
      >
        <HStack gap={2}>
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
            borderRadius="full"
            fontSize="label.sm"
          >
            {t("review-card-staged")}
          </Badge>
        ) : null}
      </HStack>
      <Text color="content.primary" fontSize="body.md" mb={3}>
        {props.description}
      </Text>
      <VStack align="stretch" gap={2}>
        {props.options.map((option) => {
          const selected =
            props.decision?.action === option.action &&
            (option.action !== "override_source" ||
              props.decision.selectedSourceId === option.id);

          return (
            <chakra.button
              type="button"
              key={option.id}
              aria-pressed={selected}
              w="full"
              display="grid"
              gridTemplateColumns="minmax(0, 1fr) auto"
              alignItems="center"
              gap={3}
              textAlign="left"
              px={3}
              py="10px"
              minH="54px"
              borderWidth="1px"
              borderRadius="rounded"
              borderColor={selected ? "interactive.tertiary" : "border.overlay"}
              bg={selected ? "background.alternative" : "base.light"}
              color="content.primary"
              appearance="none"
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
            >
              <Box minW={0}>
                <HStack gap={2} minW={0} align="baseline">
                  <Text fontFamily="heading" fontWeight="semibold" truncate>
                    {option.label}
                  </Text>
                  {option.recommended ? (
                    <Text
                      color="content.tertiary"
                      fontSize="label.md"
                      fontWeight="semibold"
                      whiteSpace="nowrap"
                    >
                      {t("review-card-recommended")}
                    </Text>
                  ) : null}
                </HStack>
                <Text color="content.tertiary" fontSize="label.md" truncate>
                  {option.meta || option.value}
                </Text>
              </Box>
              {option.action === "leave_draft" ? (
                <Text
                  color={selected ? "interactive.primary" : "content.tertiary"}
                  fontSize="label.md"
                  fontWeight="semibold"
                  whiteSpace="nowrap"
                >
                  {selected ? t("review-card-selected") : ""}
                </Text>
              ) : (
                <Text
                  color={selected ? "content.primary" : "content.secondary"}
                  fontFamily="heading"
                  fontSize="body.md"
                  fontWeight="semibold"
                  whiteSpace="nowrap"
                >
                  {option.value}
                </Text>
              )}
            </chakra.button>
          );
        })}
      </VStack>
      <Flex
        mt={3}
        align={{ base: "flex-start", sm: "center" }}
        justify="space-between"
        gap={3}
        flexDir={{ base: "column", sm: "row" }}
      >
        <Text color="content.tertiary" fontSize="label.md">
          {t("review-card-helper")}
        </Text>
        <chakra.button
          type="button"
          alignSelf={{ base: "stretch", sm: "auto" }}
          px={3}
          py={2}
          borderWidth="1px"
          borderColor="interactive.primary"
          borderRadius="rounded"
          bg="base.light"
          color="interactive.primary"
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="semibold"
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

export function SingleSourceProposalCard(props: {
  context: Extract<DecisionReviewContext, { kind: "single_source" }>;
  decision?: DraftDecisionState;
  resolved?: boolean;
  onDecisionChoice: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  onAskAboutProposal: (label: string) => void;
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
      onDecisionChoice={props.onDecisionChoice}
      onAskAboutProposal={props.onAskAboutProposal}
    />
  );
}

export function MultiSourceProposalCard(props: {
  context: Extract<DecisionReviewContext, { kind: "multi_source" }>;
  decision?: DraftDecisionState;
  resolved?: boolean;
  onDecisionChoice: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  onAskAboutProposal: (label: string) => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();
  const options = [
    ...(props.context.recommendedOption
      ? [props.context.recommendedOption]
      : []),
    ...props.context.alternativeOptions,
    props.context.leaveDraftOption,
  ];

  return (
    <DecisionReviewBaseCard
      title={t("review-multi-source-title")}
      description={t("review-multi-source-description", {
        label: props.context.label,
      })}
      reviewLabel={props.context.label}
      proposal={props.context.proposal}
      options={options}
      decision={props.decision}
      resolved={props.resolved}
      onDecisionChoice={props.onDecisionChoice}
      onAskAboutProposal={props.onAskAboutProposal}
    />
  );
}
