"use client";
/* eslint-disable i18next/no-literal-string */

import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Spinner,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdCheckCircle,
  MdErrorOutline,
  MdRefresh,
  MdSave,
  MdSend,
} from "react-icons/md";

import { Button } from "@/components/ui/button";

import type {
  ArtifactRow,
  DecisionReviewContext,
  DraftCounts,
  DraftStage,
} from "./flow";
import type {
  DraftDecisionAction,
  DraftDecisionState,
  DraftListItem,
  DraftProposal,
  DraftStatusResponse,
} from "./types";
import type {
  ChatMessage,
  LoadingAction,
} from "./use-stationary-energy-chat-artifact-controller";

const CHAT_SURFACE_MAX_W = "408px";
const AGENT_BUBBLE_MAX_W = "368px";
const USER_BUBBLE_MAX_W = "330px";
const FLOW_BUTTON_RADIUS = "rounded";

type ArtifactPanelProps = {
  cityName: string;
  inventoryYear: string | number;
  stage: DraftStage;
  rows: ArtifactRow[];
  counts: DraftCounts;
  activeProposalId: string | null;
  loadingAction: LoadingAction;
  draftStatus: string;
  hasSourceBackedProposals: boolean;
  hasDraft: boolean;
  draftRuns: DraftListItem[];
  draftListLoading: boolean;
  activeDraftRunId: string | null;
  canPersistDraftReview: boolean;
  canSaveToInventory: boolean;
  unresolvedCount: number;
  onStartDraft: () => void;
  onRefresh: () => void;
  onSelectDraft: (draftRunId: string) => void;
  onSaveDraft: () => void;
  onSaveToInventory: () => void;
};

type ClimaChatPanelProps = {
  stage: DraftStage;
  draftState: DraftStatusResponse | null;
  counts: DraftCounts;
  pendingDecisionCount: number;
  decisionReviewContext: DecisionReviewContext[];
  decisionState: Record<string, DraftDecisionState>;
  resolvedProposalIds: Set<string>;
  sourcePreference: string | null;
  sourcePreferenceOptions: string[];
  chatMessages: ChatMessage[];
  chatInput: string;
  loadingAction: LoadingAction;
  canPersistDraftReview: boolean;
  canSaveToInventory: boolean;
  hasSourceBackedProposals: boolean;
  errorMessage: string | null;
  showStaleWarning: boolean;
  staleDraft: DraftStatusResponse["staleness"];
  onChatInputChange: (value: string) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStopChat: () => void;
  onStartDraft: () => void;
  onPreference: (preference: string) => void;
  onDecisionChoice: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  onEditDecision: (proposalId: string) => void;
  onContinueStaleDraft: () => void;
  onStartOver: () => void;
  onSaveDraft: () => void;
  onSaveToInventory: () => void;
};

function draftRunStatusLabel(status: string) {
  if (status === "reviewed") {
    return "Draft saved";
  }
  if (status === "ready") {
    return "Working draft";
  }
  if (status === "failed") {
    return "Failed draft";
  }
  return status.replaceAll("_", " ");
}

function formatDraftRunUpdatedAt(value: string) {
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

function draftRunOptionLabel(draftRun: DraftListItem) {
  const reviewLabel =
    draftRun.reviewable_proposal_count > 0
      ? `${draftRun.resolved_review_count}/${draftRun.reviewable_proposal_count} reviewed`
      : "no source-backed rows";
  return `${draftRunStatusLabel(draftRun.status)} | ${reviewLabel} | ${formatDraftRunUpdatedAt(draftRun.updated_at)}`;
}

export function ArtifactPanel(props: ArtifactPanelProps) {
  const draftedCount = props.rows.filter((row) =>
    ["done", "manual"].includes(row.state),
  ).length;
  const progress =
    props.rows.length > 0
      ? Math.round((draftedCount / props.rows.length) * 100)
      : 0;
  const chip = stageChip(props.stage, props.draftStatus);

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
                Stationary energy - working draft
              </Heading>
              <Text color="content.tertiary" fontSize="label.md">
                {props.cityName} / {props.inventoryYear} / GPC BASIC
              </Text>
            </Box>
          </HStack>
          <VStack
            align={{ base: "stretch", md: "end" }}
            gap={2}
            w={{ base: "full", md: "auto" }}
          >
            {props.draftRuns.length > 0 ? (
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
                    Drafts saved in Clima
                  </Text>
                  <Button
                    variant="outline"
                    borderRadius={FLOW_BUTTON_RADIUS}
                    loading={props.loadingAction === "start"}
                    onClick={props.onStartDraft}
                  >
                    New draft
                  </Button>
                </Flex>
                <chakra.select
                  value={props.activeDraftRunId ?? ""}
                  onChange={(event) => {
                    if (event.target.value) {
                      props.onSelectDraft(event.target.value);
                    }
                  }}
                  disabled={props.draftListLoading}
                  w="full"
                  minH="40px"
                  px={3}
                  borderWidth="1px"
                  borderColor="border.overlay"
                  borderRadius="rounded"
                  bg="base.light"
                  color="content.primary"
                >
                  {!props.activeDraftRunId ? (
                    <option value="">Select a saved draft</option>
                  ) : null}
                  {props.draftRuns.map((draftRun) => (
                    <option
                      key={draftRun.draft_run_id}
                      value={draftRun.draft_run_id}
                    >
                      {draftRunOptionLabel(draftRun)}
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
            {overviewTitle(props.stage)}
          </Text>
          <Text color="content.secondary" fontSize="label.md">
            {draftedCount} of {props.rows.length} drafted
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
          {props.rows.map((row) => (
            <ArtifactRowView
              key={row.id}
              row={row}
              active={row.id === props.activeProposalId}
              drafting={
                props.stage === "drafting" && props.loadingAction === "start"
              }
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
          {props.stage === "review"
            ? props.canSaveToInventory
              ? `${props.counts.ready + props.counts.accepted} rows ready / ${props.counts.gap} gaps`
              : props.canPersistDraftReview
                ? "Draft review is ready to save in Clima"
                : props.hasSourceBackedProposals
                  ? "No source-backed rows are staged to save"
                  : "No source-backed rows are ready to save"
            : props.unresolvedCount > 0
              ? `${props.unresolvedCount} decisions needed before save`
              : "Nothing is written until you save"}
        </Text>
        <HStack gap={2} justify={{ base: "flex-end", md: "initial" }}>
          <Button
            variant="outline"
            borderRadius={FLOW_BUTTON_RADIUS}
            disabled={!props.hasDraft}
            loading={props.loadingAction === "refresh"}
            onClick={props.onRefresh}
          >
            <MdRefresh />
            Refresh
          </Button>
          {props.stage === "start" ? (
            <Button
              data-testid="start-draft-button"
              borderRadius={FLOW_BUTTON_RADIUS}
              loading={props.loadingAction === "start"}
              onClick={props.onStartDraft}
            >
              Start draft
            </Button>
          ) : null}
          {props.stage !== "start" && props.canPersistDraftReview ? (
            <Button
              data-testid="save-review-draft-button"
              variant="outline"
              borderRadius={FLOW_BUTTON_RADIUS}
              loading={props.loadingAction === "save_draft"}
              onClick={props.onSaveDraft}
            >
              <MdSave />
              Save draft
            </Button>
          ) : null}
          {props.stage !== "start" && props.canSaveToInventory ? (
            <Button
              data-testid="save-inventory-button"
              borderRadius={FLOW_BUTTON_RADIUS}
              disabled={!props.canSaveToInventory}
              loading={props.loadingAction === "save_inventory"}
              onClick={props.onSaveToInventory}
            >
              <MdSave />
              Save to inventory
            </Button>
          ) : null}
        </HStack>
      </Flex>
    </Box>
  );
}

function ArtifactRowView(props: {
  row: ArtifactRow;
  active: boolean;
  drafting: boolean;
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
          {props.row.scope || "Stationary Energy"}
        </Text>
      </Box>
      <Box minW="150px" textAlign="right">
        {props.row.value &&
        props.row.value !== "No source-backed draft value" ? (
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

function RowMarker({ state }: { state: ArtifactRow["state"] }) {
  if (state === "active") {
    return <Spinner size="sm" color="brand.primary" />;
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

export function ClimaChatPanel(props: ClimaChatPanelProps) {
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const pendingDecisionAnchorRef = useRef<HTMLDivElement | null>(null);
  const [showPendingDecisionNudge, setShowPendingDecisionNudge] =
    useState(false);
  const firstPendingDecision =
    props.decisionReviewContext.find(
      (context) => !props.resolvedProposalIds.has(context.proposal_id),
    ) ?? null;
  const { chatInput, onChatInputChange } = props;

  const focusChatComposer = useCallback(
    (draftQuestion?: string) => {
      if (draftQuestion && !chatInput.trim()) {
        onChatInputChange(draftQuestion);
      }

      window.requestAnimationFrame(() => {
        const input = chatInputRef.current;
        if (!input) {
          return;
        }
        input.focus();
        const cursorPosition = input.value.length;
        input.setSelectionRange(cursorPosition, cursorPosition);
      });
    },
    [chatInput, onChatInputChange],
  );

  const handleAskAboutProposal = useCallback(
    (label: string) => {
      focusChatComposer(
        `Can you explain the connected source proposal for ${label}?`,
      );
    },
    [focusChatComposer],
  );

  const handleJumpToPendingDecision = useCallback(() => {
    pendingDecisionAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, []);

  useEffect(() => {
    if (props.showStaleWarning || !firstPendingDecision) {
      setShowPendingDecisionNudge(false);
      return;
    }

    const scrollRegion = scrollRegionRef.current;
    const pendingDecisionAnchor = pendingDecisionAnchorRef.current;
    if (!scrollRegion || !pendingDecisionAnchor) {
      setShowPendingDecisionNudge(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowPendingDecisionNudge(!entry.isIntersecting);
      },
      {
        root: scrollRegion,
        threshold: 0.45,
      },
    );

    observer.observe(pendingDecisionAnchor);
    return () => observer.disconnect();
  }, [firstPendingDecision, props.chatMessages.length, props.showStaleWarning]);

  return (
    <Box
      bg="base.light"
      borderColor="border.neutral"
      borderWidth="1px"
      borderRadius="rounded-xl"
      overflow="hidden"
      h={{ base: "min(72dvh, 760px)", xl: "full" }}
      maxH={{ base: "72dvh", xl: "none" }}
      minH={0}
      display="flex"
      flexDir="column"
    >
      <Flex
        align="center"
        gap={3}
        bg="interactive.tertiary"
        color="base.light"
        p={4}
      >
        <Box
          w="32px"
          h="32px"
          display="grid"
          placeItems="center"
          borderRadius="rounded"
          bg="interactive.primary"
          fontFamily="heading"
          fontWeight="semibold"
        >
          *
        </Box>
        <Box>
          <Text fontFamily="heading" fontWeight="semibold">
            Clima
          </Text>
          <Text fontSize="label.md" opacity={0.9}>
            Climate Advisor
          </Text>
        </Box>
      </Flex>

      <VStack
        ref={scrollRegionRef}
        align="stretch"
        gap={3}
        flex="1"
        minH={0}
        overflowY="auto"
        p={4}
        bg="background.backgroundGreyFlat"
        data-testid="clima-chat-scroll-region"
      >
        {showPendingDecisionNudge && firstPendingDecision ? (
          <PendingDecisionNudge
            pendingDecisionCount={props.pendingDecisionCount}
            onAskQuestion={() =>
              handleAskAboutProposal(firstPendingDecision.label)
            }
            onJumpToReview={handleJumpToPendingDecision}
          />
        ) : null}
        {props.showStaleWarning ? (
          <StaleDraftPanel
            staleDraft={props.staleDraft ?? null}
            onContinue={props.onContinueStaleDraft}
            onStartOver={props.onStartOver}
          />
        ) : (
          <>
            <StageMessages {...props} />
            {props.errorMessage && (
              <Box
                color="sentiment.negativeDefault"
                bg="sentiment.negativeOverlay"
                borderRadius="rounded"
                px={3}
                py={2}
                fontSize="label.md"
              >
                {props.errorMessage}
              </Box>
            )}
            {props.chatMessages.map((message) => {
              if (message.kind === "decision_review") {
                const context = props.decisionReviewContext.find(
                  (candidate) => candidate.proposal_id === message.proposalId,
                );
                if (!context) {
                  return null;
                }
                return (
                  <Box
                    key={message.id}
                    ref={
                      context.proposal_id === firstPendingDecision?.proposal_id
                        ? pendingDecisionAnchorRef
                        : undefined
                    }
                    scrollMarginTop="72px"
                  >
                    {props.resolvedProposalIds.has(context.proposal_id) ? (
                      <ResolvedDecisionSummaryCard
                        context={context}
                        decision={props.decisionState[context.proposal_id]}
                        onEditDecision={props.onEditDecision}
                      />
                    ) : (
                      <>
                        {context.kind === "single_source" ? (
                          <SingleSourceProposalCard
                            context={context}
                            decision={props.decisionState[context.proposal_id]}
                            resolved={false}
                            onDecisionChoice={props.onDecisionChoice}
                            onAskAboutProposal={handleAskAboutProposal}
                          />
                        ) : (
                          <MultiSourceProposalCard
                            context={context}
                            decision={props.decisionState[context.proposal_id]}
                            resolved={false}
                            onDecisionChoice={props.onDecisionChoice}
                            onAskAboutProposal={handleAskAboutProposal}
                          />
                        )}
                      </>
                    )}
                  </Box>
                );
              }

              return message.role === "user" ? (
                <UserBubble key={message.id} text={message.text} />
              ) : (
                <AgentBubble
                  key={message.id}
                  text={message.text || "Thinking..."}
                />
              );
            })}
          </>
        )}
      </VStack>

      <Box
        data-testid="clima-chat-composer"
        p={3}
        bg="base.light"
        borderTopWidth="1px"
        borderColor="border.neutral"
      >
        <form onSubmit={props.onChatSubmit}>
          <HStack gap={2}>
            <Input
              ref={chatInputRef}
              value={props.chatInput}
              onChange={(event) => props.onChatInputChange(event.target.value)}
              placeholder={
                props.pendingDecisionCount > 0
                  ? "Ask about a source or row before deciding..."
                  : "Message Clima..."
              }
              borderRadius="rounded"
              bg="background.backgroundGreyFlat"
              borderColor="border.overlay"
              disabled={props.loadingAction === "chat"}
            />
            {props.loadingAction === "chat" ? (
              <Button
                variant="outline"
                borderRadius={FLOW_BUTTON_RADIUS}
                onClick={props.onStopChat}
              >
                Stop
              </Button>
            ) : (
              <Button type="submit" borderRadius={FLOW_BUTTON_RADIUS} px={4}>
                <MdSend />
              </Button>
            )}
          </HStack>
        </form>
      </Box>
    </Box>
  );
}

function StageMessages(props: ClimaChatPanelProps) {
  if (props.stage === "start") {
    return (
      <>
        <AgentBubble text="I can help complete the Stationary Energy sector using third-party data already integrated with this inventory." />
        <CoveragePanel
          sourceCount={props.draftState?.source_candidates.length ?? null}
          currentCount={props.counts.total}
        />
        <AgentBubble text="Want me to draft the empty rows? You can review every value before saving." />
        <QuickReplies
          buttons={[
            {
              label: "Yes, draft them",
              primary: true,
              onClick: props.onStartDraft,
            },
            {
              label: "Let me choose sources",
              onClick: () => props.onPreference("Let me choose sources"),
            },
          ]}
        />
      </>
    );
  }

  if (props.stage === "drafting") {
    const preferenceButtons = [
      ...props.sourcePreferenceOptions.map((sourceName) => ({
        label: `Prefer ${sourceName}`,
        onClick: () => props.onPreference(`Prefer ${sourceName}`),
      })),
      {
        label: "No preference",
        onClick: () => props.onPreference("No preference"),
      },
    ];

    return (
      <>
        <AgentBubble text="Starting now. I will draft each empty Stationary Energy row from the integrated sources." />
        <QuickReplies buttons={preferenceButtons} />
        {props.sourcePreference && <UserBubble text={props.sourcePreference} />}
        <StatusLine text="Drafting rows and comparing source coverage..." />
      </>
    );
  }

  if (props.stage === "decision" && props.pendingDecisionCount > 0) {
    const label =
      props.pendingDecisionCount === 1
        ? "1 row needs decision review"
        : `${props.pendingDecisionCount} rows need decision review`;
    return (
      <>
        <AgentBubble
          text={`Most rows are drafted. ${label}; I marked those reviews below and will keep them in this chat history while we discuss anything else.`}
        />
      </>
    );
  }

  if (props.draftState?.status === "saved") {
    return (
      <>
        <AgentBubble text="Saved. The reviewed source-backed rows are already committed to the inventory." />
        <RunSummary
          counts={props.counts}
          pendingDecisionCount={props.pendingDecisionCount}
        />
      </>
    );
  }

  if (
    props.decisionReviewContext.length === 0 &&
    !props.canSaveToInventory &&
    !props.canPersistDraftReview
  ) {
    return (
      <>
        <AgentBubble
          text={
            props.hasSourceBackedProposals
              ? "Review complete. No source-backed rows are staged to save."
              : "No source-backed proposals are available to save from the current connected datasets."
          }
        />
        <RunSummary
          counts={props.counts}
          pendingDecisionCount={props.pendingDecisionCount}
        />
        <AgentBubble text="Rows without a usable source can stay empty or be handled later with a notation key." />
      </>
    );
  }

  return (
    <>
      <AgentBubble
        text={
          props.canSaveToInventory
            ? "Done. Review the working draft on the left, save it in Clima, or commit it to the inventory when you are ready."
            : props.canPersistDraftReview
              ? "Review complete. Save this draft in Clima now if you want to come back later."
              : "Review complete. Nothing is ready to save yet."
        }
      />
      <RunSummary
        counts={props.counts}
        pendingDecisionCount={props.pendingDecisionCount}
      />
      <AgentBubble text="Rows without a usable source can stay empty or be handled later with a notation key." />
      {props.canPersistDraftReview || props.canSaveToInventory ? (
        <QuickReplies
          buttons={[
            ...(props.canPersistDraftReview
              ? [
                  {
                    label: "Save draft",
                    onClick: props.onSaveDraft,
                  },
                ]
              : []),
            ...(props.canSaveToInventory
              ? [
                  {
                    label: "Save to inventory",
                    primary: true,
                    onClick: props.onSaveToInventory,
                  },
                ]
              : []),
            {
              label: "Set notation for empty ones",
              onClick: () => props.onPreference("Set notation for empty ones"),
            },
          ]}
        />
      ) : null}
    </>
  );
}

function AgentBubble({ text }: { text: string }) {
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

function UserBubble({ text }: { text: string }) {
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

function CoveragePanel(props: {
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

function QuickReplies(props: {
  buttons: Array<{
    label: string;
    primary?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }>;
}) {
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

function StatusLine({ text }: { text: string }) {
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

function StaleDraftPanel(props: {
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

function PendingDecisionNudge(props: {
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

function resolvedDecisionBadgeLabel(action: DraftDecisionAction | undefined) {
  if (action === "leave_draft") {
    return "Left empty";
  }
  if (action === "override_source") {
    return "Alternative source";
  }
  if (action === "override_manual") {
    return "Manual";
  }
  return "Accepted";
}

function ResolvedDecisionSummaryCard(props: {
  context: DecisionReviewContext;
  decision?: DraftDecisionState;
  onEditDecision: (proposalId: string) => void;
}) {
  const selectedOption = selectedDecisionOption(props.context, props.decision);
  const badgeLabel = resolvedDecisionBadgeLabel(props.decision?.action);
  const summaryLabel =
    selectedOption?.action === "leave_draft"
      ? "Leave empty"
      : (selectedOption?.label ?? "Choice staged");
  const summaryMeta =
    selectedOption?.action === "leave_draft"
      ? "Set a notation key later"
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
              Decision staged
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
            Change
          </chakra.button>
        </VStack>
      </Flex>
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
  onDecisionChoice: (
    proposal: DraftProposal,
    action: DraftDecisionAction,
    selectedSourceId?: string,
    label?: string,
  ) => void;
  onAskAboutProposal: (label: string) => void;
}) {
  return (
    <Box
      w="full"
      maxW={CHAT_SURFACE_MAX_W}
      alignSelf="flex-start"
      data-message-kind={props.title}
      data-proposal-id={props.proposal.proposal_id}
      aria-label="Stationary Energy decision review"
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
        {props.resolved && (
          <Badge
            bg="base.light"
            color="interactive.primary"
            borderRadius="full"
            fontSize="label.sm"
          >
            Staged
          </Badge>
        )}
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
                  {option.recommended && (
                    <Text
                      color="content.tertiary"
                      fontSize="label.md"
                      fontWeight="semibold"
                      whiteSpace="nowrap"
                    >
                      Recommended
                    </Text>
                  )}
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
                  {selected ? "Selected" : ""}
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
          Pick one here, or ask me a question first and come back to this
          review.
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
          Ask about this row
        </chakra.button>
      </Flex>
    </Box>
  );
}

function SingleSourceProposalCard(props: {
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
  return (
    <DecisionReviewBaseCard
      title="Single source review"
      description={`${props.context.label} has one connected source proposal to confirm.`}
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

function MultiSourceProposalCard(props: {
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
  const options = [
    ...(props.context.recommendedOption
      ? [props.context.recommendedOption]
      : []),
    ...props.context.alternativeOptions,
    props.context.leaveDraftOption,
  ];

  return (
    <DecisionReviewBaseCard
      title="Multi-source review"
      description={`${props.context.label} has multiple connected source proposals to compare. Which should I use?`}
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

function RunSummary({
  counts,
  pendingDecisionCount,
}: {
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
      <HStack mb={3} justify="space-between">
        <HStack gap={2}>
          <MdCheckCircle />
          <Text fontFamily="heading" fontWeight="semibold">
            Run summary
          </Text>
        </HStack>
        <Badge
          bg="sentiment.positiveOverlay"
          color="interactive.primary"
          borderRadius="full"
        >
          Review
        </Badge>
      </HStack>
      <SimpleGrid columns={2} gap={2}>
        <SummaryTile
          label="Drafted"
          value={`${counts.ready + counts.accepted} rows`}
        />
        <SummaryTile label="Needs choice" value={`${pendingDecisionCount}`} />
        <SummaryTile label="No source" value={`${counts.gap}`} />
        <SummaryTile label="Committed" value={`${counts.committed}`} />
      </SimpleGrid>
    </Box>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Box bg="background.backgroundGreyFlat" borderRadius="rounded" p={3}>
      <Text color="content.tertiary" fontSize="label.md">
        {label}
      </Text>
      <Text
        color="content.secondary"
        fontFamily="heading"
        fontSize="label.md"
        fontWeight="medium"
      >
        {value}
      </Text>
    </Box>
  );
}

function stageChip(stage: DraftStage, status: string) {
  if (status === "saved") {
    return {
      label: "Saved",
      bg: "sentiment.positiveOverlay",
      color: "interactive.primary",
    };
  }
  if (status === "no_changes") {
    return {
      label: "Nothing to save",
      bg: "background.neutral",
      color: "content.secondary",
    };
  }
  if (status === "partially_saved") {
    return {
      label: "Partially saved",
      bg: "sentiment.warningOverlay",
      color: "interactive.quaternary",
    };
  }
  if (stage === "drafting") {
    return {
      label: "Drafting",
      bg: "background.neutral",
      color: "brand.primary",
    };
  }
  if (stage === "decision") {
    return {
      label: "Needs a decision",
      bg: "sentiment.warningOverlay",
      color: "interactive.quaternary",
    };
  }
  if (stage === "review") {
    return {
      label: "Ready to review",
      bg: "sentiment.positiveOverlay",
      color: "interactive.primary",
    };
  }
  return {
    label: "Ready",
    bg: "sentiment.positiveOverlay",
    color: "interactive.primary",
  };
}

function overviewTitle(stage: DraftStage) {
  if (stage === "start") {
    return "Not started";
  }
  if (stage === "drafting") {
    return "Drafting";
  }
  if (stage === "decision") {
    return "Drafting";
  }
  return "Ready to review";
}

