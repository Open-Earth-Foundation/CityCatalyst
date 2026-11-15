"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  Box,
  Flex,
  Heading,
  HStack,
  Icon,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { motion, useReducedMotion } from "framer-motion";
import NextLink from "next/link";
import {
  LuArrowLeft,
  LuLayoutDashboard,
  LuListTodo,
  LuFileText,
  LuLandmark,
  LuLayers3,
  LuMessageSquare,
  LuRefreshCw,
  LuShieldCheck,
} from "react-icons/lu";

import { ReviewButton as Button } from "./review-button";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogCloseTrigger,
  DialogBody,
} from "@/components/ui/dialog";
import styles from "./workspace.module.css";

import { documentWorkspaceApi } from "@/services/document-workspace-api";
import { DocumentPointCard } from "./document-point-card";
import { type ChapterGapRow } from "./chapter-gaps-panel";
import { WorkspaceOverview, WorkspaceTodos } from "./document-workspace-panels";
import { WorkspaceSources } from "./workspace-source-picker";
import { WorkspaceExport } from "./workspace-export";
import { getChatWelcomeStage } from "./chat-welcome";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { hasIncompleteInitialUploads } from "@/util/concept-note-initial-uploads";
import { NewConceptNoteDialog } from "../ConceptNoteDashboard/new-concept-note-dialog";
import type { EditScope } from "@/util/concept-note-edit-types";
import { isChapterValidationCurrent } from "./chapter-validation";
import type { ConceptNoteDraftChapter } from "@/util/types";

import {
  getConceptNoteStatusPresentation,
  getWorkflowStepTranslationKey,
} from "@/components/ConceptNoteDashboard/utils";
import { StatusBadge } from "@/components/ConceptNoteDashboard/status-badge";
import { ConceptNoteChatPanel } from "@/components/ConceptNoteWorkspace/chat-panel";
import type { GapAnswerRequest } from "@/components/ConceptNoteWorkspace/gap-answer-form";
import { NextStepBanner } from "@/components/ConceptNoteWorkspace/next-step-banner";
import { ContextTab } from "@/components/ConceptNoteWorkspace/context-tab";
import { FundingSelectionDialog } from "@/components/ConceptNoteWorkspace/funding-selection-dialog";
import { DraftTab } from "@/components/ConceptNoteWorkspace/draft-tab";
import { ExportDialog } from "@/components/ConceptNoteWorkspace/export-dialog";
import { ReviewButton } from "@/components/ConceptNoteWorkspace/review-button";
import { StructureTab } from "@/components/ConceptNoteWorkspace/structure-tab";
import { useConceptNoteEdits } from "@/components/ConceptNoteWorkspace/use-concept-note-edits";
import {
  DocumentReviewToolbar,
  DocumentReviewFeedback,
  documentReviewChanges,
  editFeedbackKey,
  selectReviewProposal,
} from "@/components/ConceptNoteWorkspace/document-review";
import { useInlineReviewDecisions } from "@/components/ConceptNoteWorkspace/use-inline-review-decisions";
import { useConceptNoteWorkspaceData } from "@/components/ConceptNoteWorkspace/use-concept-note-workspace-data";
import { useFunderImport } from "@/components/ConceptNoteWorkspace/use-funder-import";
import {
  WorkspaceLoadingState,
  WorkspaceUnavailableState,
} from "@/components/ConceptNoteWorkspace/workspace-states";

type WorkspaceTab = "overview" | "todo" | "draft" | "structure" | "context";

interface ConceptNoteWorkspaceProps {
  cityId: string;
  initialReviewChapterId?: string;
  initialReviewFindingKey?: string;
  initialUploadId?: string;
  lng: string;
  runId: string;
}

const workspaceTabs: Array<{
  icon: typeof LuFileText;
  key: WorkspaceTab;
  translationKey: string;
}> = [
  {
    key: "overview",
    translationKey: "workspace-overview-tab",
    icon: LuLayoutDashboard,
  },
  { key: "context", translationKey: "context-tab", icon: LuRefreshCw },
  { key: "todo", translationKey: "workspace-todo-tab", icon: LuListTodo },
  { key: "structure", translationKey: "structure-tab", icon: LuLayers3 },
  { key: "draft", translationKey: "draft-tab", icon: LuFileText },
];

export function ConceptNoteWorkspace({
  cityId,
  initialReviewChapterId,
  initialReviewFindingKey,
  initialUploadId,
  lng,
  runId,
}: ConceptNoteWorkspaceProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const reducedMotion = useReducedMotion() ?? false;
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const [mobilePane, setMobilePane] = useState<"workspace" | "chat">(
    "workspace",
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>(
    initialReviewChapterId || initialReviewFindingKey ? "draft" : "overview",
  );
  const [gapAnswer, setGapAnswer] = useState<GapAnswerRequest | null>(null);
  const [uploadPickerRequest, setUploadPickerRequest] = useState(0);
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
  const [workspaceInitialized, setWorkspaceInitialized] = useState(false);
  const workspaceQuery = documentWorkspaceApi.useGetDocumentWorkspaceQuery(
    runId,
    {
      refetchOnFocus: true,
      refetchOnReconnect: true,
      pollingInterval: workspaceInitialized ? 5000 : 0,
      skipPollingIfUnfocused: true,
    },
  );
  const workspace = workspaceQuery.data;
  const setupReady = Boolean(workspace?.setup?.ready);
  if (workspaceInitialized !== setupReady) setWorkspaceInitialized(setupReady);
  const refetchWorkspace = workspaceQuery.refetch;
  const [saveSetup, setupState] =
    documentWorkspaceApi.useSaveDocumentSetupMutation();
  const openPoint = useCallback((key: string) => {
    setMobilePane("workspace");
    setSelectedPointKey(key);
    setGapAnswer(null);
    setTab("todo");
  }, []);
  function addPointSource() {
    setMobilePane("workspace");
    setTab("context");
    setUploadPickerRequest((value) => value + 1);
  }
  useEffect(() => {
    function open(event: Event) {
      const detail = (event as CustomEvent<{ runId: string; pointKey: string }>)
        .detail;
      if (detail?.runId === runId && detail.pointKey)
        openPoint(detail.pointKey);
    }
    function changed(event: Event) {
      if ((event as CustomEvent<{ runId: string }>).detail?.runId === runId)
        void refetchWorkspace();
    }
    window.addEventListener("document-workspace:open-point", open);
    window.addEventListener("document-workspace:changed", changed);
    return () => {
      window.removeEventListener("document-workspace:open-point", open);
      window.removeEventListener("document-workspace:changed", changed);
    };
  }, [runId, refetchWorkspace, openPoint]);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [retryInitialUploadOpen, setRetryInitialUploadOpen] = useState(false);
  const [editScope, setEditScope] = useState<EditScope>({
    kind: "auto",
  });
  const [editFocus, setEditFocus] = useState<{
    chapterId: string;
    changeId?: string;
    requestId: string;
    focus: boolean;
  } | null>(null);
  const [workspaceMutationError, setWorkspaceMutationError] = useState<
    string | null
  >(null);
  const [confirmChapterMutation, confirmChapterState] =
    api.useConfirmConceptNoteChapterMutation();
  const [reviewOpen, setReviewOpen] = useState(false);
  // "What next?" guidance: set on funder save, sources ready, drafting complete.
  const [nextStep, setNextStep] = useState<
    "start-drafting" | "choose-funding" | "chat" | null
  >(null);
  const [highlightStartDrafting, setHighlightStartDrafting] = useState(false);
  // Bumped when chat's "Add recommended source" should open the file picker.

  const [composerRequest, setComposerRequest] = useState<{
    content: string;
    id: string;
  } | null>(null);

  const [reviewChapterId, setReviewChapterId] = useState<string | null>(
    initialReviewChapterId ?? null,
  );
  const [reviewFindingKey, setReviewFindingKey] = useState<string | null>(
    initialReviewFindingKey ?? null,
  );
  const {
    applicationContext,
    applicationContextFailed,
    applicationContextLoading,
    bundle,
    canStartDrafting,
    contextStatus,
    city,
    cityDashboard,
    cityDashboardFailed,
    cityDashboardLoading,
    cityName,
    draft,
    draftFailed,
    draftLoading,
    draftProgress,
    draftStartError,
    effectiveUploadError,
    files,
    hasApplicationTemplate,
    inventory,
    inventoryFailed,
    inventoryLoading,
    inventoryOptions,
    inventorySelectionSaving,
    isDraftRunning,
    manualPopulation,
    manualPopulationSaving,
    populationFailed,
    populationLabel,
    populationLoading,
    populationData,
    refetchDraft,
    refetchApplicationContext,
    refetchRun,
    retrySourceUpload,
    retryingUploadId,
    retryBundleState,
    retryContextBundle,
    reviewAvailabilityDescription,
    run,
    runFailed,
    runLoading,
    saveManualPopulation,
    selectInventory,
    startDrafting,
    startDraftState,
    uploads,
    uploadSource,
    uploadState,
  } = useConceptNoteWorkspaceData({ cityId, initialUploadId, lng, runId });
  const sourceStates = uploads
    .map((upload) => `${upload.uploadId}:${upload.status}`)
    .join("|");
  useEffect(() => {
    void refetchWorkspace();
  }, [sourceStates, refetchWorkspace]);
  const updatingPoints = workspace?.points.some(
    (point) => point.freshness === "updating",
  );
  useEffect(() => {
    if (!updatingPoints) return;
    const timer = window.setInterval(() => {
      void refetchDraft();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [updatingPoints, refetchDraft]);
  // Kept here so a funder document keeps converting after the dialog closes.
  const funderImport = useFunderImport({ cityId, runId });
  const templateImport = useFunderImport({ cityId, runId, kind: "template" });
  const edits = useConceptNoteEdits({
    runId,
    observeBackgroundUpdates: Boolean(
      workspace?.points.some(
        (point) =>
          point.freshness === "updating" ||
          point.freshness === "pending_review",
      ),
    ),
    onApplied: async (chapterIds) => {
      await refetchDraft().unwrap();
      if (chapterIds[0]) navigateEdit(chapterIds[0]);
    },
  });
  const workspaceRefreshing = Boolean(
    workspaceQuery.isFetching ||
    workspaceQuery.isError ||
    edits.busy ||
    confirmChapterState.isLoading ||
    startDraftState.isLoading ||
    isDraftRunning,
  );
  const openFundingSetup = async () => {
    if (applicationContext) {
      setFundingOpen(true);
    } else {
      const result = await refetchApplicationContext();
      if (result.isSuccess) setFundingOpen(true);
    }
  };
  const draftHasContent = Boolean(
    draft?.chapters.some((chapter) => Boolean(chapter.body_markdown)),
  );
  // Transition detection during render (React's "derived from previous
  // props" pattern) keeps guidance changes out of effect bodies.
  const sourcesReadyForDrafting =
    contextStatus.state === "ready" &&
    draft?.status === "not_started" &&
    !draftHasContent;
  const [seenSourcesReady, setSeenSourcesReady] = useState(
    sourcesReadyForDrafting,
  );
  if (seenSourcesReady !== sourcesReadyForDrafting) {
    setSeenSourcesReady(sourcesReadyForDrafting);
    if (sourcesReadyForDrafting) {
      setNextStep(canStartDrafting ? "start-drafting" : "choose-funding");
    }
  }

  const draftStatusValue = draft?.status;
  const [seenDraftStatus, setSeenDraftStatus] = useState(draftStatusValue);
  if (seenDraftStatus !== draftStatusValue) {
    setSeenDraftStatus(draftStatusValue);
    if (seenDraftStatus === "running" && draftStatusValue === "complete") {
      setNextStep("chat");
    }
    if (draftStatusValue !== "complete" && nextStep === "chat") {
      setNextStep(null);
    }
    if (draftStatusValue === "running") {
      setHighlightStartDrafting(false);
    }
  }
  // Funding may arrive after source readiness. Resolve that guidance from the
  // current setup without reopening a banner the user already dismissed.
  const visibleNextStep =
    ((nextStep === "start-drafting" || nextStep === "choose-funding") &&
      (isDraftRunning ||
        draftStatusValue === "complete" ||
        draftHasContent ||
        contextStatus.blocked ||
        applicationContextLoading ||
        applicationContextFailed)) ||
    (nextStep === "start-drafting" && !hasApplicationTemplate)
      ? null
      : nextStep === "choose-funding" && canStartDrafting
        ? "start-drafting"
        : nextStep;

  useEffect(() => {
    if (!highlightStartDrafting) return;
    const timer = window.setTimeout(
      () => setHighlightStartDrafting(false),
      6_000,
    );
    return () => window.clearTimeout(timer);
  }, [highlightStartDrafting]);

  const templateChapterCount =
    applicationContext?.template?.chapter_schema.length ?? 0;
  const nextStepBanner =
    visibleNextStep === "start-drafting" ? (
      <NextStepBanner
        title={t("next-step-funding-saved-title")}
        description={t("next-step-funding-saved", {
          count: templateChapterCount,
          template:
            applicationContext?.template?.name ??
            t("drafting-requirement-template"),
        })}
        // The setup panel's highlighted Start drafting stays the only button.
        dismissLabel={t("next-step-dismiss")}
        onDismiss={() => setNextStep(null)}
      />
    ) : visibleNextStep === "choose-funding" ? (
      <NextStepBanner
        title={t("next-step-sources-ready-title")}
        description={t("next-step-sources-ready-funding")}
        primary={{
          label: t("drafting-setup-choose-funding"),
          icon: LuLandmark,
          onClick: () => void openFundingSetup(),
          testId: "concept-note-next-step-funding",
        }}
        dismissLabel={t("next-step-dismiss")}
        onDismiss={() => setNextStep(null)}
      />
    ) : visibleNextStep === "chat" ? (
      <NextStepBanner
        title={t("next-step-draft-complete-title")}
        description={t("next-step-draft-complete")}
        primary={{
          label: t("next-step-ask-clima"),
          icon: LuMessageSquare,
          onClick: () =>
            setComposerRequest({ content: "", id: crypto.randomUUID() }),
          testId: "concept-note-next-step-chat",
        }}
        secondary={{
          label: t("review-and-export"),
          icon: LuShieldCheck,
          onClick: () => {
            setReviewChapterId(null);
            setReviewFindingKey(null);
            setReviewOpen(true);
          },
        }}
        dismissLabel={t("next-step-dismiss")}
        onDismiss={() => setNextStep(null)}
      />
    ) : null;

  const reviewProposal = selectReviewProposal(edits.proposals);
  const {
    decisions: activeReviewDecisions,
    decide: decideInlineChange,
    decideRemaining,
  } = useInlineReviewDecisions(reviewProposal, edits, navigateEdit);
  const reviewChanges = documentReviewChanges(
    reviewProposal,
    draft?.chapters ?? [],
  );
  const activeChangeId = reviewChanges.some(
    (change) => change.change_id === editFocus?.changeId,
  )
    ? editFocus?.changeId
    : reviewChanges[0]?.change_id;

  function openDraftGap(chapter: ConceptNoteDraftChapter, row: ChapterGapRow) {
    const point = workspace?.points.find(
      (item) => item.key === row.gap?.field_key,
    );
    if (point) {
      openPoint(point.key);
      return;
    }
    setTab("draft");
    setReviewChapterId(chapter.chapter_id);
    setReviewFindingKey(null);
    setMobilePane("chat");
    setGapAnswer({
      chapterId: chapter.chapter_id,
      chapterTitle: chapter.title,
      row,
    });
  }
  function navigateEdit(chapterId: string, changeId?: string): void {
    setTab("draft");
    setReviewChapterId(null);
    setReviewFindingKey(null);
    setEditFocus({
      chapterId,
      changeId,
      requestId: crypto.randomUUID(),
      focus: true,
    });
  }

  function viewChanges() {
    setMobilePane("workspace");
    if (reviewChanges[0])
      navigateEdit(reviewChanges[0].chapter_id, reviewChanges[0].change_id);
    else setTab("draft");
  }
  const canReview = reviewAvailabilityDescription === null;

  async function confirmChapter(
    chapter: ConceptNoteDraftChapter,
  ): Promise<void> {
    if (
      !isChapterValidationCurrent(chapter) ||
      chapter.validation?.status !== "ready"
    ) {
      setReviewChapterId(chapter.chapter_id);
      setReviewOpen(true);
      return;
    }
    if (!chapter.revision_number) {
      return;
    }
    setWorkspaceMutationError(null);
    try {
      await confirmChapterMutation({
        runId,
        chapterId: chapter.chapter_id,
        expectedRevision: chapter.revision_number,
        idempotencyKey: crypto.randomUUID(),
      }).unwrap();
    } catch (error) {
      const payload =
        error && typeof error === "object" && "data" in error
          ? error.data
          : null;
      const title =
        payload && typeof payload === "object" && "title" in payload
          ? String(payload.title)
          : "";
      if (/validation is missing or stale/i.test(title)) {
        setReviewChapterId(chapter.chapter_id);
        setReviewOpen(true);
        return;
      }
      setWorkspaceMutationError(t("chapter-confirm-error"));
    }
  }

  if (runLoading) {
    return <WorkspaceLoadingState />;
  }

  if (!run || run.city_id !== cityId) {
    return (
      <WorkspaceUnavailableState
        cityId={cityId}
        lng={lng}
        transientLoadFailure={runFailed && !run}
        onRetry={() => void refetchRun()}
      />
    );
  }

  const status = getConceptNoteStatusPresentation(run.status, draft);
  const incompleteUploads = hasIncompleteInitialUploads(run);
  const statusLabel = t(
    incompleteUploads ? "upload-incomplete" : status.translationKey,
  );
  const workflowLabel = t(getWorkflowStepTranslationKey(run.workflow_step));

  return (
    <Box
      data-testid="concept-note-workspace"
      h="calc(100dvh - 80px)"
      minH={0}
      overflow="clip"
      bg="background.alternativeLight"
    >
      <motion.main
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        style={{ height: "100%" }}
      >
        <VStack
          align="stretch"
          gap={{ base: 2, md: 3 }}
          h="full"
          minH={0}
          maxW="1800px"
          mx="auto"
          px={{ base: 2, md: 5 }}
          py={{ base: 2, md: 4 }}
        >
          <HStack
            flexShrink={0}
            gap={2}
            color="content.tertiary"
            justify="start"
          >
            <NextLink
              aria-label={t("all-concept-notes")}
              href={`/${lng}/cities/${cityId}/concept-notes`}
            >
              <HStack gap={1.5} _hover={{ color: "content.link" }}>
                <Icon as={LuArrowLeft} />
                <Text hideBelow="md" fontSize="label.sm">
                  {t("all-concept-notes")}
                </Text>
              </HStack>
            </NextLink>
            <Text hideBelow="md" fontSize="label.sm">
              /
            </Text>
            <Text
              truncate
              minW={0}
              maxW={{ base: "calc(100vw - 64px)", md: "420px" }}
              fontSize="label.sm"
              color="content.secondary"
            >
              {run.name}
            </Text>
          </HStack>

          <HStack hideFrom="md" gap={2} aria-label={t("workspace-area-label")}>
            <Button
              size="sm"
              variant={mobilePane === "workspace" ? "solid" : "outline"}
              aria-pressed={mobilePane === "workspace"}
              onClick={() => setMobilePane("workspace")}
            >
              {t("workspace-document-area")}
            </Button>
            <Button
              size="sm"
              variant={mobilePane === "chat" ? "solid" : "outline"}
              aria-pressed={mobilePane === "chat"}
              onClick={() => setMobilePane("chat")}
            >
              {t("clima")}
            </Button>
          </HStack>
          {incompleteUploads && (
            <NextStepBanner
              tone="warning"
              title={t("upload-incomplete")}
              description={t("upload-incomplete-message")}
              primary={{
                label: t("retry-upload"),
                icon: LuRefreshCw,
                onClick: () => setRetryInitialUploadOpen(true),
                testId: "concept-note-retry-upload",
              }}
              testId="concept-note-upload-incomplete"
            />
          )}
          {retryInitialUploadOpen && (
            <NewConceptNoteDialog
              key={run.run_id}
              retryRun={run}
              cityId={cityId}
              cityName={cityName}
              lng={lng}
              open
              onOpenChange={setRetryInitialUploadOpen}
            />
          )}
          <Box
            className={styles.panes}
            data-testid="concept-note-workspace-panels"
          >
            <Box
              minH={0}
              minW={0}
              className={
                mobilePane === "workspace" ? styles.mobileHidden : undefined
              }
            >
              <ConceptNoteChatPanel
                cityId={cityId}
                contextStatus={contextStatus}
                contextBuildId={bundle.buildId}
                contextChanges={bundle.contextChanges}
                composerRequest={composerRequest}
                pointWorkspaceReady={workspace?.setup?.ready ?? false}
                pointCard={
                  workspace?.points.find(
                    (point) => point.key === selectedPointKey,
                  ) ? (
                    <DocumentPointCard
                      key={selectedPointKey}
                      point={workspace.points.find(
                        (point) => point.key === selectedPointKey,
                      )!}
                      runId={runId}
                      lng={lng}
                      compact
                      onAddSource={addPointSource}
                      onOpenPoint={() =>
                        selectedPointKey && openPoint(selectedPointKey)
                      }
                      sourceBusy={uploadState.isLoading}
                      onOpenContext={() => {
                        setMobilePane("workspace");
                        setTab("context");
                      }}
                    />
                  ) : undefined
                }
                gapAnswer={gapAnswer}
                onCloseGap={() => setGapAnswer(null)}
                onAddGapSource={() => {
                  setMobilePane("workspace");
                  setTab("context");
                  setUploadPickerRequest((value) => value + 1);
                }}
                draftOverviewPending={Boolean(draft?.overview_pending)}
                onDraftOverviewComplete={() => void refetchDraft()}
                lng={lng}
                onOpenContext={() => {
                  setMobilePane("workspace");
                  setTab("context");
                  if (contextStatus.state === "none") {
                    setUploadPickerRequest((value) => value + 1);
                  }
                }}
                runId={run.run_id}
                threadId={run.thread_id}
                editScope={editScope}
                edits={edits}
                draft={draft ?? null}
                draftStartedAt={draftProgress?.startedAt ?? null}
                draftCompletedAt={draftProgress?.completedAt ?? null}
                welcomeStage={getChatWelcomeStage({
                  draftHasContent,
                  canStartDrafting,
                  workspace,
                })}
                onOpenDraft={() => {
                  setMobilePane("workspace");
                  setTab("draft");
                }}
                onOpenTodos={() => {
                  setMobilePane("workspace");
                  setTab("todo");
                }}
                onOpenFundingSetup={() => void openFundingSetup()}
              />
            </Box>

            <Tabs.Root
              value={tab}
              onValueChange={(details) => setTab(details.value as WorkspaceTab)}
              className={`${styles.document} ${mobilePane === "chat" ? styles.mobileHidden : ""}`}
              h="full"
              minH={0}
              minW={0}
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="base.light"
            >
              <Flex
                data-testid="concept-note-document-header"
                flexShrink={0}
                align="center"
                flexWrap="wrap"
                gap={3}
                px={{ base: 3, md: 4 }}
                py={{ base: 2, md: 3 }}
                borderBottom="1px solid"
                borderColor="border.neutral"
              >
                <HStack hideBelow="md" gap={2} flex="1 1 180px" minW={0}>
                  <Icon
                    as={LuFileText}
                    color="content.link"
                    boxSize={5}
                    flexShrink={0}
                  />
                  <Box minW={0}>
                    <Heading
                      as="h1"
                      fontFamily="heading"
                      fontSize="body.md"
                      fontWeight="semibold"
                      color="content.primary"
                      overflowWrap="anywhere"
                    >
                      {run.name}
                    </Heading>
                    <HStack gap={2} flexWrap="wrap">
                      <Text
                        fontSize="body.sm"
                        color="content.secondary"
                        title={`${cityName} · ${workflowLabel}`}
                      >
                        {t("autosaved")}
                      </Text>
                      <StatusBadge label={statusLabel} tone={status.tone} />
                    </HStack>
                  </Box>
                </HStack>
                <HStack
                  gap={2}
                  flexWrap="wrap"
                  w={{ base: "full", md: "auto" }}
                >
                  <Box hideFrom="md" flex={1}>
                    <StatusBadge label={statusLabel} tone={status.tone} />
                  </Box>
                  {reviewProposal && tab !== "draft" && (
                    <Button size="sm" variant="outline" onClick={viewChanges}>
                      {t("edit-view-changes")}
                    </Button>
                  )}
                  {canReview && (
                    <ReviewButton
                      size={{ base: "xs", md: "sm" }}
                      variant="solid"
                      data-testid="concept-note-review"
                      onClick={() => {
                        setReviewChapterId(null);
                        setReviewFindingKey(null);
                        setReviewOpen(true);
                      }}
                    >
                      <Icon as={LuShieldCheck} />
                      {t("workspace-review-document")}
                    </ReviewButton>
                  )}
                  <ReviewButton
                    size={{ base: "xs", md: "sm" }}
                    variant="outline"
                    data-testid="concept-note-export"
                    aria-label={
                      !draftHasContent
                        ? `${t("workspace-export-menu")}. ${t("workspace-export-needs-draft")}`
                        : undefined
                    }
                    disabled={!workspace || !draftHasContent}
                    title={
                      !draftHasContent
                        ? t("workspace-export-needs-draft")
                        : undefined
                    }
                    onClick={() => setExportOpen(true)}
                  >
                    {t("workspace-export-menu")}
                  </ReviewButton>
                </HStack>
              </Flex>
              <Tabs.List
                css={{
                  scrollbarWidth: "none",
                  "&::-webkit-scrollbar": { display: "none" },
                }}
                flexShrink={0}
                gap={0}
                overflowX="auto"
                flexWrap="nowrap"
                aria-label={t("workspace-tabs-label")}
                borderBottom="1px solid"
                borderColor="border.neutral"
                bg="base.light"
                px={{ base: 1, md: 3 }}
              >
                {workspaceTabs.map((item) => (
                  <Tabs.Trigger
                    key={item.key}
                    value={item.key}
                    display="flex"
                    flexShrink={0}
                    aria-label={t(item.translationKey)}
                    title={t(item.translationKey)}
                    flex={{ base: "1 1 0", md: "0 0 auto" }}
                    minW={0}
                    type="button"
                    alignItems="center"
                    gap={2}
                    borderBottom="2px solid"
                    borderColor="transparent"
                    color="content.tertiary"
                    px={{ base: 1, md: 4 }}
                    py={2.5}
                    fontFamily="heading"
                    fontSize={{ base: "12px", md: "body.sm" }}
                    fontWeight="semibold"
                    _selected={{
                      borderColor: "content.link",
                      color: "content.link",
                    }}
                    _hover={{ color: "content.link" }}
                  >
                    <Icon hideBelow="md" as={item.icon} />
                    <Text
                      as="span"
                      hideBelow={item.key === "draft" ? "md" : undefined}
                    >
                      {t(item.translationKey)}
                    </Text>
                    {item.key === "draft" && (
                      <Text as="span" hideFrom="md">
                        {t("workspace-draft-short")}
                      </Text>
                    )}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <Box
                ref={workspaceScrollRef}
                className={styles.content}
                data-testid="concept-note-workspace-scroll"
              >
                <Tabs.Content value="overview" p={0}>
                  {workspaceQuery.isLoading && (
                    <Text role="status" p={6}>
                      {t("workspace-loading")}
                    </Text>
                  )}
                  {workspaceQuery.isError && (
                    <Box role="alert" p={6}>
                      <Text color="sentiment.negativeDefault">
                        {t("workspace-load-error")}
                      </Text>
                      <Button
                        mt={3}
                        size="sm"
                        variant="outline"
                        onClick={() => void refetchWorkspace()}
                      >
                        {t("retry")}
                      </Button>
                    </Box>
                  )}
                  {workspace && (
                    <WorkspaceOverview
                      workspace={workspace}
                      lng={lng}
                      chapters={draft?.chapters ?? []}
                      onSelectPoint={openPoint}
                      onOpenDraft={() => {
                        setMobilePane("workspace");
                        setTab("draft");
                      }}
                      onOpenSetup={() => void openFundingSetup()}
                      hasTemplate={hasApplicationTemplate}
                      setupSaving={setupState.isLoading || workspaceRefreshing}
                      setupError={setupState.isError}
                      onOpenGap={openDraftGap}
                      reviewPending={Boolean(reviewProposal)}
                      onViewChanges={viewChanges}
                      onOpenExport={() => setExportOpen(true)}
                      onSyncSetup={() => {
                        if (workspaceRefreshing || setupState.isLoading) return;
                        void saveSetup({
                          runId,
                          document_type: "concept_note",
                          expected_revision: workspace.revision,
                          idempotency_key: crypto.randomUUID(),
                        });
                      }}
                    />
                  )}
                </Tabs.Content>
                <Tabs.Content value="todo" p={0}>
                  {workspace ? (
                    <WorkspaceTodos
                      workspace={workspace}
                      lng={lng}
                      runId={runId}
                      selectedKey={selectedPointKey}
                      onSelectPoint={openPoint}
                      onAddSource={addPointSource}
                      onOpenContext={() => setTab("context")}
                      sourceBusy={uploadState.isLoading}
                    />
                  ) : (
                    <Box p={6}>
                      <Text role="status">
                        {t(
                          workspaceQuery.isError
                            ? "workspace-load-error"
                            : "workspace-loading",
                        )}
                      </Text>
                      {workspaceQuery.isError && (
                        <Button
                          mt={3}
                          variant="outline"
                          size="sm"
                          onClick={() => void refetchWorkspace()}
                        >
                          {t("retry")}
                        </Button>
                      )}
                    </Box>
                  )}
                </Tabs.Content>
                <Tabs.Content value="draft" p={0}>
                  {(reviewProposal || editFeedbackKey(edits)) && (
                    // Proposal review gets its own row so it never squeezes the title.
                    <Flex
                      data-testid="concept-note-review-bar"
                      flexShrink={0}
                      align="center"
                      gap={3}
                      flexWrap="wrap"
                      px={4}
                      py={2}
                      bg="background.neutral"
                      borderBottom="1px solid"
                      borderColor="border.neutral"
                    >
                      {reviewProposal && (
                        <DocumentReviewToolbar
                          proposal={reviewProposal}
                          chapters={draft?.chapters ?? []}
                          edits={edits}
                          changes={reviewChanges}
                          activeChangeId={activeChangeId}
                          lng={lng}
                          onNavigate={navigateEdit}
                          onOpenSources={() => setTab("context")}
                          isDocumentVisible={tab === "draft"}
                          hasDecisions={
                            Object.keys(activeReviewDecisions).length > 0
                          }
                          onAcceptRemaining={(proposal) =>
                            decideRemaining(proposal, "accepted")
                          }
                          onRejectRemaining={(proposal) =>
                            decideRemaining(proposal, "rejected")
                          }
                        />
                      )}
                      <DocumentReviewFeedback edits={edits} lng={lng} />
                    </Flex>
                  )}
                  <DraftTab
                    selectionRunId={runId}
                    selectionDisabled={
                      Boolean(reviewProposal) ||
                      edits.isLoading ||
                      Boolean(edits.error) ||
                      isDraftRunning ||
                      startDraftState.isLoading ||
                      confirmChapterState.isLoading ||
                      Boolean(edits.busy) ||
                      edits.needsDraftReload ||
                      edits.proposals.some(
                        (proposal) => proposal.status === "processing",
                      )
                    }
                    onSelectionProposed={async (proposal, manualFormatting) => {
                      await edits.loadProposal(proposal.proposal_id);
                      if (
                        manualFormatting &&
                        (proposal.status !== "proposed" ||
                          !(await edits.apply(proposal)))
                      ) {
                        throw new Error("Selection formatting was not applied");
                      }
                      if (manualFormatting) return;
                      const chapterId =
                        proposal.scope.kind === "selection"
                          ? proposal.scope.chapter_id
                          : Object.keys(proposal.base_revisions)[0];
                      if (chapterId) navigateEdit(chapterId);
                    }}
                    applicationContext={applicationContext ?? null}
                    bundle={bundle}
                    contextStatus={contextStatus}
                    canStartDrafting={canStartDrafting}
                    draft={draft ?? null}
                    draftError={
                      draftStartError ??
                      (draftFailed && !draftLoading
                        ? t("review-draft-load-error")
                        : null)
                    }
                    focusChapterId={reviewChapterId}
                    focusFindingKey={reviewFindingKey}
                    highlightStartDrafting={highlightStartDrafting}
                    nextStep={nextStepBanner}
                    onAnswerGap={openDraftGap}
                    applicationContextFailed={applicationContextFailed}
                    applicationContextLoading={applicationContextLoading}
                    isDraftRunning={isDraftRunning}
                    isConfirmingChapter={confirmChapterState.isLoading}
                    isRetrying={retryBundleState.isLoading}
                    isStartingDraft={startDraftState.isLoading}
                    lng={lng}
                    noteName={run.name}
                    scrollContainerRef={workspaceScrollRef}
                    canonicalPointKeys={workspace?.points.map(
                      (point) => point.key,
                    )}
                    editFocus={editFocus}
                    reviewChanges={reviewChanges}
                    activeChangeId={activeChangeId}
                    reviewDecisions={activeReviewDecisions}
                    reviewDecisionBusy={
                      Boolean(edits.busy) || edits.needsDraftReload
                    }
                    onAcceptReviewChange={
                      reviewProposal
                        ? (changeIds) =>
                            void decideInlineChange(
                              reviewProposal,
                              changeIds,
                              "accepted",
                            )
                        : undefined
                    }
                    onRejectReviewChange={
                      reviewProposal
                        ? (changeIds) =>
                            void decideInlineChange(
                              reviewProposal,
                              changeIds,
                              "rejected",
                            )
                        : undefined
                    }
                    onFocusedChapterChange={(focusedChapterId) =>
                      setEditScope({
                        kind: "auto",
                        focused_chapter_id: focusedChapterId,
                      })
                    }
                    onConfirmChapter={confirmChapter}
                    mutationError={workspaceMutationError}
                    onOpenContext={() => {
                      setMobilePane("workspace");
                      setTab("context");
                    }}
                    onOpenFundingSetup={() => void openFundingSetup()}
                    onRetry={() => void retryContextBundle()}
                    onStartDrafting={() => void startDrafting()}
                  />
                </Tabs.Content>
                <Tabs.Content value="structure" p={0}>
                  <StructureTab
                    key={runId}
                    runId={runId}
                    applicationContext={applicationContext ?? null}
                    draft={draft ?? null}
                    lng={lng}
                  />
                </Tabs.Content>
                <Tabs.Content value="context" p={0}>
                  <WorkspaceSources
                    workspace={workspace}
                    runId={runId}
                    lng={lng}
                    onSelectPoint={openPoint}
                    onAddSource={addPointSource}
                    sourceBusy={uploadState.isLoading}
                    onAttached={() => {
                      void refetchRun();
                      void refetchWorkspace();
                    }}
                  />
                  <ContextTab
                    applicationContext={applicationContext ?? null}
                    onSelectFunding={() => setFundingOpen(true)}
                    fundingLoading={applicationContextLoading}
                    fundingError={applicationContextFailed}
                    onRetryFunding={() => void refetchApplicationContext()}
                    bundle={bundle}
                    contextStatus={contextStatus}
                    cityFilesCount={files.length}
                    cityId={cityId}
                    cityName={cityName}
                    cityDashboard={cityDashboard ?? null}
                    cityDashboardFailed={cityDashboardFailed}
                    cityDashboardLoading={cityDashboardLoading}
                    country={city?.country ?? null}
                    firstCityFile={files[0]?.fileName ?? null}
                    inventoryAvailable={Boolean(inventory)}
                    inventoryFailed={inventoryFailed}
                    inventoryHasData={inventory?.totalEmissions != null}
                    inventoryId={inventory?.inventoryId ?? null}
                    inventoryLoading={inventoryLoading}
                    inventoryOptions={inventoryOptions}
                    inventorySelectionSaving={inventorySelectionSaving}
                    inventoryYear={inventory?.year ?? null}
                    onSelectInventory={selectInventory}
                    isDraftRunning={isDraftRunning}
                    isRetryingBundle={retryBundleState.isLoading}
                    retryingUploadId={retryingUploadId}
                    isUploading={uploadState.isLoading}
                    livePopulation={populationData}
                    lng={lng}
                    onRetryBundle={() => void retryContextBundle()}
                    onRetryUpload={(uploadId) =>
                      void retrySourceUpload(uploadId)
                    }
                    onUploadFile={async (file, role) => {
                      await uploadSource(file, role);
                      void refetchWorkspace();
                    }}
                    manualPopulation={manualPopulation}
                    manualPopulationSaving={manualPopulationSaving}
                    onSaveManualPopulation={saveManualPopulation}
                    populationFailed={populationFailed}
                    populationLabel={populationLabel}
                    populationLoading={populationLoading}
                    runId={runId}
                    uploads={uploads}
                    uploadError={effectiveUploadError}
                    uploadPickerRequest={uploadPickerRequest}
                  />
                </Tabs.Content>
              </Box>
            </Tabs.Root>
          </Box>
        </VStack>
      </motion.main>

      {workspace && (
        <DialogRoot
          open={exportOpen}
          onOpenChange={({ open }) => setExportOpen(open)}
          size="lg"
        >
          <DialogContent
            maxH="calc(100dvh - 32px)"
            display="flex"
            flexDirection="column"
            bg="base.light"
          >
            <DialogHeader>
              <DialogTitle fontFamily="heading" fontSize="title.md">
                {t("workspace-export-menu")}
              </DialogTitle>
            </DialogHeader>
            <DialogCloseTrigger aria-label={t("close")} />
            <DialogBody minH={0} overflowY="auto" pb={6}>
              <WorkspaceExport
                workspace={workspace}
                refreshing={workspaceRefreshing || setupState.isLoading}
                runId={runId}
                noteName={run.name}
                lng={lng}
                onReviewEvidence={() => {
                  setExportOpen(false);
                  setTab("context");
                }}
                onReload={async () => {
                  await Promise.all([
                    refetchWorkspace().unwrap(),
                    refetchDraft().unwrap(),
                  ]);
                }}
              />
            </DialogBody>
          </DialogContent>
        </DialogRoot>
      )}
      <ExportDialog
        draft={draft ?? null}
        draftError={draftFailed}
        hasApplicationTemplate={hasApplicationTemplate}
        hasUploadedEvidence={bundle.availableContext.uploadedDocuments}
        lng={lng}
        noteName={run.name}
        open={reviewOpen}
        runId={runId}
        onAddInformation={(chapterId, findingKey) => {
          setEditFocus(null);
          setReviewChapterId(chapterId);
          setReviewFindingKey(findingKey ?? null);
          setTab("draft");
        }}
        onReviewSetup={() => setTab("context")}
        onOpenChange={setReviewOpen}
        onRetryDraft={() => refetchDraft()}
        onReviewComplete={() => refetchDraft()}
      />
      {fundingOpen && applicationContext && (
        <FundingSelectionDialog
          applicationContext={applicationContext}
          hasDraft={Boolean(draft?.chapters.length)}
          infoFirst={!draftHasContent}
          busy={isDraftRunning || Boolean(edits.busy)}
          lng={lng}
          runId={runId}
          funderImport={funderImport}
          templateImport={templateImport}
          onClose={() => setFundingOpen(false)}
          onSaved={() => {
            setTab("overview");
            void refetchWorkspace();
            setNextStep("start-drafting");
            setHighlightStartDrafting(true);
          }}
        />
      )}
    </Box>
  );
}
