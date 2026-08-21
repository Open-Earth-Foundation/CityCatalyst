"use client";

import { useMemo, useState } from "react";

import { Box, Flex, Grid, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import {
  LuCheck,
  LuCircleAlert,
  LuDownload,
  LuFileText,
  LuInfo,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/client";
import type { ConceptNoteDraftState } from "@/util/types";

import {
  canExportConceptNote,
  countUnresolvedExportItems,
  exportConceptNote,
  type ConceptNoteExportFormat,
} from "./concept-note-export";

interface ExportDialogProps {
  draft: ConceptNoteDraftState | null;
  hasUploadedEvidence: boolean;
  lng: string;
  noteName: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ExportDialog({
  draft,
  hasUploadedEvidence,
  lng,
  noteName,
  onOpenChange,
  open,
}: ExportDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [acceptedMissingInformation, setAcceptedMissingInformation] =
    useState(false);
  const [exportError, setExportError] = useState(false);
  const [exportingFormat, setExportingFormat] =
    useState<ConceptNoteExportFormat | null>(null);
  const chapters = useMemo(() => draft?.chapters ?? [], [draft?.chapters]);
  const unresolvedCount = useMemo(
    () => countUnresolvedExportItems(chapters),
    [chapters],
  );
  const hasExportableDraft = chapters.some((chapter) =>
    Boolean(chapter.body_markdown?.trim()),
  );
  const canExport =
    canExportConceptNote(chapters, acceptedMissingInformation) &&
    !exportingFormat;

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setAcceptedMissingInformation(false);
      setExportError(false);
      setExportingFormat(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleExport(format: ConceptNoteExportFormat): Promise<void> {
    if (!canExport) {
      return;
    }

    setExportError(false);
    setExportingFormat(format);
    try {
      await exportConceptNote(format, noteName, chapters);
    } catch {
      setExportError(true);
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(details) => handleOpenChange(details.open)}
      size="lg"
    >
      <DialogContent
        maxW="640px"
        maxH="calc(100dvh - 32px)"
        my={4}
        overflow="hidden"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="12dp"
      >
        <DialogHeader
          display="block"
          borderBottom="1px solid"
          borderColor="border.neutral"
          px={6}
          py={5}
          pe={12}
        >
          <DialogTitle
            fontFamily="heading"
            fontSize="title.lg"
            color="content.primary"
          >
            {t("export-concept-note")}
          </DialogTitle>
          <Text mt={1} fontSize="body.sm" color="content.tertiary">
            {t("export-description")}
          </Text>
        </DialogHeader>
        <DialogCloseTrigger aria-label={t("close")} />

        <DialogBody minH={0} overflowY="auto" px={6} py={5}>
          <VStack align="stretch" gap={5}>
            <Box>
              <Text
                mb={3}
                fontFamily="heading"
                fontSize="overline"
                fontWeight="semibold"
                letterSpacing="widest"
                color="content.tertiary"
                textTransform="uppercase"
              >
                {t("preflight-checks")}
              </Text>
              <VStack align="stretch" gap={2}>
                <HStack
                  gap={3}
                  border="1px solid"
                  borderColor={
                    hasUploadedEvidence
                      ? "sentiment.positiveDefault"
                      : "sentiment.warningDefault"
                  }
                  borderRadius="rounded"
                  bg={
                    hasUploadedEvidence
                      ? "sentiment.positiveOverlay"
                      : "sentiment.warningOverlay"
                  }
                  p={3}
                >
                  <Icon
                    as={hasUploadedEvidence ? LuCheck : LuCircleAlert}
                    color={
                      hasUploadedEvidence
                        ? "sentiment.positiveDefault"
                        : "sentiment.warningDefault"
                    }
                  />
                  <Box flex={1}>
                    <Text
                      fontSize="body.sm"
                      fontWeight="semibold"
                      color="content.primary"
                    >
                      {hasUploadedEvidence
                        ? t("source-context-ready")
                        : t("source-context-recommended")}
                    </Text>
                    <Text fontSize="label.sm" color="content.secondary">
                      {hasUploadedEvidence
                        ? t("source-context-ready-export")
                        : t("source-context-recommended-export")}
                    </Text>
                  </Box>
                </HStack>
                <HStack
                  align="start"
                  gap={3}
                  border="1px solid"
                  borderColor={
                    hasExportableDraft && unresolvedCount === 0
                      ? "sentiment.positiveDefault"
                      : "sentiment.warningDefault"
                  }
                  borderRadius="rounded"
                  bg={
                    hasExportableDraft && unresolvedCount === 0
                      ? "sentiment.positiveOverlay"
                      : "sentiment.warningOverlay"
                  }
                  p={3}
                >
                  <Icon
                    as={
                      hasExportableDraft && unresolvedCount === 0
                        ? LuCheck
                        : LuCircleAlert
                    }
                    mt={0.5}
                    color={
                      hasExportableDraft && unresolvedCount === 0
                        ? "sentiment.positiveDefault"
                        : "sentiment.warningDefault"
                    }
                  />
                  <Box flex={1}>
                    <Text
                      fontSize="body.sm"
                      fontWeight="semibold"
                      color="content.primary"
                    >
                      {!hasExportableDraft
                        ? t("draft-preflight-empty")
                        : unresolvedCount > 0
                          ? t("draft-preflight-warning")
                          : t("draft-preflight-ready")}
                    </Text>
                    <Text fontSize="label.sm" color="content.secondary">
                      {!hasExportableDraft
                        ? t("draft-preflight-empty-description")
                        : unresolvedCount > 0
                          ? t("draft-preflight-warning-description", {
                              count: unresolvedCount,
                            })
                          : t("draft-preflight-ready-description")}
                    </Text>
                    {hasExportableDraft && unresolvedCount > 0 && (
                      <Checkbox
                        mt={3}
                        alignItems="start"
                        checked={acceptedMissingInformation}
                        onCheckedChange={(details) =>
                          setAcceptedMissingInformation(
                            details.checked === true,
                          )
                        }
                      >
                        <Text
                          fontSize="label.sm"
                          lineHeight="20px"
                          color="content.primary"
                        >
                          {t("missing-information-export-confirmation", {
                            count: unresolvedCount,
                          })}
                        </Text>
                      </Checkbox>
                    )}
                  </Box>
                </HStack>
              </VStack>
            </Box>

            <Box>
              <Text
                mb={3}
                fontFamily="heading"
                fontSize="overline"
                fontWeight="semibold"
                letterSpacing="widest"
                color="content.tertiary"
                textTransform="uppercase"
              >
                {t("export-formats")}
              </Text>
              <Grid
                gap={3}
                gridTemplateColumns={{
                  base: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                }}
              >
                {(
                  [
                    {
                      format: "docx",
                      label: "DOCX",
                      description: t("docx-description"),
                    },
                    {
                      format: "pdf",
                      label: "PDF",
                      description: t("pdf-description"),
                    },
                  ] satisfies Array<{
                    description: string;
                    format: ConceptNoteExportFormat;
                    label: string;
                  }>
                ).map((item) => (
                  <VStack
                    key={item.format}
                    align="stretch"
                    gap={3}
                    border="1px solid"
                    borderColor="border.neutral"
                    borderRadius="rounded"
                    bg="background.alternativeLight"
                    p={4}
                  >
                    <Flex align="center" gap={3}>
                      <Flex
                        boxSize="36px"
                        align="center"
                        justify="center"
                        borderRadius="rounded"
                        bg="base.light"
                        color="content.link"
                      >
                        <Icon as={LuFileText} />
                      </Flex>
                      <Box>
                        <Text
                          fontFamily="heading"
                          fontSize="body.sm"
                          fontWeight="semibold"
                          color="content.primary"
                        >
                          {item.label}
                        </Text>
                        <Text fontSize="label.sm" color="content.tertiary">
                          {item.description}
                        </Text>
                      </Box>
                    </Flex>
                    <Button
                      disabled={!canExport}
                      loading={exportingFormat === item.format}
                      size="sm"
                      variant="outline"
                      onClick={() => void handleExport(item.format)}
                    >
                      <Icon as={LuDownload} />
                      {t("export-format", { format: item.label })}
                    </Button>
                  </VStack>
                ))}
              </Grid>
            </Box>

            {exportError && (
              <HStack
                role="alert"
                align="start"
                gap={2}
                color="sentiment.negativeDefault"
              >
                <Icon as={LuCircleAlert} mt={0.5} />
                <Text fontSize="label.sm">{t("export-failed")}</Text>
              </HStack>
            )}

            <HStack
              align="start"
              gap={2}
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="background.neutral"
              p={3}
            >
              <Icon as={LuInfo} mt={0.5} color="content.link" />
              <Text
                fontSize="label.sm"
                lineHeight="20px"
                color="content.secondary"
              >
                {t("export-backend-note")}
              </Text>
            </HStack>
          </VStack>
        </DialogBody>

        <DialogFooter
          gap={3}
          borderTop="1px solid"
          borderColor="border.neutral"
          px={6}
          py={4}
        >
          <Button
            variant="ghost"
            color="content.link"
            _hover={{ color: "content.link" }}
            onClick={() => handleOpenChange(false)}
          >
            {t("go-back")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
