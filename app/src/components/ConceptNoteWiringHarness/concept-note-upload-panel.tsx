"use client";

import { useRef } from "react";

import {
  Box,
  Flex,
  HStack,
  Icon,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import {
  FiArrowRight,
  FiCheck,
  FiFileText,
  FiInfo,
  FiRefreshCw,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useTranslation } from "@/i18n/client";

import type { ConceptNoteWiringController } from "./use-concept-note-wiring";
import { formatFileSize, uploadStatusTranslationKey } from "./utils";
import {
  PanelHeading,
  uploadStatusStyles,
  WorkflowPanel,
} from "./concept-note-wiring-ui";

interface ConceptNoteUploadPanelProps {
  controller: ConceptNoteWiringController;
  lng: string;
  reducedMotion: boolean;
}

export function ConceptNoteUploadPanel({
  controller,
  lng,
  reducedMotion,
}: ConceptNoteUploadPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const fileInput = useRef<HTMLInputElement>(null);
  const statusLabel = t(uploadStatusTranslationKey(controller.uploadStatus));
  let statusDetail = t("status-auto-refresh");
  if (controller.uploadStatus === "failed") {
    statusDetail = t("conversion-needs-attention");
  }
  if (controller.uploadStatus === "ready") {
    statusDetail = controller.uploadDetails?.pageCount
      ? t("pages-delivered", {
          count: controller.uploadDetails.pageCount,
        })
      : t("all-pages-delivered");
  }

  let currentStageLabel = statusLabel;
  if (controller.requestStage === "uploading") {
    currentStageLabel = t("storing-source-pdf");
  }
  if (controller.requestStage === "loading") {
    currentStageLabel = t("loading-concept-note");
  }
  if (controller.requestStage === "creating") {
    currentStageLabel = t("creating-durable-run");
  }
  const statusStyles = uploadStatusStyles[controller.uploadStatus ?? "queued"];

  return (
    <WorkflowPanel elevated>
      <PanelHeading
        step="03"
        eyebrow={t("your-file")}
        title={t("upload-one-pdf")}
      />

      <Field label={t("source-label")}>
        <Input
          value={controller.sourceLabel}
          maxLength={255}
          disabled={controller.isBusy || Boolean(controller.uploadId)}
          bg="base.light"
          borderColor="border.neutral"
          onChange={(event) => controller.setSourceLabel(event.target.value)}
        />
      </Field>

      {!controller.selectedFile ? (
        <VStack
          gap={3}
          border="1px dashed"
          borderColor={
            controller.isDragging ? "content.link" : "border.neutral"
          }
          borderRadius="rounded"
          bg={
            controller.isDragging
              ? "background.neutral"
              : "background.alternativeLight"
          }
          p={6}
          textAlign="center"
          transition={
            reducedMotion
              ? "none"
              : "background-color 160ms ease, border-color 160ms ease"
          }
          onDragEnter={(event) => {
            event.preventDefault();
            controller.setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => controller.setIsDragging(false)}
          onDrop={controller.onDrop}
        >
          <Icon as={FiUploadCloud} boxSize={6} color="content.link" />
          <Box>
            <Text
              fontSize="body.sm"
              fontWeight="semibold"
              color="content.primary"
            >
              {t("drop-pdf")}
            </Text>
            <Text mt={1} fontSize="label.sm" color="content.tertiary">
              {t("choose-file-help")}
            </Text>
          </Box>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInput.current?.click()}
          >
            {t("choose-pdf")}
          </Button>
          <Input
            ref={fileInput}
            display="none"
            type="file"
            accept="application/pdf,.pdf,text/markdown,text/plain,text/x-markdown,.md"
            aria-label={t("choose-pdf")}
            onChange={controller.onFileChange}
          />
        </VStack>
      ) : (
        <HStack
          align="start"
          gap={3}
          border="1px solid"
          borderColor="border.neutral"
          borderRadius="rounded"
          bg="background.alternativeLight"
          p={4}
        >
          <Flex
            boxSize="36px"
            flexShrink={0}
            align="center"
            justify="center"
            borderRadius="rounded"
            bg="background.neutral"
            color="content.link"
          >
            <Icon as={FiFileText} />
          </Flex>
          <Box minW={0} flex={1}>
            <Text
              overflow="hidden"
              fontSize="body.sm"
              fontWeight="semibold"
              color="content.primary"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
            >
              {controller.selectedFile.name}
            </Text>
            <Text mt={1} fontSize="label.sm" color="content.tertiary">
              {formatFileSize(controller.selectedFile.size)} ·{" "}
              {controller.sourceLabel}
            </Text>
            {controller.uploadId && (
              <Text
                as="code"
                display="block"
                overflow="hidden"
                mt={2}
                fontSize="label.sm"
                color="content.secondary"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {controller.uploadId}
              </Text>
            )}
          </Box>
          {!controller.uploadId && !controller.isBusy && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={t("remove-selected-pdf")}
              onClick={() => void controller.chooseFile(null)}
            >
              <Icon as={FiX} />
            </Button>
          )}
        </HStack>
      )}

      {(controller.uploadStatus || controller.isBusy) && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <HStack
            align="start"
            gap={3}
            border="1px solid"
            borderColor={statusStyles.color}
            borderRadius="rounded"
            bg={statusStyles.surface}
            p={4}
          >
            {controller.requestStage !== "idle" ? (
              <Spinner size="sm" mt={0.5} color={statusStyles.color} />
            ) : (
              <Box
                boxSize="8px"
                mt={1.5}
                borderRadius="full"
                bg={statusStyles.color}
              />
            )}
            <Box>
              <Text
                fontSize="body.sm"
                fontWeight="semibold"
                color="content.primary"
              >
                {currentStageLabel}
              </Text>
              <Text mt={0.5} fontSize="label.sm" color="content.tertiary">
                {statusDetail}
              </Text>
            </Box>
          </HStack>
        </motion.div>
      )}

      {controller.error && (
        <HStack
          align="start"
          gap={3}
          role="alert"
          borderLeft="3px solid"
          borderLeftColor="sentiment.negativeDefault"
          borderRadius="minimal"
          bg="sentiment.negativeOverlay"
          p={4}
        >
          <Icon as={FiInfo} mt={0.5} color="sentiment.negativeDefault" />
          <Text fontSize="body.sm" color="content.secondary">
            {controller.error}
          </Text>
        </HStack>
      )}

      {controller.uploadStatus === "failed" && controller.uploadId ? (
        <Button
          type="button"
          variant="solid"
          loading={controller.isBusy}
          onClick={() => void controller.retryUpload()}
        >
          <Icon as={FiRefreshCw} />
          {t("retry-conversion")}
        </Button>
      ) : controller.uploadStatus === "ready" ? (
        <Button type="button" variant="solid" onClick={controller.completeFlow}>
          <Icon as={FiCheck} />
          {t("wiring-flow-ready")}
        </Button>
      ) : (
        <Button
          type="submit"
          variant="solid"
          loading={controller.isBusy}
          loadingText={t("working")}
          disabled={Boolean(controller.uploadId)}
        >
          {controller.runId
            ? t("upload-and-continue")
            : t("create-run-and-convert")}
          <Icon as={FiArrowRight} />
        </Button>
      )}
    </WorkflowPanel>
  );
}
