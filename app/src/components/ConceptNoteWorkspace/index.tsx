"use client";

import { useState } from "react";

import {
  Box,
  Flex,
  Grid,
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
  LuFileText,
  LuLayers3,
  LuRefreshCw,
  LuShieldCheck,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

import {
  getConceptNoteStatusPresentation,
  getWorkflowStepTranslationKey,
} from "../ConceptNoteDashboard/utils";
import { StatusBadge } from "../ConceptNoteDashboard/status-badge";
import { ConceptNoteChatPanel } from "./chat-panel";
import { ContextTab } from "./context-tab";
import { DraftTab } from "./draft-tab";
import { ExportDialog } from "./export-dialog";
import { StructureTab } from "./structure-tab";
import { useConceptNoteWorkspaceData } from "./use-concept-note-workspace-data";
import {
  WorkspaceLoadingState,
  WorkspaceUnavailableState,
} from "./workspace-states";

type WorkspaceTab = "draft" | "structure" | "context";

interface ConceptNoteWorkspaceProps {
  cityId: string;
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
  initialUploadId,
  lng,
  runId,
}: ConceptNoteWorkspaceProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const reducedMotion = useReducedMotion() ?? false;
  const [tab, setTab] = useState<WorkspaceTab>("draft");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewChapterId, setReviewChapterId] = useState<string | null>(null);
  const [reviewFindingKey, setReviewFindingKey] = useState<string | null>(null);
  const {
    applicationContext,
    applicationContextFailed,
    applicationContextLoading,
    bundle,
    canStartDrafting,
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
    populationLabel,
    refetchDraft,
    refetchRun,
    retryActiveUpload,
    retryBundleState,
    retryContextBundle,
    retryUploadState,
    reviewAvailabilityDescription,
    run,
    runFailed,
    runLoading,
    startDrafting,
    startDraftState,
    uploadSource,
    uploadState,
  } = useConceptNoteWorkspaceData({ cityId, initialUploadId, lng, runId });
  const canReview = reviewAvailabilityDescription === null;

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
  const statusLabel = t(status.translationKey);
  const workflowLabel = t(getWorkflowStepTranslationKey(run.workflow_step));

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
          maxW="1480px"
          mx="auto"
          px={{ base: 4, md: 10 }}
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

          <Flex
            flexShrink={0}
            align={{ base: "start", md: "center" }}
            direction={{ base: "column", md: "row" }}
            gap={4}
          >
            <Box minW={0} flex={1}>
              <HStack align="center" gap={3} flexWrap="wrap">
                <Heading
                  as="h1"
                  truncate
                  fontFamily="heading"
                  fontSize="title.lg"
                  fontWeight="semibold"
                  color="content.primary"
                >
                  {run.name}
                </Heading>
                <StatusBadge label={statusLabel} tone={status.tone} />
              </HStack>
              <Text mt={1} fontSize="label.sm" color="content.tertiary">
                {cityName} · {workflowLabel} · {t("autosaved")}
              </Text>
            </Box>
            <VStack
              align={{ base: "stretch", md: "end" }}
              flexShrink={0}
              gap={1}
              w={{ base: "full", md: "320px" }}
            >
              <Button
                aria-describedby={
                  reviewAvailabilityDescription
                    ? "review-availability-reason"
                    : undefined
                }
                disabled={!canReview}
                size="sm"
                variant="solid"
                bg="sentiment.positiveDefault"
                onClick={() => {
                  setReviewChapterId(null);
                  setReviewFindingKey(null);
                  setReviewOpen(true);
                }}
              >
                <Icon as={LuShieldCheck} />
                {t("review-and-export")}
              </Button>
              {reviewAvailabilityDescription && (
                <VStack align={{ base: "start", md: "end" }} gap={0}>
                  <Text
                    id="review-availability-reason"
                    maxW="320px"
                    fontSize="label.xs"
                    color="content.tertiary"
                    textAlign={{ base: "left", md: "right" }}
                  >
                    {reviewAvailabilityDescription}
                  </Text>
                  {draftFailed && !draftLoading ? (
                    <Button
                      h="auto"
                      minW="auto"
                      size="xs"
                      variant="ghost"
                      px={1}
                      py={0}
                      color="content.link"
                      onClick={() => void refetchDraft()}
                    >
                      {t("try-again")}
                    </Button>
                  ) : (
                    (applicationContextFailed || !hasApplicationTemplate) &&
                    !applicationContextLoading && (
                      <Button
                        h="auto"
                        minW="auto"
                        size="xs"
                        variant="ghost"
                        px={1}
                        py={0}
                        color="content.link"
                        onClick={() => setTab("context")}
                      >
                        {t("review-application-setup")}
                      </Button>
                    )
                  )}
                </VStack>
              )}
            </VStack>
          </Flex>

          <Grid
            flex={1}
            minH={0}
            overflow="hidden"
            gap={5}
            alignItems="stretch"
            gridTemplateColumns={{
              base: "minmax(0, 1fr)",
              lg: "360px minmax(0, 1fr)",
              xl: "440px minmax(0, 1fr)",
            }}
            gridTemplateRows={{
              base: "repeat(2, minmax(0, 1fr))",
              lg: "minmax(0, 1fr)",
            }}
          >
            <ConceptNoteChatPanel
              bundleStatus={bundle.status}
              composerRequest={null}
              documentGrounding={bundle.documentGrounding}
              lng={lng}
              onOpenContext={() => setTab("context")}
              threadId={run.thread_id}
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
                  canStartDrafting={canStartDrafting}
                  draft={draft ?? null}
                  draftError={draftStartError}
                  focusChapterId={reviewChapterId}
                  focusFindingKey={reviewFindingKey}
                  applicationContextFailed={applicationContextFailed}
                  applicationContextLoading={applicationContextLoading}
                  isDraftRunning={isDraftRunning}
                  isRetrying={retryBundleState.isLoading}
                  isStartingDraft={startDraftState.isLoading}
                  lng={lng}
                  noteName={run.name}
                  onOpenContext={() => setTab("context")}
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
                  bundle={bundle}
                  cityFilesCount={files.length}
                  cityName={cityName}
                  country={city?.country ?? null}
                  firstCityFile={files[0]?.fileName ?? null}
                  inventoryYear={inventory?.year ?? null}
                  isRetryingBundle={retryBundleState.isLoading}
                  isRetryingUpload={retryUploadState.isLoading}
                  isUploading={uploadState.isLoading}
                  lng={lng}
                  onRetryBundle={() => void retryContextBundle()}
                  onRetryUpload={() => void retryActiveUpload()}
                  onUploadFile={uploadSource}
                  populationLabel={populationLabel}
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
          setReviewChapterId(chapterId);
          setReviewFindingKey(findingKey ?? null);
          setTab("draft");
        }}
        onReviewSetup={() => setTab("context")}
        onOpenChange={setReviewOpen}
        onRetryDraft={() => refetchDraft()}
        onReviewComplete={() => refetchDraft()}
      />
    </Box>
  );
}
