"use client";

import {
  Box,
  Flex,
  HStack,
  Spinner,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import { MdCheckCircle, MdErrorOutline } from "react-icons/md";
import { useParams } from "next/navigation";

import { useTranslation } from "@/i18n/client";
import {
  AGENT_BUBBLE_MAX_W,
  CHAT_SURFACE_MAX_W,
  FLOW_BUTTON_RADIUS,
  USER_BUBBLE_MAX_W,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import type { DraftCounts } from "@/components/StationaryEnergyDraft/flow";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";
import { getParamValueRequired } from "@/util/helpers";

export type QuickReplyButton = {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function useStationaryEnergyAgenticTranslation() {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  return useTranslation(lng, "stationary-energy-agentic");
}

export function AgentBubble({ text }: { text: string }) {
  return (
    <Flex
      align="flex-start"
      gap={2}
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
    >
      <Box
        flex="0 0 30px"
        w="30px"
        h="30px"
        display="grid"
        placeItems="center"
        borderRadius="full"
        bg="interactive.tertiary"
        color="base.light"
        fontFamily="heading"
      >
        *
      </Box>
      <Box
        flex="1"
        minW={0}
        maxW={AGENT_BUBBLE_MAX_W}
        px={4}
        py={3}
        bg="base.light"
        borderColor="border.overlay"
        borderWidth="1px"
        borderRadius="minimal"
        borderTopRightRadius="rounded-xl"
        borderBottomRadius="rounded-xl"
        color="content.secondary"
        fontSize="body.md"
        lineHeight="20px"
        overflowWrap="anywhere"
        whiteSpace="pre-wrap"
      >
        {text}
      </Box>
    </Flex>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <Flex
      justify="flex-end"
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
    >
      <Box
        maxW={USER_BUBBLE_MAX_W}
        px={4}
        py={3}
        bg="background.neutral"
        borderColor="border.neutral"
        borderWidth="1px"
        borderRadius="rounded-xl"
        borderTopRightRadius="minimal"
        color="content.primary"
        fontSize="body.md"
        lineHeight="20px"
        whiteSpace="pre-wrap"
        overflowWrap="anywhere"
      >
        {text}
      </Box>
    </Flex>
  );
}

export function CoveragePanel(props: {
  sourceCount: number | null;
  currentCount: number;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
      bg="base.light"
      borderWidth="1px"
      borderColor="border.overlay"
      borderRadius="rounded-xl"
      p={4}
    >
      <HStack gap={2} mb={3}>
        <MdCheckCircle />
        <Text fontFamily="heading" fontSize="body.md" fontWeight="semibold">
          {t("primitives-coverage-title")}
        </Text>
      </HStack>
      <VStack
        align="stretch"
        gap={2}
        color="content.secondary"
        fontSize="label.md"
      >
        <HStack align="flex-start">
          <MdCheckCircle />
          <Text>
            {props.sourceCount == null
              ? t("primitives-coverage-sources-loading")
              : t("primitives-coverage-sources-loaded", {
                  count: props.sourceCount,
                })}
          </Text>
        </HStack>
        <HStack align="flex-start">
          <Text color="content.tertiary">-</Text>
          <Text>
            {props.currentCount > 0
              ? t("primitives-coverage-current-rows", {
                  count: props.currentCount,
                })
              : t("primitives-coverage-existing-rows")}
          </Text>
        </HStack>
      </VStack>
    </Box>
  );
}

export function QuickReplies(props: { buttons: QuickReplyButton[] }) {
  return (
    <Flex
      gap={2}
      flexWrap="wrap"
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
    >
      {props.buttons.map((button) => (
        <chakra.button
          type="button"
          key={button.label}
          disabled={button.disabled}
          aria-disabled={button.disabled}
          h="38px"
          maxW="100%"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          px="14px"
          borderWidth="1px"
          borderColor={
            button.primary ? "interactive.tertiary" : "interactive.primary"
          }
          borderRadius={FLOW_BUTTON_RADIUS}
          bg={button.primary ? "interactive.tertiary" : "base.light"}
          color={button.primary ? "base.light" : "interactive.primary"}
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="semibold"
          lineHeight="20px"
          letterSpacing="0"
          whiteSpace="nowrap"
          appearance="none"
          cursor={button.disabled ? "not-allowed" : "pointer"}
          opacity={button.disabled ? 0.46 : 1}
          transition="background 140ms ease, border-color 140ms ease"
          _hover={
            button.disabled
              ? undefined
              : {
                  bg: button.primary
                    ? "interactive.secondary"
                    : "background.neutral",
                }
          }
          onClick={button.disabled ? undefined : button.onClick}
        >
          {button.label}
        </chakra.button>
      ))}
    </Flex>
  );
}

export function StatusLine({ text }: { text: string }) {
  return (
    <HStack
      gap={2}
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
      bg="base.light"
      borderWidth="1px"
      borderColor="border.overlay"
      borderRadius="rounded"
      px={3}
      py={2}
      color="content.secondary"
      fontSize="label.md"
    >
      <Spinner size="sm" color="brand.primary" />
      <Text>{text}</Text>
    </HStack>
  );
}

export function StaleDraftPanel(props: {
  staleDraft: DraftStatusResponse["staleness"];
  onContinue: () => void;
  onStartOver: () => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
      bg="sentiment.warningOverlay"
      borderColor="interactive.quaternary"
      borderWidth="1px"
      borderRadius="rounded-xl"
      p={4}
    >
      <HStack gap={2} mb={3} color="interactive.quaternary">
        <MdErrorOutline />
        <Text fontFamily="heading" fontWeight="semibold">
          {t("primitives-stale-title")}
        </Text>
      </HStack>
      <Text color="content.primary" fontSize="body.md" mb={3}>
        {t("primitives-stale-description")}
      </Text>
      <Text color="content.tertiary" fontSize="label.md" mb={4}>
        {t("primitives-stale-counts", {
          storedCount: props.staleDraft?.stored_source_ids.length ?? 0,
          currentCount: props.staleDraft?.current_source_ids.length ?? 0,
        })}
      </Text>
      <QuickReplies
        buttons={[
          {
            label: t("primitives-stale-continue"),
            onClick: props.onContinue,
          },
          {
            label: t("primitives-stale-start-over"),
            primary: true,
            onClick: props.onStartOver,
          },
        ]}
      />
    </Box>
  );
}

export function PendingDecisionNudge(props: {
  pendingDecisionCount: number;
  onAskQuestion: () => void;
  onJumpToReview: () => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();
  const label =
    props.pendingDecisionCount === 1
      ? t("primitives-pending-one")
      : t("primitives-pending-many", {
          count: props.pendingDecisionCount,
        });

  return (
    <Box
      position="sticky"
      top={0}
      zIndex={1}
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
      bg="background.backgroundGreyFlat"
      pt={1}
    >
      <Flex
        align={{ base: "flex-start", sm: "center" }}
        justify="space-between"
        gap={3}
        flexDir={{ base: "column", sm: "row" }}
        bg="sentiment.warningOverlay"
        borderColor="interactive.quaternary"
        borderWidth="1px"
        borderRadius="rounded"
        px={3}
        py={2}
      >
        <Box minW={0}>
          <Text
            color="interactive.quaternary"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
          >
            {label}
          </Text>
          <Text color="content.secondary" fontSize="label.md">
            {t("primitives-pending-description")}
          </Text>
        </Box>
        <HStack gap={2} flexWrap="wrap">
          <chakra.button
            type="button"
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
            onClick={props.onAskQuestion}
          >
            {t("primitives-pending-ask")}
          </chakra.button>
          <chakra.button
            type="button"
            px={3}
            py={2}
            borderWidth="1px"
            borderColor="interactive.quaternary"
            borderRadius="rounded"
            bg="base.light"
            color="interactive.quaternary"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
            onClick={props.onJumpToReview}
          >
            {t("primitives-pending-jump")}
          </chakra.button>
        </HStack>
      </Flex>
    </Box>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Box
      bg="background.neutral"
      borderColor="border.overlay"
      borderWidth="1px"
      borderRadius="rounded"
      px={3}
      py={2}
      minW="120px"
    >
      <Text color="content.tertiary" fontSize="label.sm">
        {label}
      </Text>
      <Text fontFamily="heading" fontSize="body.md" fontWeight="semibold">
        {value}
      </Text>
    </Box>
  );
}

export function RunSummary(props: {
  counts: DraftCounts;
  pendingDecisionCount: number;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
      bg="base.light"
      borderColor="border.overlay"
      borderWidth="1px"
      borderRadius="rounded-xl"
      p={4}
    >
      <Text
        fontFamily="heading"
        fontSize="body.md"
        fontWeight="semibold"
        mb={3}
      >
        {t("primitives-summary-title")}
      </Text>
      <Flex gap={2} flexWrap="wrap">
        <SummaryTile
          label={t("primitives-summary-drafted")}
          value={String(props.counts.ready + props.counts.accepted)}
        />
        <SummaryTile
          label={t("primitives-summary-needs-review")}
          value={String(props.pendingDecisionCount)}
        />
        <SummaryTile
          label={t("primitives-summary-gaps")}
          value={String(props.counts.gap)}
        />
      </Flex>
    </Box>
  );
}
