"use client";

import { useEffect, useRef, useState } from "react";

import {
  Box,
  Flex,
  Grid,
  Heading,
  HStack,
  Icon,
  Tabs,
  Text,
  VisuallyHidden,
  VStack,
} from "@chakra-ui/react";
import { motion, useReducedMotion } from "framer-motion";
import NextLink from "next/link";
import {
  LuArrowLeft,
  LuFileText,
  LuLayers3,
  LuRefreshCw,
  LuShieldCheck,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { hasIncompleteInitialUploads } from "@/util/concept-note-initial-uploads";
import { NewConceptNoteDialog } from "../ConceptNoteDashboard/new-concept-note-dialog";
import type { EditScope } from "@/util/concept-note-edit-types";
import type { ConceptNoteDraftChapter } from "@/util/types";

import {
  getConceptNoteStatusPresentation,
  getWorkflowStepTranslationKey,
} from "@/components/ConceptNoteDashboard/utils";
import { StatusBadge } from "@/components/ConceptNoteDashboard/status-badge";
import { ConceptNoteChatPanel } from "@/components/ConceptNoteWorkspace/chat-panel";
import { ContextTab } from "@/components/ConceptNoteWorkspace/context-tab";
import { FundingSelectionDialog } from "@/components/ConceptNoteWorkspace/funding-selection-dialog";
import { DraftTab } from "@/components/ConceptNoteWorkspace/draft-tab";
import { ExportDialog } from "@/components/ConceptNoteWorkspace/export-dialog";
import { ReviewButton } from "@/components/ConceptNoteWorkspace/review-button";
import { StructureTab } from "@/components/ConceptNoteWorkspace/structure-tab";
import { StartNewChatDialog } from "@/components/ConceptNoteWorkspace/start-new-chat-dialog";
import { useConceptNoteEdits } from "@/components/ConceptNoteWorkspace/use-concept-note-edits";
import {
  DocumentReviewToolbar,
  editFeedbackKey,
  DocumentReviewFeedback,
  documentReviewChanges,
  selectReviewProposal,
} from "@/components/ConceptNoteWorkspace/document-review";
import { useInlineReviewDecisions } from "@/components/ConceptNoteWorkspace/use-inline-review-decisions";
import { useConceptNoteWorkspaceData } from "@/components/ConceptNoteWorkspace/use-concept-note-workspace-data";
import {
  WorkspaceLoadingState,
  WorkspaceUnavailableState,
} from "@/components/ConceptNoteWorkspace/workspace-states";

type WorkspaceTab = "draft" | "structure" | "context";

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
  { key: "draft", translationKey: "draft-tab", icon: LuFileText },
  { key: "structure", translationKey: "structure-tab", icon: LuLayers3 },
  { key: "context", translationKey: "context-tab", icon: LuRefreshCw },
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
  const [tab, setTab] = useState<WorkspaceTab>("draft");
  const [startNewChatOpen, setStartNewChatOpen] = useState(false);
  const [fundingOpen, setFundingOpen] = useState(false);
  const [retryInitialUploadOpen, setRetryInitialUploadOpen] = useState(false);
  const [resetThread, setResetThread] = useState<{
    previousThreadId: string | null;
    threadId: string;
  } | null>(null);
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
    cityName,
    draft,
    draftFailed,
    draftLoading,
    draftStartError,
    effectiveUpload,
    effectiveUploadError,
    files,
    hasApplicationTemplate,
    inventory,
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
    retryActiveUpload,
    retryBundleState,
    retryContextBundle,
    retryUploadState,
    reviewAvailabilityDescription,
    run,
    runFailed,
    runLoading,
    saveManualPopulation,
    startDrafting,
    startDraftState,
    uploadSource,
    uploadState,
  } = useConceptNoteWorkspaceData({ cityId, initialUploadId, lng, runId });
  const edits = useConceptNoteEdits({
    runId,
    onApplied: async (chapterIds) => {
      await refetchDraft().unwrap();
      if (chapterIds[0]) navigateEdit(chapterIds[0]);
    },
  });
  const openFundingSetup = async () => {
    setTab("context");
    if (applicationContext) {
      setFundingOpen(true);
    } else {
      const result = await refetchApplicationContext();
      if (result.isSuccess) setFundingOpen(true);
    }
  };
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
  const shownReview = useRef<string | null>(null);
  const reviewIdentity = reviewProposal?.proposal_id;
  const firstReviewChapterId = reviewChanges[0]?.chapter_id;
  const firstReviewChangeId = reviewChanges[0]?.change_id;
  useEffect(() => {
    if (
      !reviewIdentity ||
      !firstReviewChapterId ||
      shownReview.current === reviewIdentity
    )
      return;
    shownReview.current = reviewIdentity;
    const frame = window.requestAnimationFrame(() => {
      setTab("draft");
      setReviewChapterId(null);
      setReviewFindingKey(null);
      setEditFocus({
        chapterId: firstReviewChapterId,
        changeId: firstReviewChangeId,
        requestId: crypto.randomUUID(),
        focus: false,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reviewIdentity, firstReviewChapterId, firstReviewChangeId]);

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

  const canReview = reviewAvailabilityDescription === null;

  async function confirmChapter(
    chapter: ConceptNoteDraftChapter,
  ): Promise<void> {
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
      await refetchDraft();
    } catch {
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
  const activeThreadId =
    resetThread?.previousThreadId === run.thread_id
      ? resetThread.threadId
      : run.thread_id;

  return (
    <Box
      h="calc(100dvh - 80px)"
      minH={0}
      overflow="hidden"
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
          gap={4}
          h="full"
          minH={0}
          maxW="1800px"
          mx="auto"
          px={{ base: 2, md: 5 }}
          py={6}
        >
          <HStack flexShrink={0} gap={2} color="content.tertiary">
            <NextLink href={`/${lng}/cities/${cityId}/concept-notes`}>
              <HStack gap={1.5} _hover={{ color: "content.link" }}>
                <Icon as={LuArrowLeft} />
                <Text fontSize="label.sm">{t("all-concept-notes")}</Text>
              </HStack>
            </NextLink>
            <Text fontSize="label.sm">/</Text>
            <Text
              truncate
              maxW="420px"
              fontSize="label.sm"
              color="content.secondary"
            >
              {run.name}
            </Text>
          </HStack>

          {incompleteUploads && (
            <Box
              role="status"
              p={3}
              borderWidth="1px"
              borderColor="sentiment.warningDefault"
            >
              <Text>{t("upload-incomplete-message")}</Text>
              <Button onClick={() => setRetryInitialUploadOpen(true)}>
                {t("retry-upload")}
              </Button>
            </Box>
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
          <Grid
            flex={1}
            data-testid="concept-note-workspace-panels"
            minH={0}
            overflow="hidden"
            gap={2.5}
            alignItems="stretch"
            gridTemplateColumns={{
              base: "minmax(0, 1fr)",
              md: "minmax(280px, 31%) minmax(0, 1fr)",
            }}
            gridTemplateRows={{
              base: "repeat(2, minmax(0, 1fr))",
              md: "minmax(0, 1fr)",
            }}
          >
            <ConceptNoteChatPanel
              contextStatus={contextStatus}
              composerRequest={null}
              draftOverviewPending={Boolean(draft?.overview_pending)}
              lng={lng}
              onOpenContext={() => setTab("context")}
              onStartNewChat={() => setStartNewChatOpen(true)}
              runId={run.run_id}
              threadId={activeThreadId}
              editScope={editScope}
              edits={edits}
            />

            <Tabs.Root
              value={tab}
              onValueChange={(details) => setTab(details.value as WorkspaceTab)}
              display="flex"
              flexDirection="column"
              h="full"
              minH={0}
              minW={0}
              overflow="hidden"
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="base.light"
              boxShadow="1dp"
            >
              <Flex
                data-testid="concept-note-document-header"
                flexShrink={0}
                align="center"
                flexWrap="wrap"
                gap={3}
                px={4}
                py={3}
                borderBottom="1px solid"
                borderColor="border.neutral"
              >
                <HStack gap={2} flex="1 1 180px" minW={0}>
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
                        fontSize="label.sm"
                        color="content.secondary"
                        title={`${cityName} · ${workflowLabel}`}
                      >
                        {t("autosaved")}
                      </Text>
                      <StatusBadge label={statusLabel} tone={status.tone} />
                    </HStack>
                  </Box>
                </HStack>
                <Flex align="center" gap={2} flexWrap="wrap" minW={0}>
                  <ReviewButton
                    size="sm"
                    minH="44px"
                    variant="outline"
                    color="content.link"
                    borderColor="content.link"
                    data-testid="concept-note-export"
                    disabled={!canReview}
                    aria-describedby={
                      reviewAvailabilityDescription
                        ? "review-availability-reason"
                        : undefined
                    }
                    onClick={() => {
                      setReviewChapterId(null);
                      setReviewFindingKey(null);
                      setReviewOpen(true);
                    }}
                  >
                    <Icon as={LuShieldCheck} />
                    {t("review-and-export")}
                  </ReviewButton>
                </Flex>
              </Flex>
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
              {reviewAvailabilityDescription && (
                <VisuallyHidden id="review-availability-reason">
                  {reviewAvailabilityDescription}
                </VisuallyHidden>
              )}
              <Tabs.List
                flexShrink={0}
                gap={0}
                borderBottom="1px solid"
                borderColor="border.neutral"
                bg="base.light"
                px={3}
              >
                {workspaceTabs.map((item) => (
                  <Tabs.Trigger
                    key={item.key}
                    value={item.key}
                    display="flex"
                    alignItems="center"
                    gap={2}
                    borderBottom="2px solid"
                    borderColor="transparent"
                    color="content.tertiary"
                    px={{ base: 2, md: 4 }}
                    py={3.5}
                    fontFamily="heading"
                    fontSize="label.sm"
                    fontWeight="semibold"
                    _selected={{
                      borderColor: "content.link",
                      color: "content.link",
                    }}
                    _hover={{ color: "content.link" }}
                  >
                    <Icon as={item.icon} />
                    {t(item.translationKey)}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <Tabs.Content
                value="draft"
                flex={1}
                minH={0}
                overflowY="auto"
                p={0}
              >
                <DraftTab
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
                  applicationContextFailed={applicationContextFailed}
                  applicationContextLoading={applicationContextLoading}
                  isDraftRunning={isDraftRunning}
                  isConfirmingChapter={confirmChapterState.isLoading}
                  isRetrying={retryBundleState.isLoading}
                  isStartingDraft={startDraftState.isLoading}
                  lng={lng}
                  noteName={run.name}
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
                  onOpenContext={() => setTab("context")}
                  onOpenFundingSetup={() => void openFundingSetup()}
                  onRetry={() => void retryContextBundle()}
                  onStartDrafting={() => void startDrafting()}
                />
              </Tabs.Content>
              <Tabs.Content
                value="structure"
                flex={1}
                minH={0}
                overflowY="auto"
                p={0}
              >
                <StructureTab
                  key={runId}
                  runId={runId}
                  applicationContext={applicationContext ?? null}
                  draft={draft ?? null}
                  lng={lng}
                />
              </Tabs.Content>
              <Tabs.Content
                value="context"
                flex={1}
                minH={0}
                overflowY="auto"
                p={0}
              >
                <ContextTab
                  applicationContext={applicationContext ?? null}
                  onSelectFunding={() => setFundingOpen(true)}
                  fundingLoading={applicationContextLoading}
                  fundingError={applicationContextFailed}
                  onRetryFunding={() => void refetchApplicationContext()}
                  bundle={bundle}
                  contextStatus={contextStatus}
                  cityFilesCount={files.length}
                  cityName={cityName}
                  country={city?.country ?? null}
                  firstCityFile={files[0]?.fileName ?? null}
                  inventoryYear={inventory?.year ?? null}
                  isDraftRunning={isDraftRunning}
                  isRetryingBundle={retryBundleState.isLoading}
                  isRetryingUpload={retryUploadState.isLoading}
                  isUploading={uploadState.isLoading}
                  livePopulation={populationData}
                  lng={lng}
                  onRetryBundle={() => void retryContextBundle()}
                  onRetryUpload={() => void retryActiveUpload()}
                  onUploadFile={uploadSource}
                  manualPopulation={manualPopulation}
                  manualPopulationSaving={manualPopulationSaving}
                  onSaveManualPopulation={saveManualPopulation}
                  populationFailed={populationFailed}
                  populationLabel={populationLabel}
                  populationLoading={populationLoading}
                  upload={effectiveUpload}
                  uploadError={effectiveUploadError}
                />
              </Tabs.Content>
            </Tabs.Root>
          </Grid>
        </VStack>
      </motion.main>

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
          busy={isDraftRunning || Boolean(edits.busy)}
          lng={lng}
          runId={runId}
          onClose={() => setFundingOpen(false)}
        />
      )}
      {startNewChatOpen && (
        <StartNewChatDialog
          cityId={cityId}
          lng={lng}
          runId={runId}
          onClose={() => setStartNewChatOpen(false)}
          onReset={(updatedRun) => {
            if (updatedRun.thread_id) {
              setResetThread({
                previousThreadId: run.thread_id,
                threadId: updatedRun.thread_id,
              });
            }
            void refetchRun();
          }}
        />
      )}
    </Box>
  );
}
