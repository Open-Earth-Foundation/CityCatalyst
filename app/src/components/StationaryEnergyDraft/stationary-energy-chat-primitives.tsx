"use client";

import {
  Badge,
  Box,
  Flex,
  HStack,
  Spinner,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import type { ReactElement } from "react";
import { MdCheckCircle, MdErrorOutline } from "react-icons/md";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AskAiIcon } from "@/components/icons";
import { createChatMarkdownComponents } from "@/components/shared/chat-markdown-components";
import { useTranslation } from "@/i18n/client";
import {
  AGENT_BUBBLE_MAX_W,
  CHAT_SURFACE_MAX_W,
  CHAT_WIDGET_TRANSFORM,
  FLOW_BUTTON_RADIUS,
  USER_BUBBLE_MAX_W,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import type { DraftCounts } from "@/components/StationaryEnergyDraft/flow";
import type { StationaryEnergyToolChoiceSummary } from "@/components/StationaryEnergyDraft/stationary-energy-chat-messages";
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

const agentMarkdownComponents = createChatMarkdownComponents({
  paragraph: {
    fontSize: "body.md",
    lineHeight: "20px",
  },
  h1: {
    fontSize: "title.lg",
    lineHeight: "28px",
  },
  h2: {
    fontSize: "title.md",
    lineHeight: "24px",
  },
  h3: {
    fontSize: "body.md",
    lineHeight: "20px",
  },
  list: {
    lineHeight: "20px",
  },
  code: {
    bg: "background.neutral",
    fontSize: "label.md",
  },
  pre: {
    bg: "background.neutral",
    borderRadius: "rounded",
    fontSize: "label.md",
  },
  table: {
    fontSize: "label.md",
    headBg: "background.neutral",
  },
  borderColor: "border.overlay",
  link: {
    color: "interactive.primary",
    fontWeight: "semibold",
    textDecoration: "underline",
  },
  blockquote: {
    borderColor: "border.overlay",
    color: "content.tertiary",
  },
});

export function AgentBubble({ text }: { text: string }) {
  return (
    <Flex
      align="flex-start"
      gap={2}
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
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
      >
        <AskAiIcon />
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
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={agentMarkdownComponents}
        >
          {text}
        </ReactMarkdown>
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
      alignSelf="center"
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
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
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

export function StationaryEnergyChatWelcome(props: {
  onStartDraft: () => void;
  onChooseSources: () => void;
}): ReactElement {
  const { t } = useStationaryEnergyAgenticTranslation();
  const capabilities = [
    t("chat-welcome-capability-draft"),
    t("chat-welcome-capability-compare"),
    t("chat-welcome-capability-save"),
  ];

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
      my="auto"
      py="l"
    >
      <VStack align="stretch" gap="l">
        <VStack align="center" gap="s" textAlign="center">
          <Box
            w="48px"
            h="48px"
            display="grid"
            placeItems="center"
            borderRadius="full"
            bg="interactive.tertiary"
            color="base.light"
          >
            <AskAiIcon />
          </Box>
          <Text
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("chat-welcome-title")}
          </Text>
          <Text color="content.secondary" fontSize="body.md" maxW="520px">
            {t("chat-welcome-subtitle")}
          </Text>
        </VStack>

        <VStack
          align="stretch"
          gap="s"
          bg="base.light"
          borderWidth="1px"
          borderColor="border.overlay"
          borderRadius="rounded-xl"
          p="m"
        >
          <Text
            fontFamily="heading"
            fontSize="label.sm"
            fontWeight="bold"
            textTransform="uppercase"
            letterSpacing="wide"
            color="content.tertiary"
          >
            {t("chat-welcome-can-do")}
          </Text>
          {capabilities.map((capability) => (
            <HStack key={capability} align="flex-start" gap="s">
              <Box color="interactive.tertiary" mt="2px" flexShrink={0}>
                <MdCheckCircle />
              </Box>
              <Text color="content.secondary" fontSize="body.md">
                {capability}
              </Text>
            </HStack>
          ))}
        </VStack>

        <QuickReplies
          buttons={[
            {
              label: t("chat-start-yes-draft"),
              primary: true,
              onClick: props.onStartDraft,
            },
            {
              label: t("chat-start-choose-sources"),
              onClick: props.onChooseSources,
            },
          ]}
        />
        <Text color="content.tertiary" fontSize="label.md" textAlign="center">
          {t("chat-welcome-or-ask")}
        </Text>
      </VStack>
    </Box>
  );
}

export function QuickReplies(props: {
  buttons: QuickReplyButton[];
  standalone?: boolean;
}) {
  return (
    <Flex
      gap={2}
      flexWrap="wrap"
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf={props.standalone ? "center" : undefined}
      transform={props.standalone ? CHAT_WIDGET_TRANSFORM : undefined}
    >
      {props.buttons.map((button) => (
        <chakra.button
          type="button"
          key={button.label}
          disabled={button.disabled}
          aria-disabled={button.disabled}
          minH="38px"
          maxW="100%"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          px="14px"
          py="8px"
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
          lineHeight="18px"
          letterSpacing="0"
          whiteSpace="normal"
          wordBreak="break-word"
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
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
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

export function RetryableErrorPanel(props: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}): ReactElement {
  const { t } = useStationaryEnergyAgenticTranslation();

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
      bg="sentiment.negativeOverlay"
      borderColor="sentiment.negativeDefault"
      borderWidth="1px"
      borderRadius="rounded-xl"
      p={4}
    >
      <HStack gap={2} mb={2} color="sentiment.negativeDefault">
        <MdErrorOutline />
        <Text fontFamily="heading" fontSize="body.md" fontWeight="semibold">
          {t("primitives-error-title")}
        </Text>
      </HStack>
      <Text
        color="content.primary"
        fontSize="body.md"
        mb={props.onRetry ? 3 : 0}
      >
        {props.message}
      </Text>
      {props.onRetry ? (
        <QuickReplies
          buttons={[
            {
              label: props.retrying
                ? t("primitives-error-retrying")
                : t("primitives-error-retry"),
              primary: true,
              disabled: props.retrying,
              onClick: props.onRetry,
            },
          ]}
        />
      ) : null}
    </Box>
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
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
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
      w={{ base: "full", md: "fit-content" }}
      maxW={{ base: "100%", md: "620px" }}
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
      bg="background.backgroundGreyFlat"
      pt={1}
      data-message-kind="pending-decision-nudge"
    >
      <Flex
        align={{ base: "flex-start", sm: "center" }}
        justify="flex-start"
        gap={2}
        flexDir={{ base: "column", sm: "row" }}
        bg="sentiment.warningOverlay"
        borderColor="interactive.quaternary"
        borderWidth="1px"
        borderRadius="rounded"
        px={2.5}
        py={1.5}
      >
        <Box minW={0}>
          <Text
            color="interactive.quaternary"
            fontFamily="heading"
            fontSize="label.sm"
            fontWeight="semibold"
            lineHeight="16px"
            lineClamp={1}
          >
            {label}
          </Text>
          <Text
            color="content.secondary"
            fontSize="label.sm"
            lineHeight="16px"
            lineClamp={1}
          >
            {t("primitives-pending-description")}
          </Text>
        </Box>
        <HStack gap={1.5} flexWrap="wrap" flexShrink={0}>
          <chakra.button
            type="button"
            minH="28px"
            px={2.5}
            py="4px"
            borderWidth="1px"
            borderColor="interactive.primary"
            borderRadius="rounded"
            bg="base.light"
            color="interactive.primary"
            fontFamily="heading"
            fontSize="label.sm"
            fontWeight="semibold"
            lineHeight="16px"
            onClick={props.onAskQuestion}
          >
            {t("primitives-pending-ask")}
          </chakra.button>
          <chakra.button
            type="button"
            minH="28px"
            px={2.5}
            py="4px"
            borderWidth="1px"
            borderColor="interactive.quaternary"
            borderRadius="rounded"
            bg="base.light"
            color="interactive.quaternary"
            fontFamily="heading"
            fontSize="label.sm"
            fontWeight="semibold"
            lineHeight="16px"
            onClick={props.onJumpToReview}
          >
            {t("primitives-pending-jump")}
          </chakra.button>
        </HStack>
      </Flex>
    </Box>
  );
}

export function InventorySaveConfirmationCard(props: {
  disabled?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
      bg="sentiment.warningOverlay"
      borderColor="interactive.quaternary"
      borderWidth="1px"
      borderRadius="rounded-xl"
      p={4}
      data-message-kind="inventory-save-confirmation"
    >
      <HStack gap={2} mb={3} color="interactive.quaternary">
        <MdErrorOutline />
        <Text fontFamily="heading" fontWeight="semibold">
          {t("primitives-inventory-save-confirm-title")}
        </Text>
      </HStack>
      <Text color="content.primary" fontSize="body.md" mb={4}>
        {t("primitives-inventory-save-confirm-description")}
      </Text>
      <QuickReplies
        buttons={[
          {
            label: t("primitives-inventory-save-confirm-cancel"),
            disabled: props.loading,
            onClick: props.onCancel,
          },
          {
            label: props.loading
              ? t("primitives-inventory-save-confirm-saving")
              : t("primitives-inventory-save-confirm-approve"),
            primary: true,
            disabled: props.disabled || props.loading,
            onClick: props.onConfirm,
          },
        ]}
      />
    </Box>
  );
}

function ToolChoiceSummaryCard(props: {
  choice: StationaryEnergyToolChoiceSummary;
  fallbackTitle: string;
  fallbackSource: string;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();
  const isLeaveDraft = props.choice.action === "leave_draft";
  const sourceTitle =
    props.choice.source_short_label ||
    props.choice.source_label ||
    props.choice.action ||
    props.fallbackSource;
  const sourceLabel = props.choice.source_label;
  const showSourceLabel =
    Boolean(sourceLabel) && sourceLabel !== props.choice.source_short_label;
  const sourceMeta =
    props.choice.source_meta && props.choice.source_meta !== props.choice.value
      ? props.choice.source_meta
      : null;

  if (isLeaveDraft) {
    return (
      <Box
        bg="base.light"
        borderColor="interactive.quaternary"
        borderWidth="1px"
        borderRadius="rounded"
        px={3}
        py={2}
      >
        <Text fontSize="label.md" fontWeight="semibold" color="content.primary">
          {props.choice.target_label || props.fallbackTitle}
        </Text>
        <Badge
          mt={2}
          display="inline-flex"
          alignItems="center"
          gap={1}
          px="s"
          py="2px"
          borderWidth="1px"
          borderColor="interactive.quaternary"
          borderRadius="rounded"
          bg="sentiment.warningOverlay"
          color="interactive.quaternary"
        >
          <MdErrorOutline />
          <Text
            fontFamily="heading"
            fontSize="label.sm"
            fontWeight="semibold"
            lineHeight="16px"
          >
            {t("review-summary-leave-empty")}
          </Text>
        </Badge>
        <Text color="content.secondary" fontSize="label.md" mt={2}>
          {t("review-summary-set-notation")}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      bg="base.light"
      borderColor="border.overlay"
      borderWidth="1px"
      borderRadius="rounded"
      px={3}
      py={2}
    >
      <Text fontSize="label.md" fontWeight="semibold" color="content.primary">
        {props.choice.target_label || props.fallbackTitle}
      </Text>
      <Flex justify="space-between" align="baseline" gap={3} mt={1}>
        <Text
          fontFamily="heading"
          fontSize="label.md"
          fontWeight="semibold"
          color="content.primary"
          truncate
          minW={0}
        >
          {sourceTitle}
        </Text>
        {props.choice.value ? (
          <Text
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
            color="content.primary"
            whiteSpace="nowrap"
            flexShrink={0}
          >
            {props.choice.value}
          </Text>
        ) : null}
      </Flex>
      {showSourceLabel ? (
        <Text fontSize="label.md" color="content.secondary" mt="2px">
          {sourceLabel}
        </Text>
      ) : null}
      {sourceMeta ? (
        <Text fontSize="label.sm" color="content.tertiary" mt="2px">
          {sourceMeta}
        </Text>
      ) : null}
    </Box>
  );
}

export function BulkReviewConfirmationCard(props: {
  choices: StationaryEnergyToolChoiceSummary[];
  blockedChoices: StationaryEnergyToolChoiceSummary[];
  disabled?: boolean;
  loading?: boolean;
  message?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();
  const visibleChoices = props.choices.slice(0, 6);
  const extraChoiceCount = Math.max(
    0,
    props.choices.length - visibleChoices.length,
  );

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
      bg="sentiment.warningOverlay"
      borderColor="interactive.quaternary"
      borderWidth="1px"
      borderRadius="rounded-xl"
      p={4}
      data-message-kind="stationary-energy-bulk-review-confirmation"
    >
      <HStack gap={2} mb={3} color="interactive.quaternary">
        <MdErrorOutline />
        <Text fontFamily="heading" fontWeight="semibold">
          {t("primitives-bulk-review-confirm-title", {
            count: props.choices.length,
          })}
        </Text>
      </HStack>
      <Text color="content.primary" fontSize="body.md" mb={3}>
        {props.message || t("primitives-bulk-review-confirm-description")}
      </Text>
      <VStack align="stretch" gap={2} mb={4}>
        {visibleChoices.map((choice, index) => (
          <ToolChoiceSummaryCard
            key={`${choice.proposal_id ?? index}-${choice.selected_candidate_id ?? choice.selected_source_id ?? choice.action}`}
            choice={choice}
            fallbackTitle={t("review-fallback-row-label")}
            fallbackSource={t("review-summary-choice-staged")}
          />
        ))}
        {extraChoiceCount > 0 ? (
          <Text color="content.tertiary" fontSize="label.md">
            {t("primitives-bulk-review-confirm-more", {
              count: extraChoiceCount,
            })}
          </Text>
        ) : null}
        {props.blockedChoices.length > 0 ? (
          <Text
            color="interactive.quaternary"
            fontSize="label.md"
            fontWeight="semibold"
          >
            {t("primitives-bulk-review-confirm-blocked", {
              count: props.blockedChoices.length,
            })}
          </Text>
        ) : null}
      </VStack>
      <QuickReplies
        buttons={[
          {
            label: t("primitives-bulk-review-confirm-cancel"),
            disabled: props.loading,
            onClick: props.onCancel,
          },
          {
            label: props.loading
              ? t("primitives-bulk-review-confirm-applying")
              : t("primitives-bulk-review-confirm-approve"),
            primary: true,
            disabled:
              props.disabled || props.loading || props.choices.length === 0,
            onClick: props.onConfirm,
          },
        ]}
      />
    </Box>
  );
}

export function StagedReviewUpdateConfirmationCard(props: {
  mode: "change" | "rollback";
  choices: StationaryEnergyToolChoiceSummary[];
  blockedChoices: StationaryEnergyToolChoiceSummary[];
  disabled?: boolean;
  loading?: boolean;
  message?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useStationaryEnergyAgenticTranslation();
  const visibleChoices = props.choices.slice(0, 6);
  const extraChoiceCount = Math.max(
    0,
    props.choices.length - visibleChoices.length,
  );
  const isRollback = props.mode === "rollback";

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
      bg="sentiment.warningOverlay"
      borderColor="interactive.quaternary"
      borderWidth="1px"
      borderRadius="rounded-xl"
      p={4}
      data-message-kind={`stationary-energy-staged-review-${props.mode}-confirmation`}
    >
      <HStack gap={2} mb={3} color="interactive.quaternary">
        <MdErrorOutline />
        <Text fontFamily="heading" fontWeight="semibold">
          {t(
            isRollback
              ? "primitives-staged-review-rollback-confirm-title"
              : "primitives-staged-review-change-confirm-title",
            { count: props.choices.length },
          )}
        </Text>
      </HStack>
      <Text color="content.primary" fontSize="body.md" mb={3}>
        {props.message ||
          t(
            isRollback
              ? "primitives-staged-review-rollback-confirm-description"
              : "primitives-staged-review-change-confirm-description",
          )}
      </Text>
      <VStack align="stretch" gap={2} mb={4}>
        {visibleChoices.map((choice, index) => (
          <ToolChoiceSummaryCard
            key={`${props.mode}-${choice.proposal_id ?? index}-${choice.selected_candidate_id ?? choice.selected_source_id ?? choice.action}`}
            choice={{
              ...choice,
              source_label:
                choice.source_label ||
                t(
                  isRollback
                    ? "primitives-staged-review-rollback-choice"
                    : "primitives-staged-review-change-choice",
                  {
                    source:
                      choice.source_label ||
                      choice.action ||
                      t("review-summary-choice-staged"),
                  },
                ),
            }}
            fallbackTitle={t("review-fallback-row-label")}
            fallbackSource={t("review-summary-choice-staged")}
          />
        ))}
        {extraChoiceCount > 0 ? (
          <Text color="content.tertiary" fontSize="label.md">
            {t("primitives-bulk-review-confirm-more", {
              count: extraChoiceCount,
            })}
          </Text>
        ) : null}
        {props.blockedChoices.length > 0 ? (
          <Text
            color="interactive.quaternary"
            fontSize="label.md"
            fontWeight="semibold"
          >
            {t("primitives-bulk-review-confirm-blocked", {
              count: props.blockedChoices.length,
            })}
          </Text>
        ) : null}
      </VStack>
      <QuickReplies
        buttons={[
          {
            label: t("primitives-staged-review-update-confirm-cancel"),
            disabled: props.loading,
            onClick: props.onCancel,
          },
          {
            label: props.loading
              ? t("primitives-staged-review-update-confirm-applying")
              : t(
                  isRollback
                    ? "primitives-staged-review-rollback-confirm-approve"
                    : "primitives-staged-review-change-confirm-approve",
                ),
            primary: true,
            disabled:
              props.disabled || props.loading || props.choices.length === 0,
            onClick: props.onConfirm,
          },
        ]}
      />
    </Box>
  );
}

export function StationaryEnergyToolSummaryCard(props: {
  action: string;
  message?: string | null;
  selectedChoices: StationaryEnergyToolChoiceSummary[];
  blockedChoices: StationaryEnergyToolChoiceSummary[];
}) {
  const { t } = useStationaryEnergyAgenticTranslation();
  const hasSelected = props.selectedChoices.length > 0;
  const hasBlocked = props.blockedChoices.length > 0;

  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
      bg="base.light"
      borderColor="border.overlay"
      borderWidth="1px"
      borderRadius="rounded-xl"
      p={4}
      data-message-kind="stationary-energy-tool-summary"
    >
      <HStack gap={2} mb={2} color="interactive.tertiary">
        <MdCheckCircle />
        <Text fontFamily="heading" fontWeight="semibold">
          {t("primitives-tool-summary-title")}
        </Text>
      </HStack>
      {props.message ? (
        <Text color="content.secondary" fontSize="body.md" mb={3}>
          {props.message}
        </Text>
      ) : null}
      {hasSelected ? (
        <VStack align="stretch" gap={2} mb={hasBlocked ? 3 : 0}>
          {props.selectedChoices.slice(0, 6).map((choice, index) => (
            <ToolChoiceSummaryCard
              key={`${choice.proposal_id ?? index}-${choice.source_label ?? choice.action}`}
              choice={choice}
              fallbackTitle={t("review-fallback-row-label")}
              fallbackSource={t("review-summary-choice-staged")}
            />
          ))}
          {props.selectedChoices.length > 6 ? (
            <Text color="content.tertiary" fontSize="label.md">
              {t("primitives-tool-summary-more", {
                count: props.selectedChoices.length - 6,
              })}
            </Text>
          ) : null}
        </VStack>
      ) : null}
      {hasBlocked ? (
        <Box
          bg="sentiment.warningOverlay"
          borderColor="interactive.quaternary"
          borderWidth="1px"
          borderRadius="rounded"
          px={3}
          py={2}
        >
          <Text
            color="interactive.quaternary"
            fontSize="label.md"
            fontWeight="semibold"
          >
            {t("primitives-tool-summary-blocked", {
              count: props.blockedChoices.length,
            })}
          </Text>
        </Box>
      ) : null}
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
      alignSelf="center"
      transform={CHAT_WIDGET_TRANSFORM}
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
