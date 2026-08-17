"use client";

import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuCheck,
  LuCircleAlert,
  LuDatabase,
  LuRefreshCw,
  LuSparkles,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

import type { ConceptNoteBundleProgress } from "../ConceptNoteDashboard/utils";

interface DraftTabProps {
  bundle: ConceptNoteBundleProgress;
  isRetrying: boolean;
  lng: string;
  noteName: string;
  onOpenContext: () => void;
  onRetry: () => void;
}

interface DraftStatusPresentation {
  background: string;
  border: string;
  description: string;
  icon: IconType;
  title: string;
}

export function DraftTab({
  bundle,
  isRetrying,
  lng,
  noteName,
  onOpenContext,
  onRetry,
}: DraftTabProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const isReady = bundle.status === "ready";
  const isBuilding = bundle.status === "building";
  const isFailed = bundle.status === "failed";
  const isThinContext =
    isReady && (bundle.contextMode === "thin" || bundle.readySources === 0);

  let status: DraftStatusPresentation = {
    background: "background.neutral",
    border: "content.link",
    description: t("thin-context-starting-description"),
    icon: LuDatabase,
    title: t("thin-context-starting-title"),
  };

  if (isBuilding) {
    status = {
      background: "background.neutral",
      border: "content.link",
      description: t("building-source-context-description"),
      icon: LuSparkles,
      title: t("building-source-context"),
    };
  } else if (isFailed) {
    status = {
      background: "sentiment.negativeOverlay",
      border: "sentiment.negativeDefault",
      description: t("context-failed-description"),
      icon: LuCircleAlert,
      title: t("context-needs-attention"),
    };
  } else if (isThinContext) {
    status = {
      background: "background.neutral",
      border: "content.link",
      description: t("thin-context-draft-description"),
      icon: LuDatabase,
      title: t("thin-context-ready"),
    };
  } else if (isReady) {
    status = {
      background: "sentiment.positiveOverlay",
      border: "sentiment.positiveDefault",
      description: t("source-context-count", {
        count: bundle.readySources,
      }),
      icon: LuCheck,
      title: t("source-context-assembled"),
    };
  }

  return (
    <VStack align="stretch" gap={4} p={{ base: 4, md: 6 }}>
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
          {noteName}
        </Text>
      </Box>

      <Flex
        align={{ base: "stretch", md: "center" }}
        direction={{ base: "column", md: "row" }}
        gap={4}
        border="1px solid"
        borderColor={status.border}
        borderRadius="rounded"
        bg={status.background}
        p={4}
      >
        <Flex align="start" gap={3} flex={1}>
          <Icon as={status.icon} mt={0.5} color={status.border} />
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
            loading={isRetrying}
            onClick={onRetry}
          >
            <Icon as={LuRefreshCw} />
            {t("retry-context")}
          </Button>
        ) : !isBuilding && !isFailed ? (
          <Button size="sm" variant="outline" onClick={onOpenContext}>
            <Icon as={LuDatabase} />
            {t("review-context")}
          </Button>
        ) : null}
      </Flex>
    </VStack>
  );
}
