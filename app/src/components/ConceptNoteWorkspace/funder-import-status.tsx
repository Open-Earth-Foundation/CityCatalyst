"use client";

import { Box, Flex, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import {
  LuCheck,
  LuCircle,
  LuCircleAlert,
  LuCircleDot,
  LuFile,
  LuRefreshCw,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

import {
  ContextStatusBadge,
  toneColor,
  type ContextTone,
} from "./context-status-badge";
import type { FunderImportFlow, FunderImportPhase } from "./use-funder-import";

const phaseTone: Record<FunderImportPhase, ContextTone> = {
  idle: "neutral",
  uploading: "neutral",
  converting: "neutral",
  reading: "neutral",
  ready: "positive",
  failed: "negative",
};

/** Status line key for each phase, shared with the Context tab card. */
export function funderImportPhaseLabelKey(phase: FunderImportPhase): string {
  switch (phase) {
    case "uploading":
      return "funder-import-uploading";
    case "converting":
      return "status-converting";
    case "reading":
      return "funder-import-reading";
    case "ready":
      return "status-ready";
    case "failed":
      return "status-failed";
    default:
      return "status-not-started";
  }
}

interface FunderImportStatusProps {
  flow: FunderImportFlow;
  lng: string;
  onReview: () => void;
  onEnterManually: () => void;
}

/**
 * The document row, stages and outcome of reading a funder document; the row
 * matches the Context tab "Your files" list.
 */
export function FunderImportStatus({
  flow,
  lng,
  onReview,
  onEnterManually,
}: FunderImportStatusProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const { phase, failure } = flow;
  const tone = phaseTone[phase];
  const label = t(funderImportPhaseLabelKey(phase));
  const missingCount = flow.funderImport?.draft?.missing.length ?? 0;
  const stageIndex =
    phase === "uploading" || phase === "converting"
      ? 0
      : phase === "reading"
        ? 1
        : phase === "ready"
          ? 3
          : failure?.kind === "upload"
            ? 0
            : 1;
  const stages = [
    "funder-import-stage-convert",
    "funder-import-stage-read",
    "funder-import-stage-ready",
  ];

  return (
    <VStack align="stretch" gap={4} data-testid="funder-import-status">
      <Flex
        align="center"
        gap={3}
        border="1px solid"
        borderColor="border.neutral"
        borderRadius="rounded"
        bg="base.light"
        px={3}
        py={2.5}
      >
        <Box
          boxSize="7px"
          flexShrink={0}
          borderRadius="full"
          bg={
            phase === "failed"
              ? toneColor(tone)
              : phase === "ready"
                ? toneColor(tone)
                : "content.link"
          }
        />
        <Icon as={LuFile} color="content.tertiary" flexShrink={0} />
        <Box minW={0} flex={1}>
          <Text truncate fontSize="body.sm" color="content.primary">
            {flow.filename}
          </Text>
          <Text fontSize="10px" color="content.tertiary">
            {flow.pageCount
              ? `${label} · ${t("pages-count", { count: flow.pageCount })}`
              : label}
          </Text>
        </Box>
        <ContextStatusBadge
          label={t(
            phase === "failed"
              ? "status-failed"
              : phase === "ready"
                ? "status-ready"
                : "status-processing",
          )}
          tone={tone}
        />
        {failure?.canRetry && (
          <Button
            size="xs"
            variant="outline"
            loading={flow.retrying}
            onClick={() => void flow.retry()}
          >
            <Icon as={LuRefreshCw} />
            {t("retry")}
          </Button>
        )}
      </Flex>

      {phase !== "failed" && (
        <HStack
          as="ol"
          gap={4}
          flexWrap="wrap"
          listStyleType="none"
          m={0}
          p={0}
          aria-label={t("funder-import-stages")}
        >
          {stages.map((key, index) => {
            const done = index < stageIndex;
            const current = index === stageIndex;
            return (
              <HStack
                as="li"
                key={key}
                gap={1.5}
                fontSize="label.sm"
                color={done || current ? "content.primary" : "content.tertiary"}
                aria-current={current ? "step" : undefined}
              >
                <Icon
                  as={done ? LuCheck : current ? LuCircleDot : LuCircle}
                  color={
                    done
                      ? "sentiment.positiveDefault"
                      : current
                        ? "content.link"
                        : "content.tertiary"
                  }
                  boxSize={3.5}
                />
                <Text as="span" fontWeight={current ? "semibold" : "normal"}>
                  {t(key)}
                </Text>
              </HStack>
            );
          })}
        </HStack>
      )}

      {(phase === "uploading" ||
        phase === "converting" ||
        phase === "reading") && (
        <Text fontSize="label.sm" color="content.tertiary" role="status">
          {t("funder-import-processing-help")}
        </Text>
      )}

      {phase === "failed" && failure && (
        <VStack align="stretch" gap={3}>
          <HStack
            role="alert"
            align="start"
            gap={2}
            border="1px solid"
            borderColor="sentiment.negativeDefault"
            borderRadius="rounded"
            bg="sentiment.negativeOverlay"
            p={3}
          >
            <Icon
              as={LuCircleAlert}
              mt={0.5}
              color="sentiment.negativeDefault"
            />
            <Box>
              <Text
                fontSize="body.sm"
                fontWeight="semibold"
                color="content.primary"
              >
                {t(
                  failure.kind === "upload"
                    ? "funder-upload-failed-title"
                    : "funder-import-failed-title",
                )}
              </Text>
              <Text mt={1} fontSize="body.sm" color="content.secondary">
                {t(failure.messageKey)}
              </Text>
            </Box>
          </HStack>
          <HStack gap={2} flexWrap="wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={flow.chooseAnotherFile}
            >
              {t("funder-upload-different-file")}
            </Button>
            <Button size="sm" variant="outline" onClick={onEnterManually}>
              {t("funder-add-manual")}
            </Button>
          </HStack>
        </VStack>
      )}

      {phase === "ready" && (
        <VStack align="stretch" gap={3}>
          {missingCount > 0 && (
            <Box bg="sentiment.warningOverlay" p={3} borderRadius="rounded">
              <Text fontSize="body.sm" fontWeight="semibold">
                {t("funder-import-missing-title", { count: missingCount })}
              </Text>
              <Text mt={1} fontSize="body.sm" color="content.secondary">
                {t("funder-import-missing-help")}
              </Text>
            </Box>
          )}
          <Flex justify="end">
            <Button size="sm" onClick={onReview}>
              {t("funder-review-details")}
            </Button>
          </Flex>
        </VStack>
      )}
    </VStack>
  );
}
