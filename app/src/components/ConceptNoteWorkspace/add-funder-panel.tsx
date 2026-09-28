"use client";

import { useState } from "react";

import type { FileUploadFileChangeDetails } from "@chakra-ui/react";
import { Box, Heading, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { LuCheck, LuCircleAlert, LuPencil, LuUpload } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import {
  FileUploadDropzone,
  FileUploadRoot,
} from "@/components/ui/file-upload";
import { useTranslation } from "@/i18n/client";

import { FunderImportStatus } from "./funder-import-status";
import type { FunderImportFlow } from "./use-funder-import";

export const funderOptionButtonProps = {
  borderRadius: "rounded",
  textTransform: "none",
  letterSpacing: "normal",
  _hover: { bg: "background.overlay", opacity: 1 },
  justifyContent: "start",
  alignItems: "start",
  textAlign: "start",
  h: "auto",
  p: 3,
  whiteSpace: "normal",
} as const;

interface AddFunderPanelProps {
  flow: FunderImportFlow;
  lng: string;
  disabled?: boolean;
  onEnterManually: () => void;
  onReview: () => void;
}

/**
 * Right pane of the funding dialog while adding a funder: choose a document
 * or by-hand entry, upload one file and follow the read.
 */
export function AddFunderPanel({
  flow,
  lng,
  disabled,
  onEnterManually,
  onReview,
}: AddFunderPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  // Remount the dropzone after each pick so a rejected file can be replaced.
  const [pickerKey, setPickerKey] = useState(0);
  const [rejected, setRejected] = useState(false);

  function onFileChange(details: FileUploadFileChangeDetails): void {
    setPickerKey((key) => key + 1);
    const file = details.acceptedFiles[0];
    setRejected(!file && details.rejectedFiles.length > 0);
    if (file) void flow.uploadFile(file);
  }

  const options = [
    {
      key: "document",
      icon: LuCheck,
      title: "funder-add-document",
      help: "funder-add-document-help",
      selected: true,
      onClick: undefined,
    },
    {
      key: "manual",
      icon: LuPencil,
      title: "funder-add-manual",
      help: "funder-add-manual-help",
      selected: false,
      onClick: onEnterManually,
    },
  ] as const;
  const errorKey = rejected ? "funder-upload-one-file" : flow.error;

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
      <HStack
        gap={2}
        align="stretch"
        flexDirection={{ base: "column", sm: "row" }}
      >
        {options.map((option) => (
          <Button
            {...funderOptionButtonProps}
            key={option.key}
            variant="outline"
            flex={1}
            gap={3}
            aria-pressed={option.selected}
            borderColor={option.selected ? "content.link" : "border.neutral"}
            disabled={disabled}
            onClick={option.onClick}
          >
            <Icon
              as={option.icon}
              mt={0.5}
              flexShrink={0}
              color="content.link"
            />
            <Box>
              <Text fontSize="body.sm" fontWeight="semibold">
                {t(option.title)}
              </Text>
              <Text
                mt={1}
                fontSize="label.sm"
                fontWeight="normal"
                color="content.tertiary"
              >
                {t(option.help)}
              </Text>
            </Box>
          </Button>
        ))}
      </HStack>

      {flow.phase === "idle" ? (
        <VStack align="stretch" gap={3}>
          <FileUploadRoot
            key={pickerKey}
            maxFiles={1}
            disabled={disabled}
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
                  <Text
                    fontSize="body.sm"
                    fontWeight="semibold"
                    color="content.primary"
                  >
                    {t("funder-upload-drop")}
                  </Text>
                </VStack>
              }
              description={t("funder-upload-limit")}
            />
          </FileUploadRoot>
          <Box
            bg="background.alternativeLight"
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="rounded"
            p={3}
          >
            <Text fontSize="body.sm" fontWeight="semibold">
              {t("funder-upload-best-title")}
            </Text>
            <Text mt={1} fontSize="label.sm" color="content.secondary">
              {t("funder-upload-best-help")}
            </Text>
          </Box>
        </VStack>
      ) : (
        <FunderImportStatus
          flow={flow}
          lng={lng}
          onReview={onReview}
          onEnterManually={onEnterManually}
        />
      )}

      {errorKey && (
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
          <Icon as={LuCircleAlert} mt={0.5} color="sentiment.negativeDefault" />
          <Text fontSize="body.sm" color="content.secondary">
            {t(errorKey)}
          </Text>
        </HStack>
      )}
    </VStack>
  );
}
