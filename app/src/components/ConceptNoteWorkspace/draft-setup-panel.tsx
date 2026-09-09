import type { ConceptNoteContextPresentation } from "./context-status";
import { Box, Flex, HStack, Icon, Text } from "@chakra-ui/react";
import {
  LuCircleAlert,
  LuDatabase,
  LuRefreshCw,
  LuSparkles,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftRunStatus,
  ConceptNoteDraftState,
} from "@/util/types";

import type { ConceptNoteBundleProgress } from "../ConceptNoteDashboard/utils";

import { chapterTone } from "./draft-document-panel";

interface DraftSetupPanelProps {
  applicationContext: ConceptNoteApplicationContext | null;
  applicationContextFailed: boolean;
  applicationContextLoading: boolean;
  bundle: ConceptNoteBundleProgress;
  contextStatus: ConceptNoteContextPresentation;
  canStartDrafting: boolean;
  draft: ConceptNoteDraftState | null;
  draftError: string | null;
  isDraftRunning: boolean;
  isRetrying: boolean;
  isStartingDraft: boolean;
  lng: string;
  onOpenContext: () => void;
  onRetry: () => void;
  onStartDrafting: () => void;
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
  const draftStarted = Boolean(draft && draft.status !== "not_started");
  const showDraftSetup = !draftStarted || draft?.status === "failed";
  const isBuilding = props.contextStatus.busy;
  const isFailed = props.contextStatus.state === "failed";
  const status = props.contextStatus;
  const requirements = [
    !props.applicationContext?.funder ? t("drafting-requirement-funder") : null,
    !props.applicationContext?.opportunity
      ? t("drafting-requirement-programme")
      : null,
    !props.applicationContext?.template
      ? t("drafting-requirement-template")
      : null,
  ].filter((requirement): requirement is string => Boolean(requirement));
  const setupBlocked =
    !props.canStartDrafting &&
    draft?.status !== "complete" &&
    !props.isDraftRunning;
  const setupDescription = props.applicationContextFailed
    ? t("drafting-setup-load-error")
    : props.applicationContextLoading
      ? t("drafting-setup-loading")
      : t("drafting-setup-missing", { requirements: requirements.join(", ") });
  const totalChapters =
    draft?.total_chapters ||
    props.applicationContext?.template?.chapter_schema.length ||
    0;

  return (
    <>
      {showDraftSetup && (
        <Flex
          align={{ base: "stretch", xl: "center" }}
          direction={{ base: "column", xl: "row" }}
          gap={4}
          border="1px solid"
          borderColor={status.color}
          borderRadius="rounded"
          bg={status.surface}
          p={4}
        >
          <Flex align="start" gap={3} flex={1}>
            <Icon as={status.icon} mt={0.5} color={status.color} />
            <Box>
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
          ) : !isBuilding && !isFailed ? (
            <HStack gap={2} flexWrap="wrap">
              <Button size="sm" variant="outline" onClick={props.onOpenContext}>
                <Icon as={LuDatabase} />
                {t("review-context")}
              </Button>
              <Button
                size="sm"
                variant="solid"
                aria-describedby={
                  setupBlocked ? "drafting-setup-reason" : undefined
                }
                disabled={
                  !props.canStartDrafting ||
                  props.isDraftRunning ||
                  draft?.status === "complete"
                }
                loading={props.isStartingDraft}
                onClick={props.onStartDrafting}
              >
                <Icon as={LuSparkles} />
                {t(draftStarted ? "continue-drafting" : "start-drafting")}
              </Button>
            </HStack>
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
            {!props.applicationContextFailed &&
              !props.applicationContextLoading && (
                <Text
                  mt={1}
                  fontSize="label.sm"
                  lineHeight="20px"
                  color="content.secondary"
                >
                  {t("drafting-setup-review-context")}
                </Text>
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
          {!draftStarted && !props.draftError && (
            <Text mt={3} fontSize="body.sm" color="content.tertiary">
              {t("draft-empty-state")}
            </Text>
          )}
        </Box>
      )}
    </>
  );
}
