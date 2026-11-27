import { Box, Flex, HStack, Icon, Text } from "@chakra-ui/react";
import {
  LuCircleAlert,
  LuDatabase,
  LuLandmark,
  LuRefreshCw,
  LuSparkles,
} from "react-icons/lu";
import type { ConceptNoteContextPresentation } from "@/components/ConceptNoteWorkspace/context-status";

import { ReviewButton as Button } from "./review-button";
import type { PointDraftStage } from "./point-draft-stage";
import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftRunStatus,
  ConceptNoteDraftState,
} from "@/util/types";

import type { ConceptNoteBundleProgress } from "@/components/ConceptNoteDashboard/utils";

import { chapterTone } from "./chapter-validation";

interface DraftSetupPanelProps {
  applicationContext: ConceptNoteApplicationContext | null;
  applicationContextFailed: boolean;
  applicationContextLoading: boolean;
  bundle: ConceptNoteBundleProgress;
  contextStatus: ConceptNoteContextPresentation;
  canStartDrafting: boolean;
  pointDraftStage?: PointDraftStage;
  draft: ConceptNoteDraftState | null;
  draftError: string | null;
  isDraftRunning: boolean;
  isRetrying: boolean;
  isStartingDraft: boolean;
  lng: string;
  onOpenContext: () => void;
  onOpenFundingSetup: () => void;
  onRetry: () => void;
  onStartDrafting: () => void;
  highlightStartDrafting?: boolean;
}

function draftStatusKey(status: ConceptNoteDraftRunStatus): string {
  return `draft-status-${status.replace("_", "-")}`;
}

function currentChapter(draft: ConceptNoteDraftState | null): string | null {
  if (!draft?.current_chapter_id) return null;
  return (
    draft.chapters.find(
      ({ chapter_id }) => chapter_id === draft.current_chapter_id,
    )?.title ?? null
  );
}

export function DraftSetupPanel(props: DraftSetupPanelProps) {
  const { t } = useTranslation(props.lng, "concept-notes");
  const { bundle, draft } = props;
  const hasDraftContent = Boolean(
    draft?.chapters.some((chapter) => chapter.body_markdown?.trim()),
  );
  const canResume = draft?.status === "not_started" && hasDraftContent;
  const draftStarted = Boolean(
    draft && (draft.status !== "not_started" || hasDraftContent),
  );
  const showDraftSetup = !draftStarted || draft?.status === "failed";
  const grantStage = props.pointDraftStage;
  const waitingForFirstFile = Boolean(grantStage && grantStage !== "ready");
  const isBuilding = !grantStage && props.contextStatus.busy;
  const isFailed = !grantStage && props.contextStatus.state === "failed";
  const status = props.contextStatus;
  // A template comes from a programme or is the note's own, so with one
  // neither a funder nor a programme is still missing.
  const requirements = props.applicationContext?.template
    ? []
    : [
        !props.applicationContext?.funder
          ? t("drafting-requirement-funder")
          : null,
        !props.applicationContext?.opportunity
          ? t("drafting-requirement-programme")
          : null,
        t("drafting-requirement-template"),
      ].filter((requirement): requirement is string => Boolean(requirement));
  const setupBlocked =
    !props.canStartDrafting &&
    draft?.status !== "complete" &&
    !props.isDraftRunning;
  const setupDescription = props.applicationContextFailed
    ? t("drafting-setup-load-error")
    : props.applicationContextLoading
      ? t("drafting-setup-loading")
      : t("drafting-setup-missing", {
          requirements: new Intl.ListFormat(props.lng, {
            type: "conjunction",
          }).format(requirements),
        });
  const totalChapters =
    draft?.total_chapters ||
    props.applicationContext?.template?.chapter_schema.length ||
    0;

  return (
    <>
      {canResume && (
        <Flex align="center" gap={3} flexWrap="wrap" flexShrink={0}>
          <Text flex={1} fontSize="body.sm" color="content.secondary">
            {t("draft-additional-chapters")}
          </Text>
          <Button
            size="sm"
            disabled={!props.canStartDrafting || props.isDraftRunning}
            loading={props.isStartingDraft}
            onClick={props.onStartDrafting}
          >
            <Icon as={LuSparkles} />
            {t("continue-drafting")}
          </Button>
        </Flex>
      )}
      {showDraftSetup && (
        <Flex
          align={{ base: "stretch", xl: "center" }}
          direction={{ base: "column", xl: "row" }}
          gap={4}
          border="1px solid"
          borderColor={grantStage ? "border.neutral" : status.color}
          borderRadius="rounded"
          bg={grantStage ? "background.neutral" : status.surface}
          p={4}
        >
          <Flex align="start" gap={3} flex={1}>
            <Icon
              as={grantStage ? LuDatabase : status.icon}
              mt={0.5}
              color={grantStage ? "content.link" : status.color}
            />
            <Box>
              <Text
                fontFamily="heading"
                fontSize="body.sm"
                fontWeight="semibold"
                color="content.primary"
              >
                {grantStage
                  ? t(`point-draft-stage-${grantStage}`)
                  : status.title}
              </Text>
              <Text
                mt={1}
                id={waitingForFirstFile ? "drafting-blocked-reason" : undefined}
                fontSize="label.sm"
                lineHeight="20px"
                color="content.secondary"
              >
                {grantStage
                  ? t(`point-draft-help-${grantStage}`)
                  : status.description}
              </Text>
            </Box>
          </Flex>

          {isFailed && bundle.retryable ? (
            <Button
              size="sm"
              variant="outline"
              loading={props.isRetrying}
              onClick={props.onRetry}
            >
              <Icon as={LuRefreshCw} />
              {t("retry-context")}
            </Button>
          ) : !isFailed ? (
            <Box>
              <HStack gap={2} flexWrap="wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={props.onOpenContext}
                >
                  <Icon as={LuDatabase} />
                  {t(
                    waitingForFirstFile
                      ? "point-draft-open-files"
                      : "review-context",
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="solid"
                  data-testid="concept-note-start-drafting"
                  aria-describedby={
                    isBuilding || waitingForFirstFile
                      ? "drafting-blocked-reason"
                      : setupBlocked
                        ? "drafting-setup-reason"
                        : undefined
                  }
                  disabled={
                    isBuilding ||
                    waitingForFirstFile ||
                    !props.canStartDrafting ||
                    props.isDraftRunning ||
                    draft?.status === "complete"
                  }
                  loading={props.isStartingDraft}
                  onClick={props.onStartDrafting}
                  css={
                    props.highlightStartDrafting
                      ? {
                          "@keyframes cnb-start-pulse": {
                            "0%": {
                              boxShadow:
                                "0 0 0 0 var(--chakra-colors-content-link)",
                            },
                            "100%": {
                              boxShadow: "0 0 0 10px rgba(0, 30, 167, 0)",
                            },
                          },
                          animation: "cnb-start-pulse 1.1s ease-out 3",
                        }
                      : undefined
                  }
                >
                  <Icon as={LuSparkles} />
                  {t(draftStarted ? "continue-drafting" : "start-drafting")}
                </Button>
              </HStack>
              {isBuilding && (
                <Text
                  id="drafting-blocked-reason"
                  mt={2}
                  fontSize="label.sm"
                  lineHeight="20px"
                  color="content.secondary"
                  data-testid="concept-note-start-drafting-reason"
                >
                  {t("drafting-blocked-context")}
                </Text>
              )}
            </Box>
          ) : null}
        </Flex>
      )}

      {setupBlocked && (
        <Flex
          id="drafting-setup-reason"
          align="start"
          gap={3}
          border="1px solid"
          borderColor="sentiment.warningDefault"
          borderRadius="rounded"
          bg="sentiment.warningOverlay"
          p={4}
          role="status"
        >
          <Icon
            as={LuCircleAlert}
            flexShrink={0}
            mt={0.5}
            color="sentiment.warningDefault"
          />
          <Box>
            <Text
              fontFamily="heading"
              fontSize="body.sm"
              fontWeight="semibold"
              color="content.primary"
            >
              {t("drafting-setup-required")}
            </Text>
            <Text
              mt={1}
              fontSize="label.sm"
              lineHeight="20px"
              color="content.secondary"
            >
              {setupDescription}
            </Text>
            {!props.applicationContextLoading &&
              (props.applicationContextFailed || requirements.length > 0) && (
                <Button
                  mt={3}
                  size="sm"
                  variant="outline"
                  onClick={props.onOpenFundingSetup}
                >
                  <Icon
                    as={
                      props.applicationContextFailed ? LuRefreshCw : LuLandmark
                    }
                  />
                  {t(
                    props.applicationContextFailed
                      ? "try-again"
                      : props.applicationContext?.funder
                        ? "drafting-setup-change-funding"
                        : "drafting-setup-choose-funding",
                  )}
                </Button>
              )}
          </Box>
        </Flex>
      )}

      {(!draftStarted ||
        props.isDraftRunning ||
        draft?.status === "failed") && (
        <Box
          border="1px solid"
          borderColor="border.neutral"
          borderRadius="rounded"
          bg="base.light"
          p={4}
        >
          <Text
            fontFamily="heading"
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("draft-progress")}
          </Text>
          <Text mt={1} fontSize="label.sm" color="content.secondary">
            {t("draft-progress-count", {
              completed: draft?.completed_chapters ?? 0,
              total: totalChapters,
            })}
          </Text>
          {currentChapter(draft) && (
            <Text mt={1} fontSize="label.sm" color="content.tertiary">
              {t("current-chapter", { chapter: currentChapter(draft) })}
            </Text>
          )}
          {props.draftError && (
            <Text mt={3} fontSize="label.sm" color="sentiment.negativeDefault">
              {props.draftError}
            </Text>
          )}
          {draft?.error_code && !props.draftError && (
            <Text mt={3} fontSize="label.sm" color="sentiment.negativeDefault">
              {t("draft-failed-description")} ({draft.error_code})
            </Text>
          )}
          <HStack mt={3} gap={2}>
            <Box
              boxSize="7px"
              borderRadius="full"
              bg={chapterTone(
                draft?.status === "failed"
                  ? "needs_review"
                  : draft?.status === "complete"
                    ? "ready"
                    : draftStarted
                      ? "draft"
                      : "empty",
              )}
            />
            <Text fontSize="label.sm" color="content.secondary">
              {t(draftStatusKey(draft?.status ?? "not_started"))}
            </Text>
          </HStack>
          {!draftStarted && !waitingForFirstFile && !props.draftError && (
            <Text mt={3} fontSize="body.sm" color="content.tertiary">
              {t("draft-empty-state")}
            </Text>
          )}
        </Box>
      )}
    </>
  );
}
