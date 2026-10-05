"use client";

import { useState } from "react";
import type { FileUploadFileChangeDetails } from "@chakra-ui/react";
import { Box, Flex, Heading, Icon, Text, VStack } from "@chakra-ui/react";
import { LuCircleAlert, LuFile, LuRefreshCw, LuUpload } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import {
  FileUploadDropzone,
  FileUploadRoot,
} from "@/components/ui/file-upload";
import { useTranslation } from "@/i18n/client";

import { ContextStatusBadge } from "./context-status-badge";
import type { FunderImportFlow, FunderImportPhase } from "./use-funder-import";

/** Status line key for each import phase, shared with the rail entry. */
export function funderImportPhaseLabelKey(phase: FunderImportPhase): string {
  switch (phase) {
    case "uploading":
      return "funder-import-uploading";
    case "converting":
      return "status-converting";
    case "reading":
      return "funder-import-reading";
    case "ready":
      return "funder-import-ready";
    case "failed":
      return "funder-import-failed";
    default:
      return "funder-add-entry-help";
  }
}

interface AddFunderPanelProps {
  flow: FunderImportFlow;
  lng: string;
  onEnterManually: () => void;
  onReview: () => void;
}

/**
 * Right pane of the funding dialog before the form: upload one funder
 * document and follow its read, or switch to entering details by hand.
 */
export function AddFunderPanel({
  flow,
  lng,
  onEnterManually,
  onReview,
}: AddFunderPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  // Remount the dropzone after each pick so a rejected file can be replaced.
  const [pickerKey, setPickerKey] = useState(0);
  const { phase } = flow;
  const working =
    phase === "uploading" || phase === "converting" || phase === "reading";

  function onFileChange(details: FileUploadFileChangeDetails): void {
    setPickerKey((key) => key + 1);
    // A rejected file still goes through validation so the user sees why.
    const file =
      details.acceptedFiles[0] ?? details.rejectedFiles[0]?.file ?? null;
    if (file) void flow.uploadFile(file);
  }

  return (
    <VStack align="stretch" gap={5} data-testid="add-funder-panel">
      <Box>
        <Heading as="h3" fontSize="title.md">
          {t("funder-add-title")}
        </Heading>
        <Text mt={1} fontSize="body.sm" color="content.secondary">
          {t("funder-add-description")}
        </Text>
      </Box>

      {phase === "idle" ? (
        <FileUploadRoot
          key={pickerKey}
          maxFiles={1}
          inputProps={{
            accept:
              "application/pdf,.pdf,text/markdown,text/plain,text/x-markdown,.md",
            "aria-label": t("funder-upload-label"),
          }}
          onFileChange={onFileChange}
        >
          <FileUploadDropzone
            minH="116px"
            border="1px dashed"
            borderColor="border.neutral"
            borderRadius="rounded"
            bg="base.light"
            cursor="pointer"
            label={
              <VStack gap={2}>
                <Icon as={LuUpload} boxSize={5} color="content.link" />
                <Text fontSize="body.sm" fontWeight="semibold">
                  {t("funder-upload-drop")}
                </Text>
              </VStack>
            }
            description={t("funder-upload-limit")}
          />
        </FileUploadRoot>
      ) : (
        <Flex
          align="center"
          gap={3}
          border="1px solid"
          borderColor="border.neutral"
          borderRadius="rounded"
          bg="base.light"
          px={3}
          py={2.5}
          data-testid="funder-import-status"
        >
          <Icon as={LuFile} color="content.tertiary" flexShrink={0} />
          <Box minW={0} flex={1}>
            <Text truncate fontSize="body.sm">
              {flow.filename}
            </Text>
            <Text fontSize="label.sm" color="content.tertiary" role="status">
              {flow.pageCount
                ? `${t(funderImportPhaseLabelKey(phase))} · ${t("pages-count", { count: flow.pageCount })}`
                : t(funderImportPhaseLabelKey(phase))}
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
            tone={
              phase === "failed"
                ? "warning"
                : phase === "ready"
                  ? "positive"
                  : "neutral"
            }
          />
          {flow.canRetry && (
            <Button
              size="xs"
              variant="outline"
              loading={flow.busy}
              onClick={() => void flow.retry()}
            >
              <Icon as={LuRefreshCw} />
              {t("retry")}
            </Button>
          )}
        </Flex>
      )}

      {working && (
        <Text fontSize="label.sm" color="content.tertiary">
          {t("funder-import-processing-help")}
        </Text>
      )}

      {flow.error && (
        <Flex
          role="alert"
          align="start"
          gap={2}
          border="1px solid"
          borderColor="sentiment.negativeDefault"
          borderRadius="rounded"
          bg="sentiment.negativeOverlay"
          p={3}
        >
          <Icon as={LuCircleAlert} mt={0.5} color="sentiment.negativeDefault" />
          <Text fontSize="body.sm" color="content.secondary">
            {t(flow.error)}
          </Text>
        </Flex>
      )}

      <Flex gap={2} flexWrap="wrap" justify="end">
        {phase === "failed" && (
          <Button size="sm" variant="outline" onClick={flow.chooseAnotherFile}>
            {t("funder-upload-different-file")}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onEnterManually}>
          {t("funder-add-manual")}
        </Button>
        {phase === "ready" && (
          <Button size="sm" onClick={onReview}>
            {t("funder-review-details")}
          </Button>
        )}
      </Flex>
    </VStack>
  );
}
