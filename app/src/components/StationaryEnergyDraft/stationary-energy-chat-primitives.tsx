"use client";
/* eslint-disable i18next/no-literal-string */

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

import {
  AGENT_BUBBLE_MAX_W,
  CHAT_SURFACE_MAX_W,
  FLOW_BUTTON_RADIUS,
  USER_BUBBLE_MAX_W,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import type { DraftCounts } from "@/components/StationaryEnergyDraft/flow";
import type { DraftStatusResponse } from "@/components/StationaryEnergyDraft/types";

export type QuickReplyButton = {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

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
          Coverage check
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
              ? "Sources will be loaded from the bounded CityCatalyst context"
              : `${props.sourceCount} integrated source candidates loaded`}
          </Text>
        </HStack>
        <HStack align="flex-start">
          <Text color="content.tertiary">-</Text>
          <Text>
            {props.currentCount || "Existing"} Stationary Energy rows stay in
            review until you save
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
          Connected sources changed
        </Text>
      </HStack>
      <Text color="content.primary" fontSize="body.md" mb={3}>
        This draft snapshot no longer matches the currently connected Stationary
        Energy sources. You can continue reviewing the older draft or start over
        from the current source set.
      </Text>
      <Text color="content.tertiary" fontSize="label.md" mb={4}>
        Stored sources: {props.staleDraft?.stored_source_ids.length ?? 0} /
        Current sources: {props.staleDraft?.current_source_ids.length ?? 0}
      </Text>
      <QuickReplies
        buttons={[
          {
            label: "Continue existing draft",
            onClick: props.onContinue,
          },
          {
            label: "Start over",
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
  const label =
    props.pendingDecisionCount === 1
      ? "1 pending review is off-screen."
      : `${props.pendingDecisionCount} pending reviews are off-screen.`;

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
            You can ask a question without choosing a source yet.
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
            Ask a question
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
            Jump to review
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
      <Text fontFamily="heading" fontSize="body.md" fontWeight="semibold" mb={3}>
        Draft snapshot
      </Text>
      <Flex gap={2} flexWrap="wrap">
        <SummaryTile
          label="Drafted"
          value={String(props.counts.ready + props.counts.accepted)}
        />
        <SummaryTile
          label="Needs review"
          value={String(props.pendingDecisionCount)}
        />
        <SummaryTile label="Gaps" value={String(props.counts.gap)} />
      </Flex>
    </Box>
  );
}
