"use client";

import type { FormEvent } from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Box,
  chakra,
  Flex,
  HStack,
  Icon,
  Spinner,
  Text,
  Textarea,
  VisuallyHidden,
  VStack,
} from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowUp, LuCircleAlert, LuRotateCw } from "react-icons/lu";
import { BsStars } from "react-icons/bs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { createChatMarkdownComponents } from "@/components/shared/chat-markdown-components";
import { useEnterSubmit } from "@/hooks/useEnterSubmit";
import { ReviewButton as Button } from "./review-button";
import { useTranslation } from "@/i18n/client";
import {
  useConceptNoteChat,
  type ChatConnectionState,
} from "./use-concept-note-chat";
import {
  ChatThreadSwitcher,
  OlderChatNotice,
  useConceptNoteChatThreads,
} from "./chat-threads";
import { ChatProgress } from "./chat-progress";
import { DraftingProgressCard } from "./drafting-progress-card";
import { ChatWelcome, type ChatWelcomeStage } from "./chat-welcome";
import { GapAnswerForm, type GapAnswerRequest } from "./gap-answer-form";
import { ChatVisualFrame } from "./chat-visual-frame";
import { ChatChoices } from "./chat-choices";
import {
  GAP_ANSWER_REQUEST_KEYS,
  GAP_ANSWER_SLOTS,
  readGapAnswerMessage,
  requestQuestion,
} from "./chat-utils";
import type { ConceptNoteContextPresentation } from "./context-status";
import { ContextChangesNotice } from "./context-changes-notice";
import type { ConceptNoteContextChange } from "@/components/ConceptNoteDashboard/utils";
import type { EditController } from "./document-review";
import {
  EDIT_INSTRUCTION_MAX_CHARS,
  type EditScope,
} from "@/util/concept-note-edit-types";
import type {
  ConceptNoteDraftState,
  ConceptNoteUploadResponse,
} from "@/util/types";

// About eight lines of composer text before it scrolls.
const COMPOSER_MAX_HEIGHT_PX = 190;
// Focus scrolling exposes a radio's 1 px hidden input (the top of its option)
// or a textarea's caret line, so keep two more lines clear above the gap
// form's footer for the rest of the option or field.
const GAP_FOOTER_FOCUS_SLACK_PX = 40;

const CONNECTION_BADGE: Record<
  ChatConnectionState,
  { color: string; label: string }
> = {
  connecting: { color: "content.tertiary", label: "connection-connecting" },
  connected: { color: "sentiment.positiveDefault", label: "connected" },
  retrying: { color: "sentiment.warningDefault", label: "connection-retrying" },
  error: { color: "sentiment.negativeDefault", label: "connection-error" },
};

interface ConceptNoteChatPanelProps {
  cityId: string;
  contextStatus: ConceptNoteContextPresentation;
  contextBuildId?: string | null;
  contextChanges?: ConceptNoteContextChange[];
  composerRequest: { content: string; id: string } | null;
  gapAnswer: GapAnswerRequest | null;
  onCloseGap: () => void;
  onAddGapSource: () => void;
  /** The run's uploads, so gap source refs show as document names. */
  uploads?: ConceptNoteUploadResponse[];
  draftOverviewPending: boolean;
  lng: string;
  onOpenContext: () => void;
  runId: string;
  threadId: string | null;
  editScope: EditScope;
  edits: EditController;
  draft?: ConceptNoteDraftState | null;
  draftStartedAt?: string | null;
  draftCompletedAt?: string | null;
  welcomeStage?: ChatWelcomeStage | null;
  onOpenDraft?: () => void;
  onOpenFundingSetup?: () => void;
  onDraftOverviewComplete?: () => void;
  /** Answers saved on a gap changed, so the workspace reloads its gaps. */
  onGapAnswersSaved?: () => void;
  /** Reloads the draft without closing the gap form, after a save conflict. */
  onRefreshDraft?: () => void;
}

interface ContextStatusNoticeProps {
  autoDismissAfterMs?: number;
  busy?: boolean;
  onOpenContext: () => void;
  status: {
    actionIcon: IconType;
    actionLabel: string;
    color: string;
    description: string;
    icon: IconType;
    surface: string;
    title: string;
  };
}

const CONTEXT_READY_NOTICE_DURATION_MS = 30_000;
function ContextStatusNotice({
  autoDismissAfterMs,
  busy,
  onOpenContext,
  status,
}: ContextStatusNoticeProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!autoDismissAfterMs) {
      return;
    }

    const timeout = window.setTimeout(
      () => setVisible(false),
      autoDismissAfterMs,
    );
    return () => window.clearTimeout(timeout);
  }, [autoDismissAfterMs]);

  if (!visible) {
    return null;
  }

  return (
    <Flex
      align="start"
      gap={3}
      border="1px solid"
      borderColor={status.color}
      borderRadius="rounded"
      bg={status.surface}
      p={4}
      role="status"
    >
      {busy ? (
        <Spinner size="sm" mt={0.5} color={status.color} />
      ) : (
        <Icon as={status.icon} mt={0.5} color={status.color} />
      )}
      <Box flex={1}>
        <Text
          fontFamily="heading"
          fontSize="body.sm"
          fontWeight="semibold"
          color="content.primary"
        >
          {status.title}
        </Text>
        <Text
          mt={1}
          fontSize="label.sm"
          lineHeight="20px"
          color="content.secondary"
        >
          {status.description}
        </Text>
        <Button mt={3} size="xs" variant="outline" onClick={onOpenContext}>
          <Icon as={status.actionIcon} />
          {status.actionLabel}
        </Button>
      </Box>
    </Flex>
  );
}

const assistantMarkdownComponents = createChatMarkdownComponents({
  paragraph: {
    fontSize: "body.sm",
    lineHeight: "22px",
    color: "content.primary",
  },
  h1: {
    fontSize: "title.md",
    lineHeight: "24px",
    color: "content.primary",
  },
  h2: {
    fontSize: "body.md",
    lineHeight: "22px",
    color: "content.primary",
  },
  h3: {
    fontSize: "body.sm",
    lineHeight: "22px",
    color: "content.primary",
  },
  list: {
    lineHeight: "22px",
    color: "content.primary",
  },
  inlineColor: "content.primary",
  code: {
    bg: "background.neutral",
    fontSize: "label.sm",
    color: "content.primary",
  },
  pre: {
    bg: "background.neutral",
    borderRadius: "rounded",
    fontSize: "label.sm",
  },
  table: {
    fontSize: "label.sm",
    headBg: "background.neutral",
    color: "content.primary",
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

interface UserMessageTextProps {
  lng: string;
  text: string;
  /** The gap request templates, rendered with GAP_ANSWER_SLOTS. */
  gapTemplates: readonly string[];
}

/**
 * A user message as sent. A gap-form request shows the answers the user gave;
 * the instruction around them, which Clima still receives, sits behind a toggle.
 */
function UserMessageText({ lng, text, gapTemplates }: UserMessageTextProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [showRequest, setShowRequest] = useState(false);
  const requestId = useId();
  const gapAnswer = readGapAnswerMessage(text, gapTemplates);

  if (!gapAnswer) {
    return (
      <Text
        fontSize="body.sm"
        lineHeight="22px"
        color="content.primary"
        whiteSpace="pre-wrap"
      >
        {text}
      </Text>
    );
  }

  return (
    <Box data-testid="concept-note-gap-answer-message">
      <Text fontSize="label.sm" color="content.tertiary" lineClamp={2}>
        {t("gap-answer-message-heading", {
          chapter: gapAnswer.chapter,
          question: gapAnswer.question,
          interpolation: { escapeValue: false },
        })}
      </Text>
      <Text
        mt={1}
        fontSize="body.sm"
        lineHeight="22px"
        color="content.primary"
        whiteSpace="pre-wrap"
        overflowWrap="anywhere"
      >
        {gapAnswer.answer}
      </Text>
      <chakra.button
        type="button"
        mt={1}
        fontSize="label.sm"
        fontWeight="semibold"
        color="content.link"
        aria-expanded={showRequest}
        aria-controls={requestId}
        onClick={() => setShowRequest((value) => !value)}
      >
        {t(
          showRequest
            ? "gap-answer-message-hide-request"
            : "gap-answer-message-show-request",
        )}
      </chakra.button>
      <Text
        id={requestId}
        hidden={!showRequest}
        mt={2}
        fontSize="label.sm"
        color="content.secondary"
        whiteSpace="pre-wrap"
        overflowWrap="anywhere"
      >
        {text}
      </Text>
    </Box>
  );
}

/**
 * Scroll offset for the chat column that keeps the newest reply in view.
 * Follows the bottom while the reply fits. When the reply is taller than the
 * chat area, stops at the reply's first element so its start is visible.
 */
function latestScrollTop(
  chatScroll: HTMLElement,
  replyId: string | null,
): number {
  const bottom = chatScroll.scrollHeight - chatScroll.clientHeight;
  const reply = replyId
    ? chatScroll.querySelector<HTMLElement>(
        `[data-chat-message="${CSS.escape(replyId)}"]`,
      )
    : null;
  if (!reply) return bottom;

  // Offset of the reply inside the scrollable content, independent of the current scroll.
  const startOffset =
    reply.getBoundingClientRect().top -
    chatScroll.getBoundingClientRect().top +
    chatScroll.scrollTop;
  // 16px matches the container padding (p={4}), so the reply's top edge is not clipped.
  return Math.max(0, Math.min(bottom, startOffset - 16));
}

export function ConceptNoteChatPanel({
  cityId,
  contextStatus,
  contextBuildId = null,
  contextChanges = [],
  composerRequest,
  gapAnswer,
  onCloseGap,
  onAddGapSource,
  uploads,
  draftOverviewPending,
  lng,
  onOpenContext,
  runId,
  threadId,
  editScope,
  edits,
  draft = null,
  draftStartedAt = null,
  draftCompletedAt = null,
  welcomeStage = null,
  onOpenDraft,
  onOpenFundingSetup,
  onDraftOverviewComplete,
  onGapAnswersSaved,
  onRefreshDraft,
}: ConceptNoteChatPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const draftThreadKey = `${runId}:${threadId ?? ""}`;
  const [composerDrafts, setComposerDrafts] = useState<Record<string, string>>(
    {},
  );
  const [choiceDrafts, setChoiceDrafts] = useState<
    Record<string, Record<string, string>>
  >({});
  const input = composerDrafts[draftThreadKey] ?? "";
  const inlineDrafts = choiceDrafts[draftThreadKey] ?? {};
  const setInput = useCallback(
    (value: string | ((current: string) => string)) => {
      setComposerDrafts((current) => ({
        ...current,
        [draftThreadKey]:
          typeof value === "function"
            ? value(current[draftThreadKey] ?? "")
            : value,
      }));
    },
    [draftThreadKey],
  );
  function setChoiceDraft(questionId: string, value: string) {
    setChoiceDrafts((current) => ({
      ...current,
      [draftThreadKey]: { ...current[draftThreadKey], [questionId]: value },
    }));
  }
  // Chapter whose gap answers were just saved without a chat turn.
  const [savedGapChapter, setSavedGapChapter] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const appliedComposerRequestRef = useRef<string | null>(null);
  const { formRef, onKeyDown: submitOnEnter } = useEnterSubmit();
  const chatThreads = useConceptNoteChatThreads({
    cityId,
    lng,
    runId,
    threadId,
  });
  const {
    connection,
    error: chatError,
    replyStatus,
    canRetry,
    overviewFailed,
    historyLoading,
    isGenerating,
    reasoning,
    progress,
    messages,
    sendMessage: sendChatMessage,
    requestDraftOverview,
    retry,
  } = useConceptNoteChat({
    lng,
    runId,
    threadId,
    editScope,
    onProposal: edits.loadProposal,
    onDraftOverviewComplete,
    onObservedReplyEnd: () => {
      void edits.refresh();
      onDraftOverviewComplete?.();
    },
    // The chat list then shows the newer chat and offers a way back to it.
    onThreadInactive: chatThreads.refresh,
  });
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const latestQuestionRef = useRef<HTMLDivElement | null>(null);
  const followLatestRef = useRef(true);
  // Clima's newest reply, where a tall reply's scroll stops (see latestScrollTop).
  const latestReplyIdRef = useRef<string | null>(null);
  const initiallyScrolledThreadRef = useRef<string | null>(null);
  const contextState = contextStatus.state;
  const hasUploadedEvidence = contextState === "ready";
  const contextBlocked = contextStatus.blocked;
  // A pending chat switch has not made this chat active on the server yet.
  const chatDisabled =
    contextBlocked ||
    !threadId ||
    historyLoading ||
    isGenerating ||
    Boolean(replyStatus) ||
    chatThreads.busy;
  // The gap form replaces the chat notices that explain a held send, so it
  // gets the reason itself, from the same conditions as chatDisabled.
  const gapDisabledReason = !threadId
    ? t("chat-unavailable")
    : contextBlocked
      ? t(
          contextState === "failed"
            ? "gap-preview-disabled-context-failed"
            : "gap-preview-disabled-context",
        )
      : historyLoading || chatThreads.busy
        ? t("gap-preview-disabled-loading")
        : isGenerating || replyStatus
          ? t("gap-preview-disabled-replying")
          : undefined;
  // Switching chats mid-turn or mid-drafting would strand the reply.
  const threadSwitchDisabled =
    historyLoading || isGenerating || draft?.status === "running";
  // Typing stays open while context is processing or Clima responds.
  // Only submission waits for context readiness and the current turn.
  const composerDisabled = !threadId;
  // Every CNB message becomes an edit request, which the service caps.
  const composerOverLimit = input.trim().length - EDIT_INSTRUCTION_MAX_CHARS;
  // An unsent answer is shown but not saved; the card it answered stays open.
  const latestMessage = messages.findLast((message) => !message.unsent);
  const activeQuestionId = latestMessage?.choices
    ? (latestMessage.questionMessageId ?? latestMessage.id)
    : undefined;
  const recoverableDrafts = Object.entries(inlineDrafts).filter(
    ([questionId, draft]) => draft.trim() && questionId !== activeQuestionId,
  );
  const requestedOverviewThreadRef = useRef<string | null>(null);

  const scrollToLatest = useCallback(() => {
    const scroll = chatScrollRef.current;
    if (!scroll) return;
    const question = latestQuestionRef.current;
    // A tall card opens at its question and first answers, not at the top of a
    // long summary or at the last answer option.
    const choices = question?.querySelector(
      '[data-testid="concept-note-chat-choices"]',
    );
    const anchor = choices?.previousElementSibling ?? choices ?? question;
    const top =
      question && anchor && question.offsetHeight > scroll.clientHeight - 24
        ? scroll.scrollTop +
          anchor.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top -
          12
        : latestScrollTop(scroll, latestReplyIdRef.current);
    scroll.scrollTo({ behavior: "auto", top: Math.max(0, top) });
  }, []);

  // Ask Clima once for the drafting overview; the service claims it per build.
  useEffect(() => {
    if (!draftOverviewPending) {
      requestedOverviewThreadRef.current = null;
      return;
    }
    if (chatDisabled || requestedOverviewThreadRef.current === threadId) {
      return;
    }
    requestedOverviewThreadRef.current = threadId;
    void requestDraftOverview();
  }, [chatDisabled, draftOverviewPending, requestDraftOverview, threadId]);

  const newestMessage = messages.at(-1);
  const latestReplyId =
    newestMessage?.role === "assistant" ? newestMessage.id : null;
  useEffect(() => {
    latestReplyIdRef.current = latestReplyId;
  }, [latestReplyId]);

  useEffect(() => {
    if (
      gapAnswer ||
      !threadId ||
      historyLoading ||
      messages.length === 0 ||
      (initiallyScrolledThreadRef.current === threadId &&
        !followLatestRef.current)
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const chatScroll = chatScrollRef.current;
      if (!chatScroll) {
        return;
      }
      // Stopping at a tall reply's start also clears followLatestRef through onScroll,
      // because the view ends more than 48px above the bottom. Later growth of that reply
      // then no longer pulls the view down; sending a new message sets followLatestRef again.
      scrollToLatest();
      initiallyScrolledThreadRef.current = threadId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    gapAnswer,
    historyLoading,
    messages,
    reasoning,
    threadId,
    scrollToLatest,
  ]);

  // Visuals resize after they load; keep the newest reply in view if the user follows it.
  const keepLatestInView = useCallback(() => {
    const chatScroll = chatScrollRef.current;
    if (chatScroll && followLatestRef.current) {
      scrollToLatest();
    }
  }, [scrollToLatest]);

  // Narrow layouts load history while the chat pane is hidden (zero height),
  // so scroll again once the user opens Clima.
  useEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (!chatScroll || typeof ResizeObserver === "undefined") return;
    let visible = chatScroll.clientHeight > 0;
    const observer = new ResizeObserver(() => {
      const nowVisible = chatScroll.clientHeight > 0;
      if (nowVisible && !visible) keepLatestInView();
      visible = nowVisible;
    });
    observer.observe(chatScroll);
    return () => observer.disconnect();
  }, [keepLatestInView]);

  useEffect(() => {
    if (
      !composerRequest ||
      appliedComposerRequestRef.current === composerRequest.id
    ) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      appliedComposerRequestRef.current = composerRequest.id;
      setInput(composerRequest.content);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [composerRequest, setInput]);

  // Grow the composer with its content, then scroll past the max height.
  useLayoutEffect(() => {
    const composer = inputRef.current;
    if (!composer) {
      return;
    }
    composer.style.height = "auto";
    const height = Math.min(composer.scrollHeight, COMPOSER_MAX_HEIGHT_PX);
    composer.style.height = `${height}px`;
    composer.style.overflowY =
      composer.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? "auto" : "hidden";
    // The composer remounts when a gap form closes.
  }, [input, gapAnswer]);

  // Closing the gap form (back, save for later, Escape or a send) remounts the
  // composer; focus it so keyboard focus does not fall back to the page.
  const gapOpenRef = useRef(false);
  useEffect(() => {
    if (gapOpenRef.current && !gapAnswer) inputRef.current?.focus();
    gapOpenRef.current = Boolean(gapAnswer);
  }, [gapAnswer]);

  // The gap form's sticky footer covers the bottom of the scroll area. Scroll
  // padding of its height (plus GAP_FOOTER_FOCUS_SLACK_PX) makes the browser
  // scroll keyboard focus above it.
  const [gapFooterHeight, setGapFooterHeight] = useState(0);
  useEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (!gapAnswer || !chatScroll) return;
    let element = chatScroll.querySelector<HTMLElement>(
      '[data-testid="concept-note-gap-preview"]',
    );
    while (
      element &&
      element !== chatScroll &&
      getComputedStyle(element).position !== "sticky"
    ) {
      element = element.parentElement;
    }
    const footer = element !== chatScroll ? element : null;
    if (!footer) return;
    const observer = new ResizeObserver(() =>
      setGapFooterHeight(footer.offsetHeight),
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, [gapAnswer]);

  async function submitMessage(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const content = input.trim();
    if (chatDisabled || !content || composerOverLimit > 0) {
      return;
    }
    // Restore into the chat it was written for, even if the user moved on.
    const sentFromKey = draftThreadKey;
    setInput("");
    followLatestRef.current = true;
    if ((await sendChatMessage(content)) !== "not_saved") return;
    // Nothing was saved, so nothing is resent: the text returns to the composer
    // and stays apart from anything typed since.
    setComposerDrafts((current) => {
      const typed = (current[sentFromKey] ?? "").trim();
      return {
        ...current,
        [sentFromKey]:
          typed && typed !== content ? `${content}\n\n${typed}` : content,
      };
    });
  }

  /** Saved answers wait on the gap; the chat says so instead of starting a turn. */
  function gapAnswersSaved(answers: string): void {
    onGapAnswersSaved?.();
    if (!gapAnswer || !answers) return;
    setSavedGapChapter(gapAnswer.chapterTitle);
    onCloseGap();
  }

  /** Returns false, keeping the gap open, when the request exceeds the edit limit. */
  function answerGap(answer: string, complete: boolean): boolean {
    if (!gapAnswer || chatDisabled) return false;
    // An estimate has no marker left: a complete answer confirms its value.
    const confirmsEstimate = complete && gapAnswer.row.gap?.state === "caveat";
    // One neutral request for an open gap: Clima's coverage review decides what
    // the answer closes, so the request states no completeness.
    const content = t(
      confirmsEstimate
        ? "gap-answer-estimate-confirm-request"
        : "gap-answer-request",
      {
        chapter: gapAnswer.chapterTitle,
        question: requestQuestion(gapAnswer.row.question),
        answer,
        interpolation: { escapeValue: false },
      },
    );
    if (content.length > EDIT_INSTRUCTION_MAX_CHARS) return false;
    const { gap } = gapAnswer.row;
    const scope: EditScope = {
      kind: "auto",
      focused_chapter_id: gapAnswer.chapterId,
      ...(gap && {
        gap_id: gap.gap_id,
        gap_version: gap.version,
        answer_complete: complete,
      }),
    };
    onCloseGap();
    onOpenDraft?.();
    followLatestRef.current = true;
    void sendChatMessage(content, scope);
    return true;
  }

  // Answers share the edit request limit with the request text that wraps them.
  const gapAnswerLimit = gapAnswer
    ? EDIT_INSTRUCTION_MAX_CHARS -
      Math.max(
        ...GAP_ANSWER_REQUEST_KEYS.map(
          (key) =>
            t(key, {
              chapter: gapAnswer.chapterTitle,
              question: requestQuestion(gapAnswer.row.question),
              answer: "",
              interpolation: { escapeValue: false },
            }).length,
        ),
      )
    : 0;
  // Sent gap requests are shown as the user's answers (UserMessageText).
  const gapTemplates = useMemo(
    () =>
      GAP_ANSWER_REQUEST_KEYS.map((key) =>
        t(key, { ...GAP_ANSWER_SLOTS, interpolation: { escapeValue: false } }),
      ),
    [t],
  );

  return (
    <VStack
      align="stretch"
      gap={0}
      h="full"
      minH={0}
      overflow="hidden"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      boxShadow="1dp"
    >
      <Flex
        align="center"
        // Tighter spacing on phones keeps the "Clima" title whole beside the status and switcher.
        gap={{ base: 2, sm: 3 }}
        borderBottom="1px solid"
        borderColor="border.neutral"
        px={{ base: 3, sm: 4 }}
        py={3}
      >
        <Flex
          boxSize="44px"
          align="center"
          justify="center"
          borderRadius="full"
          bg="sentiment.positiveDefault"
          color="base.light"
        >
          <Icon as={BsStars} boxSize={6} />
        </Flex>
        <Box flex={1} minW={0}>
          <Text
            fontFamily="heading"
            fontSize="18px"
            fontWeight="semibold"
            color="content.primary"
            truncate
          >
            {t("clima")}
          </Text>
          {/* One line, so the header keeps its height as the badge label changes. */}
          <Text fontSize="label.sm" color="content.tertiary" truncate>
            {t("concept-note-copilot")}
          </Text>
        </Box>
        <HStack
          gap={1.5}
          flexShrink={0}
          whiteSpace="nowrap"
          color={CONNECTION_BADGE[connection].color}
          role="status"
          aria-live="polite"
          data-testid="concept-note-connection-status"
          data-state={connection}
        >
          {connection === "connecting" || connection === "retrying" ? (
            <Spinner size="xs" boxSize="9px" borderWidth="1.5px" />
          ) : (
            <Box
              boxSize="7px"
              borderRadius="full"
              bg={CONNECTION_BADGE[connection].color}
            />
          )}
          {/* The side-by-side chat column is too narrow for the label until xl;
              the dot stays and screen readers still hear the status. */}
          <Text fontSize="label.sm" srOnly={{ md: true, xl: false }}>
            {t(CONNECTION_BADGE[connection].label)}
          </Text>
        </HStack>
        <ChatThreadSwitcher
          controller={chatThreads}
          disabled={threadSwitchDisabled}
          lng={lng}
          threadId={threadId}
        />
      </Flex>

      {/* Announce a finished question once; streaming text is not announced. */}
      <VisuallyHidden
        role="status"
        aria-live="polite"
        data-testid="concept-note-chat-question-announcement"
      >
        {!isGenerating && latestMessage?.choices
          ? t("chat-choices-arrived", { count: latestMessage.choices.length })
          : ""}
      </VisuallyHidden>

      <VStack
        ref={chatScrollRef}
        onScroll={(event) => {
          if (gapAnswer) return;
          const scroll = event.currentTarget;
          followLatestRef.current =
            scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 48;
        }}
        data-testid="concept-note-chat-scroll"
        align="stretch"
        gap={4}
        flex={1}
        minH={0}
        overflowY="auto"
        scrollPaddingBottom={
          gapAnswer
            ? `${gapFooterHeight + GAP_FOOTER_FOCUS_SLACK_PX}px`
            : undefined
        }
        bg="base.light"
        p={4}
      >
        {gapAnswer ? (
          <GapAnswerForm
            key={`${runId}:${lng}:${gapAnswer.chapterId}:${gapAnswer.row.id}:${gapAnswer.row.question}:${gapAnswer.row.gap?.version}`}
            runId={runId}
            request={gapAnswer}
            lng={lng}
            disabled={chatDisabled}
            disabledReason={gapDisabledReason}
            answerLimit={gapAnswerLimit}
            onAnswer={answerGap}
            onSaved={gapAnswersSaved}
            onRefreshDraft={onRefreshDraft}
            onClose={onCloseGap}
            onAddSource={onAddGapSource}
            uploads={uploads}
          />
        ) : (
          <>
            <OlderChatNotice
              controller={chatThreads}
              disabled={threadSwitchDisabled}
              lng={lng}
            />
            <ContextStatusNotice
              key={contextState}
              busy={contextBlocked && contextState !== "failed"}
              autoDismissAfterMs={
                hasUploadedEvidence
                  ? CONTEXT_READY_NOTICE_DURATION_MS
                  : undefined
              }
              onOpenContext={onOpenContext}
              status={contextStatus}
            />
            {!contextBlocked && (
              <ContextChangesNotice
                buildId={contextBuildId}
                changes={contextChanges}
                lng={lng}
                onOpenContext={onOpenContext}
                runId={runId}
              />
            )}

            {welcomeStage &&
              threadId &&
              !historyLoading &&
              messages.length === 0 &&
              draft?.status !== "running" && (
                <ChatWelcome
                  lng={lng}
                  stage={welcomeStage}
                  onOpenDraft={onOpenDraft}
                  onOpenFundingSetup={onOpenFundingSetup}
                />
              )}

            {messages.map((message, messageIndex) => (
              <Fragment key={message.id}>
                {message.role === "assistant" &&
                  message.id === messages.at(-1)?.id && (
                    <ChatProgress
                      lng={lng}
                      reasoning={reasoning}
                      progress={progress}
                      isGenerating={isGenerating}
                    />
                  )}
                {(message.text ||
                  message.choices ||
                  message.role === "user") && (
                  <Box
                    data-chat-message={message.id}
                    ref={
                      message.choices && message.id === latestMessage?.id
                        ? latestQuestionRef
                        : undefined
                    }
                    data-testid={
                      message.choices ? "concept-note-chat-question" : undefined
                    }
                    alignSelf={message.role === "user" ? "end" : "start"}
                    maxW="92%"
                    border={message.choices ? "none" : "1px solid"}
                    borderColor="border.neutral"
                    borderRadius="rounded"
                    bg={
                      message.choices || message.role === "user"
                        ? "background.neutral"
                        : "base.light"
                    }
                    px={3}
                    py={2.5}
                  >
                    {message.role === "assistant" && message.text ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={assistantMarkdownComponents}
                      >
                        {message.text}
                      </ReactMarkdown>
                    ) : message.role === "user" ? (
                      <>
                        <UserMessageText
                          lng={lng}
                          text={message.text}
                          gapTemplates={gapTemplates}
                        />
                        {message.unsent && (
                          <HStack
                            gap={1}
                            mt={1}
                            justify="end"
                            color="sentiment.negativeDefault"
                            data-testid="concept-note-chat-unsent"
                          >
                            <Icon as={LuCircleAlert} boxSize={3.5} />
                            <Text fontSize="label.sm">
                              {t("chat-message-unsent")}
                            </Text>
                          </HStack>
                        )}
                      </>
                    ) : null}
                    {message.role === "assistant" && message.choices && (
                      <ChatChoices
                        choices={message.choices}
                        choiceAction={message.choiceAction}
                        lng={lng}
                        disabled={chatDisabled || !message.questionMessageId}
                        answered={messages
                          .slice(messageIndex + 1)
                          .some((later) => !later.unsent)}
                        draft={
                          inlineDrafts[
                            message.questionMessageId ?? message.id
                          ] ?? ""
                        }
                        onDraftChange={(value) =>
                          setChoiceDraft(
                            message.questionMessageId ?? message.id,
                            value,
                          )
                        }
                        selectedAnswer={
                          messages[messageIndex + 1]?.role === "user" &&
                          !messages[messageIndex + 1].unsent
                            ? messages[messageIndex + 1].text
                            : undefined
                        }
                        onReply={async (answer) => {
                          if (chatDisabled || !message.questionMessageId)
                            return false;
                          followLatestRef.current = true;
                          // Picking an option keeps text typed in the card's own
                          // field: it moves to the message box.
                          const questionKey = message.questionMessageId;
                          const cardDraft = (
                            inlineDrafts[questionKey] ?? ""
                          ).trim();
                          if (cardDraft && cardDraft !== answer.trim()) {
                            setInput((current) =>
                              current.trim()
                                ? `${current}\n\n${cardDraft}`
                                : cardDraft,
                            );
                            setChoiceDraft(questionKey, "");
                          }
                          // The answer controls lock or unmount while Clima replies,
                          // so keep keyboard focus in the composer from the start.
                          const active = document.activeElement;
                          if (
                            active === document.body ||
                            active?.closest(
                              '[data-testid="concept-note-chat-choices"]',
                            )
                          ) {
                            inputRef.current?.focus({ preventScroll: true });
                          }
                          return (
                            (await sendChatMessage(
                              answer,
                              undefined,
                              message.questionMessageId,
                            )) === "replied"
                          );
                        }}
                      />
                    )}
                  </Box>
                )}
                {/* Each visual wrapper carries the reply's start marker; flexShrink={0} keeps the flex column from collapsing it. */}
                {message.visuals?.map((visual, index) => (
                  <Box
                    key={index}
                    data-chat-message={message.id}
                    flexShrink={0}
                  >
                    <ChatVisualFrame
                      html={visual.html}
                      lng={lng}
                      onHeightChange={keepLatestInView}
                      title={visual.title}
                    />
                  </Box>
                ))}
              </Fragment>
            ))}

            {savedGapChapter && (
              <HStack
                role="status"
                align="start"
                justify="space-between"
                gap={2}
                px={3}
                py={2.5}
                border="1px solid"
                borderColor="border.neutral"
                borderRadius="rounded"
                bg="background.neutral"
                data-testid="concept-note-gap-saved-note"
              >
                <Text fontSize="body.sm" lineHeight="22px">
                  {t("gap-answers-saved-note", {
                    chapter: savedGapChapter,
                    interpolation: { escapeValue: false },
                  })}
                </Text>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  flexShrink={0}
                  onClick={() => setSavedGapChapter(null)}
                >
                  {t("gap-answers-saved-dismiss")}
                </Button>
              </HStack>
            )}

            {draft && (
              <DraftingProgressCard
                draft={draft}
                lng={lng}
                startedAt={draftStartedAt}
                completedAt={draftCompletedAt}
                summaryFailed={overviewFailed && !isGenerating}
              />
            )}

            {edits.error && (
              <Text role="alert" fontSize="label.sm" color="content.primary">
                {t(
                  edits.error === "stale_base"
                    ? "edit-stale-hint"
                    : "edit-request-error",
                )}
              </Text>
            )}
            {edits.error && (
              <Button
                size="xs"
                minH="36px"
                variant="outline"
                data-testid="concept-note-edit-refresh"
                onClick={() => void edits.refresh()}
              >
                {t("edit-refresh")}
              </Button>
            )}
            {chatError && (
              <HStack
                role="alert"
                align="start"
                gap={2}
                color="sentiment.negativeDefault"
                data-testid="concept-note-chat-error"
              >
                <Icon as={LuCircleAlert} mt={0.5} />
                <Text fontSize="label.sm" flex={1}>
                  {chatError}
                </Text>
                {canRetry && (
                  <Button
                    size="xs"
                    variant="outline"
                    flexShrink={0}
                    data-testid="concept-note-chat-retry"
                    onClick={() => void retry()}
                  >
                    <Icon as={LuRotateCw} boxSize={3.5} />
                    {t("chat-retry")}
                  </Button>
                )}
              </HStack>
            )}
          </>
        )}
        {replyStatus && (
          <Text role="status" fontSize="label.sm" color="content.secondary">
            {replyStatus}
          </Text>
        )}
      </VStack>

      {/* The gap form has its own submit, so the chat box would be a second one. */}
      {!gapAnswer && (
        <chakra.form
          ref={formRef}
          borderTop="1px solid"
          borderColor="border.neutral"
          p={4}
          flexShrink={0}
          onSubmit={submitMessage}
        >
          {recoverableDrafts.length > 0 && (
            <Box maxH="30vh" overflowY="auto" mb={3}>
              {recoverableDrafts.map(([questionId, draft]) => (
                <Box
                  key={questionId}
                  data-testid="concept-note-saved-answer-draft"
                  mb={3}
                  p={3}
                  borderWidth="1px"
                  borderColor="border.neutral"
                  borderRadius="rounded"
                >
                  <Text fontSize="label.sm" fontWeight="semibold">
                    {t("chat-choices-saved-draft")}
                  </Text>
                  <Text
                    fontSize="body.sm"
                    whiteSpace="pre-wrap"
                    overflowWrap="anywhere"
                    maxH="80px"
                    overflowY="auto"
                    tabIndex={0}
                  >
                    {draft}
                  </Text>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    mt={2}
                    disabled={chatDisabled}
                    onClick={() => {
                      setInput((current) =>
                        current ? `${current}\n\n${draft}` : draft,
                      );
                      setChoiceDraft(questionId, "");
                      inputRef.current?.focus();
                    }}
                  >
                    {t("chat-choices-use-draft")}
                  </Button>
                </Box>
              ))}
            </Box>
          )}
          <Flex align="flex-end" gap={3}>
            <Textarea
              data-testid="concept-note-chat-input"
              aria-label={t("chat-input-placeholder")}
              ref={inputRef}
              value={input}
              rows={1}
              resize="none"
              disabled={composerDisabled}
              aria-describedby={
                [
                  contextBlocked && "concept-note-chat-blocked",
                  composerOverLimit > 0 && "concept-note-chat-too-long",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              placeholder={
                threadId ? t("chat-input-placeholder") : t("chat-unavailable")
              }
              bg="base.light"
              borderColor="border.neutral"
              minH="52px"
              minW={0}
              flex={1}
              py="15px"
              fontSize="14px"
              lineHeight="20px"
              borderRadius="rounded"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={submitOnEnter}
            />
            <Button
              type="submit"
              data-testid="concept-note-chat-send"
              boxSize="48px"
              minW="48px"
              flexShrink={0}
              bg="interactive.primary"
              _hover={{
                bg: "interactive.primary",
                color: "base.light",
                opacity: 0.9,
              }}
              _disabled={{
                bg: "interactive.primary",
                color: "base.light",
                opacity: 1,
                cursor: "not-allowed",
                _hover: {
                  bg: "interactive.primary",
                  color: "base.light",
                  opacity: 1,
                },
              }}
              p={0}
              disabled={
                chatDisabled ||
                composerDisabled ||
                !input.trim() ||
                composerOverLimit > 0
              }
              loading={isGenerating}
              size="xs"
              variant="solid"
              aria-label={t("send-message")}
            >
              <Icon as={LuArrowUp} boxSize={5} />
            </Button>
          </Flex>
          {composerOverLimit > 0 && (
            <Text
              id="concept-note-chat-too-long"
              role="alert"
              mt={2}
              fontSize="label.sm"
              color="sentiment.negativeDefault"
            >
              {t("chat-message-too-long", { count: composerOverLimit })}
            </Text>
          )}
          {contextBlocked && (
            <Text
              id="concept-note-chat-blocked"
              mt={2}
              fontSize="label.sm"
              color="content.secondary"
            >
              {contextState === "failed"
                ? t("chat-context-failed-help")
                : t("chat-waiting-for-context-help")}
            </Text>
          )}
          {!threadId && (
            <Text mt={2} fontSize="label.sm" color="content.tertiary">
              {t("chat-thread-unavailable")}
            </Text>
          )}
        </chakra.form>
      )}
    </VStack>
  );
}
