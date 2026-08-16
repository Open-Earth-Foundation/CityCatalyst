"use client";

import type { ChangeEvent } from "react";
import { useRef } from "react";

import { Box, Flex, Grid, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import {
  LuBuilding2,
  LuCheck,
  LuCircleAlert,
  LuDatabase,
  LuFileText,
  LuFolderOpen,
  LuLandmark,
  LuRefreshCw,
  LuSearch,
  LuShieldAlert,
  LuUpload,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import type { ConceptNoteUploadResponse } from "@/util/types";

import type { ConceptNoteBundleProgress } from "../ConceptNoteDashboard/utils";
import { uploadStatusTranslationKey } from "../ConceptNoteWiringHarness/utils";

interface ContextTabProps {
  bundle: ConceptNoteBundleProgress;
  cityFilesCount: number;
  cityName: string;
  country: string | null;
  firstCityFile: string | null;
  inventoryYear: number | null;
  isRetryingBundle: boolean;
  isRetryingUpload: boolean;
  isUploading: boolean;
  lng: string;
  onRetryBundle: () => void;
  onRetryUpload: () => void;
  onUploadFile: (file: File) => Promise<void>;
  populationLabel: string;
  projectName: string | null;
  upload: ConceptNoteUploadResponse | null;
  uploadError: string | null;
}

interface ContextRowProps {
  detail: string;
  icon: typeof LuDatabase;
  label: string;
  status: string;
  tone?: "positive" | "neutral" | "warning";
}

function ContextRow({
  detail,
  icon,
  label,
  status,
  tone = "neutral",
}: ContextRowProps) {
  const toneColor =
    tone === "positive"
      ? "sentiment.positiveDefault"
      : tone === "warning"
        ? "sentiment.warningDefault"
        : "content.tertiary";

  return (
    <Flex
      align="center"
      gap={3}
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      px={3}
      py={3}
    >
      <Flex
        boxSize="34px"
        align="center"
        justify="center"
        flexShrink={0}
        borderRadius="rounded"
        bg="background.alternativeLight"
        color="content.link"
      >
        <Icon as={icon} />
      </Flex>
      <Box minW={0} flex={1}>
        <Text
          fontFamily="heading"
          fontSize="body.sm"
          fontWeight="semibold"
          color="content.primary"
        >
          {label}
        </Text>
        <Text truncate fontSize="label.sm" color="content.tertiary">
          {detail}
        </Text>
      </Box>
      <HStack gap={1.5} flexShrink={0}>
        <Box boxSize="6px" borderRadius="full" bg={toneColor} />
        <Text fontSize="label.sm" color="content.secondary">
          {status}
        </Text>
      </HStack>
    </Flex>
  );
}

export function ContextTab({
  bundle,
  cityFilesCount,
  cityName,
  country,
  firstCityFile,
  inventoryYear,
  isRetryingBundle,
  isRetryingUpload,
  isUploading,
  lng,
  onRetryBundle,
  onRetryUpload,
  onUploadFile,
  populationLabel,
  projectName,
  upload,
  uploadError,
}: ContextTabProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ghgiIncluded = ["available", "partial", "included"].includes(
    bundle.ghgiStatus ?? "",
  );
  const hiapIncluded = ["available", "partial", "included"].includes(
    bundle.hiapStatus ?? "",
  );

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      void onUploadFile(file);
    }
    event.target.value = "";
  }

  return (
    <VStack align="stretch" gap={6} p={{ base: 4, md: 6 }}>
      <Box>
        <Text
          fontFamily="heading"
          fontSize="title.md"
          fontWeight="semibold"
          color="content.primary"
        >
          {t("context-tab-title")}
        </Text>
        <Text
          mt={1}
          fontSize="body.sm"
          lineHeight="22px"
          color="content.tertiary"
        >
          {t("context-tab-description")}
        </Text>
      </Box>

      <Box
        border="1px solid"
        borderColor="border.neutral"
        borderRadius="rounded"
        bg="background.alternativeLight"
        p={4}
      >
        <Flex align="start" gap={3}>
          <Icon as={LuDatabase} mt={0.5} color="content.link" />
          <Box flex={1}>
            <Text
              fontFamily="heading"
              fontSize="body.sm"
              fontWeight="semibold"
              color="content.primary"
            >
              {t("run-context-boundary")}
            </Text>
            <Text
              mt={1}
              fontSize="label.sm"
              lineHeight="20px"
              color="content.secondary"
            >
              {t("run-context-boundary-description")}
            </Text>
          </Box>
        </Flex>
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
          {t("citycatalyst-context")}
        </Text>
        <Grid
          gap={2}
          gridTemplateColumns={{ base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }}
        >
          <ContextRow
            icon={LuBuilding2}
            label={t("city-profile")}
            detail={[cityName, country, populationLabel]
              .filter(Boolean)
              .join(" · ")}
            status={t("connected")}
            tone="positive"
          />
          <ContextRow
            icon={LuLandmark}
            label={t("ghg-inventory")}
            detail={
              inventoryYear
                ? t("inventory-year", { year: inventoryYear })
                : t("no-inventory")
            }
            status={ghgiIncluded ? t("included-in-run") : t("available-to-run")}
            tone={ghgiIncluded ? "positive" : "neutral"}
          />
          <ContextRow
            icon={LuShieldAlert}
            label={t("climate-risk-assessment")}
            detail={t("ccra-not-in-bundle")}
            status={t("not-connected")}
            tone="warning"
          />
          <ContextRow
            icon={LuCheck}
            label={t("hiap-context")}
            detail={
              bundle.hiapStatus
                ? t("hiap-bundle-status", { status: bundle.hiapStatus })
                : t("hiap-optional")
            }
            status={hiapIncluded ? t("included-in-run") : t("optional")}
            tone={hiapIncluded ? "positive" : "neutral"}
          />
        </Grid>
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
          {t("application-context")}
        </Text>
        <Grid
          gap={2}
          gridTemplateColumns={{ base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }}
        >
          <ContextRow
            icon={LuLandmark}
            label={t("city-project")}
            detail={projectName || t("no-project-linked")}
            status={projectName ? t("connected") : t("optional")}
            tone={projectName ? "positive" : "neutral"}
          />
          <ContextRow
            icon={LuSearch}
            label={t("funder-and-similar-projects")}
            detail={t("research-context-not-wired")}
            status={t("not-connected")}
            tone="warning"
          />
        </Grid>
      </Box>

      <Box>
        <Flex align="center" justify="space-between" gap={3} mb={3}>
          <Box>
            <Text
              fontFamily="heading"
              fontSize="overline"
              fontWeight="semibold"
              letterSpacing="widest"
              color="content.tertiary"
              textTransform="uppercase"
            >
              {t("source-files")}
            </Text>
            <Text mt={1} fontSize="label.sm" color="content.tertiary">
              {t("source-files-description")}
            </Text>
          </Box>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={onFileChange}
          />
          <Button
            size="sm"
            variant="solid"
            loading={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon as={LuUpload} />
            {t("upload-pdf")}
          </Button>
        </Flex>

        <VStack align="stretch" gap={2}>
          {upload ? (
            <Flex
              align="center"
              gap={3}
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="base.light"
              p={3}
            >
              <Icon as={LuFileText} color="content.link" />
              <Box minW={0} flex={1}>
                <Text truncate fontSize="body.sm" color="content.primary">
                  {upload.filename || t("recent-run-upload")}
                </Text>
                <Text fontSize="label.sm" color="content.tertiary">
                  {t(uploadStatusTranslationKey(upload.status))}
                  {upload.pageCount
                    ? ` · ${t("pages-count", { count: upload.pageCount })}`
                    : ""}
                </Text>
              </Box>
              {upload.status === "failed" && upload.canRetry && (
                <Button
                  size="xs"
                  variant="outline"
                  loading={isRetryingUpload}
                  onClick={onRetryUpload}
                >
                  <Icon as={LuRefreshCw} />
                  {t("retry")}
                </Button>
              )}
            </Flex>
          ) : (
            <Flex
              align="center"
              gap={3}
              border="1px dashed"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="base.light"
              p={4}
            >
              <Icon as={LuFolderOpen} color="content.link" />
              <Box>
                <Text fontSize="body.sm" color="content.primary">
                  {bundle.readySources
                    ? t("ready-run-sources", { count: bundle.readySources })
                    : t("no-run-sources")}
                </Text>
                <Text mt={1} fontSize="label.sm" color="content.tertiary">
                  {firstCityFile
                    ? t("city-files-available", {
                        count: cityFilesCount,
                        file: firstCityFile,
                      })
                    : t("upload-source-help")}
                </Text>
              </Box>
            </Flex>
          )}

          {uploadError && (
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
              <Text fontSize="body.sm" color="content.secondary">
                {uploadError}
              </Text>
            </HStack>
          )}
        </VStack>
      </Box>

      {bundle.status === "failed" && bundle.retryable && (
        <Box
          border="1px solid"
          borderColor="sentiment.warningDefault"
          borderRadius="rounded"
          bg="sentiment.warningOverlay"
          p={4}
        >
          <Flex
            align={{ base: "start", sm: "center" }}
            direction={{ base: "column", sm: "row" }}
            gap={3}
          >
            <Box flex={1}>
              <Text
                fontFamily="heading"
                fontSize="body.sm"
                fontWeight="semibold"
                color="content.primary"
              >
                {t("context-retry-title")}
              </Text>
              <Text mt={1} fontSize="label.sm" color="content.secondary">
                {bundle.warnings[0] || t("context-failed-description")}
              </Text>
            </Box>
            <Button
              size="sm"
              variant="outline"
              loading={isRetryingBundle}
              onClick={onRetryBundle}
            >
              <Icon as={LuRefreshCw} />
              {t("retry-context")}
            </Button>
          </Flex>
        </Box>
      )}
    </VStack>
  );
}
