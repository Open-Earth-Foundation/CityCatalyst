"use client";

import { Box, Text, VStack } from "@chakra-ui/react";
import { useMemo } from "react";

import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftState,
} from "@/util/types";

import type { ConceptNoteBundleProgress } from "../ConceptNoteDashboard/utils";

import { DraftDocumentPanel } from "./draft-document-panel";
import { DraftSetupPanel } from "./draft-setup-panel";
import { useDraftFocus } from "./use-draft-focus";

interface DraftTabProps {
  applicationContext: ConceptNoteApplicationContext | null;
  applicationContextFailed: boolean;
  applicationContextLoading: boolean;
  bundle: ConceptNoteBundleProgress;
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
    props.draft && props.draft.status !== "not_started",
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

      <DraftSetupPanel {...props} />

      {draftStarted && chapters.length > 0 && (
        <DraftDocumentPanel
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
