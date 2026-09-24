"use client";

import { Box, Text, VStack } from "@chakra-ui/react";

import { useMemo } from "react";
import type { ConceptNoteContextPresentation } from "@/components/ConceptNoteWorkspace/context-status";

import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftState,
} from "@/util/types";

import type { ConceptNoteBundleProgress } from "@/components/ConceptNoteDashboard/utils";

import {
  DraftDocumentPanel,
  type DraftInlineReviewProps,
} from "@/components/ConceptNoteWorkspace/draft-document-panel";
import { DraftSetupPanel } from "@/components/ConceptNoteWorkspace/draft-setup-panel";
import { useDraftFocus } from "@/components/ConceptNoteWorkspace/use-draft-focus";

interface DraftTabProps extends DraftInlineReviewProps {
  mutationError: string | null;
  applicationContext: ConceptNoteApplicationContext | null;
  applicationContextFailed: boolean;
  applicationContextLoading: boolean;
  bundle: ConceptNoteBundleProgress;
  contextStatus: ConceptNoteContextPresentation;
  canStartDrafting: boolean;
  draft: ConceptNoteDraftState | null;
  draftError: string | null;
  focusChapterId: string | null;
  focusFindingKey: string | null;
  isDraftRunning: boolean;
  isRetrying: boolean;
  isStartingDraft: boolean;
  lng: string;
  noteName: string;
  onOpenContext: () => void;
  onOpenFundingSetup: () => void;
  onRetry: () => void;
  onStartDrafting: () => void;
}

export function DraftTab(props: DraftTabProps) {
  const { t } = useTranslation(props.lng, "concept-notes");
  const chapters = useMemo(
    () => props.draft?.chapters ?? [],
    [props.draft?.chapters],
  );
  const focus = useDraftFocus(
    chapters,
    props.draft?.current_chapter_id,
    props.focusChapterId,
    props.focusFindingKey,
  );
  const draftStarted = Boolean(
    props.draft &&
    (props.draft.status !== "not_started" ||
      chapters.some((chapter) => chapter.body_markdown?.trim())),
  );

  return (
    <VStack
      align="stretch"
      gap={4}
      h={draftStarted ? "full" : "auto"}
      minH={0}
      p={{ base: 4, md: 6 }}
    >
      {!draftStarted && (
        <Box>
          <Text
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("draft-canvas")}
          </Text>
          <Text mt={1} fontSize="body.sm" color="content.tertiary">
            {props.noteName}
          </Text>
        </Box>
      )}

      {props.mutationError && (
        <Text role="alert" color="sentiment.negativeDefault">
          {props.mutationError}
        </Text>
      )}
      <DraftSetupPanel {...props} />

      {draftStarted && chapters.length > 0 && (
        <DraftDocumentPanel
          {...props}
          chapters={chapters}
          focus={focus}
          focusFindingKey={props.focusFindingKey}
          lng={props.lng}
          noteName={props.noteName}
        />
      )}
    </VStack>
  );
}
