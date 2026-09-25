"use client";

import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { LuSparkles } from "react-icons/lu";

import type { ConceptNoteContextChange } from "@/components/ConceptNoteDashboard/utils";
import { useTranslation } from "@/i18n/client";

import { ReviewButton as Button } from "./review-button";

interface ContextChangesNoticeProps {
  /** Identifies the rebuild, so each set of changes is announced once. */
  buildId: string | null;
  changes: ConceptNoteContextChange[];
  lng: string;
  onOpenContext: () => void;
  runId: string;
}

function seenKey(runId: string): string {
  return `concept-note-context-changes-seen:${runId}`;
}

/** Tell the user which city sources a background rebuild added or replaced. */
export function ContextChangesNotice({
  buildId,
  changes,
  lng,
  onOpenContext,
  runId,
}: ContextChangesNoticeProps) {
  const { t } = useTranslation(lng, "concept-notes");
  // The workspace renders on the client once run data loads.
  const [seenBuildId, setSeenBuildId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(seenKey(runId)),
  );

  if (!buildId || changes.length === 0 || seenBuildId === buildId) {
    return null;
  }

  function dismiss(): void {
    window.localStorage.setItem(seenKey(runId), buildId!);
    setSeenBuildId(buildId);
  }

  const hasNewContext = changes.some((change) => change.change !== "removed");

  return (
    <Flex
      align="start"
      gap={3}
      border="1px solid"
      borderColor="interactive.secondary"
      borderRadius="rounded"
      bg="background.alternativeLight"
      p={4}
      role="status"
    >
      <Icon as={LuSparkles} mt={0.5} color="interactive.secondary" />
      <Box flex={1}>
        <Text
          fontFamily="heading"
          fontSize="body.sm"
          fontWeight="semibold"
          color="content.primary"
        >
          {t(hasNewContext ? "context-changes-title" : "context-updated-title")}
        </Text>
        <VStack as="ul" align="stretch" gap={0.5} mt={1} pl={4}>
          {changes.map((change) => (
            <Text
              as="li"
              key={`${change.source}-${change.change}`}
              fontSize="label.sm"
              lineHeight="20px"
              color="content.secondary"
            >
              {t(`context-change-${change.source}-${change.change}`, {
                year: change.inventoryYear ?? "",
              })}
            </Text>
          ))}
        </VStack>
        <Flex gap={2} mt={3}>
          <Button size="xs" variant="outline" onClick={onOpenContext}>
            {t("context-changes-review")}
          </Button>
          <Button size="xs" variant="ghost" onClick={dismiss}>
            {t("context-changes-dismiss")}
          </Button>
        </Flex>
      </Box>
    </Flex>
  );
}
