"use client";

import type { ChangeEvent } from "react";
import { useRef } from "react";

import { Box, Flex, Grid, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import { LuCircleAlert, LuRefreshCw, LuUpload } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteUploadResponse,
} from "@/util/types";

import {
  getContextSourceStatusTranslationKey,
  type ConceptNoteBundleProgress,
} from "../ConceptNoteDashboard/utils";
import { uploadStatusTranslationKey } from "../ConceptNoteWiringHarness/utils";

interface ContextTabProps {
  applicationContext: ConceptNoteApplicationContext | null;
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
  upload: ConceptNoteUploadResponse | null;
  uploadError: string | null;
}

type ContextTone = "positive" | "neutral" | "warning";

interface ContextCardProps {
  details: string[];
  label: string;
  status: string;
  tone?: ContextTone;
  value: string;
}

function toneColor(tone: ContextTone): string {
  if (tone === "positive") {
    return "sentiment.positiveDefault";
  }
  if (tone === "warning") {
    return "sentiment.warningDefault";
  }
  return "content.tertiary";
}

function ContextStatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: ContextTone;
}) {
  const color = toneColor(tone);

  return (
    <HStack
      alignSelf="flex-start"
      gap={1.5}
      border="1px solid"
      borderColor={color}
      borderRadius="pill"
      px={2}
      py={0.5}
    >
      <Box boxSize="6px" borderRadius="full" bg={color} />
      <Text fontSize="10px" lineHeight="16px" color="content.secondary">
        {label}
      </Text>
    </HStack>
  );
}

function ContextSectionLabel({ children }: { children: string }) {
  return (
    <Text
      fontFamily="heading"
      fontSize="10px"
      fontWeight="semibold"
      letterSpacing="1.5px"
      color="content.tertiary"
      textTransform="uppercase"
    >
      {children}
    </Text>
  );
}

function ContextCard({
  details,
  label,
  status,
  tone = "neutral",
  value,
}: ContextCardProps) {
  return (
    <VStack
      align="stretch"
      gap={2}
      minH="128px"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      p={3}
    >
      <ContextSectionLabel>{label}</ContextSectionLabel>
      <ContextStatusBadge label={status} tone={tone} />
      <Text
        fontFamily="heading"
        fontSize="body.sm"
        fontWeight="semibold"
        color="content.primary"
      >
        {value}
      </Text>
      <VStack align="stretch" gap={0.5}>
        {details.filter(Boolean).map((detail) => (
          <Text
            key={detail}
            fontSize="10px"
            lineHeight="16px"
            color="content.tertiary"
          >
            {detail}
          </Text>
        ))}
      </VStack>
    </VStack>
  );
}

export function ContextTab({
  applicationContext,
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
  upload,
  uploadError,
}: ContextTabProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ghgiIncluded =
    bundle.availableContext.ghgi ||
    (applicationContext?.included_sources.ghgi ?? false);
  const ccraIncluded =
    bundle.availableContext.ccra ||
    (applicationContext?.included_sources.ccra ?? false);
  const hiapIncluded =
    bundle.availableContext.hiap ||
    (applicationContext?.included_sources.hiap ?? false);
  const cityIncluded =
    bundle.availableContext.city ||
    (applicationContext?.included_sources.city ?? false);
  const hiapStatusLabel = bundle.hiapStatus
    ? t(getContextSourceStatusTranslationKey(bundle.hiapStatus))
    : t("not-available");
  const uploadTone: ContextTone =
    upload?.status === "ready"
      ? "positive"
      : upload?.status === "failed"
        ? "warning"
        : "neutral";

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      void onUploadFile(file);
    }
    event.target.value = "";
  }

  return (
    <VStack
      align="stretch"
      gap={4}
      minH="full"
      bg="background.alternativeLight"
      p={{ base: 4, md: 5 }}
    >
      <VStack align="stretch" gap={2}>
        <ContextSectionLabel>
          {t("context-citycatalyst-sources")}
        </ContextSectionLabel>
        <Grid
          gap={2}
          gridTemplateColumns={{
            base: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
            xl: "repeat(4, minmax(0, 1fr))",
          }}
        >
          <ContextCard
            label={t("city-population")}
            value={populationLabel}
            details={[[cityName, country].filter(Boolean).join(", ")]}
            status={t(cityIncluded ? "included-in-run" : "not-included-in-run")}
            tone={cityIncluded ? "positive" : "warning"}
          />
          <ContextCard
            label={t("ghg-inventory")}
            value={
              inventoryYear
                ? t("inventory-year", { year: inventoryYear })
                : t("not-available")
            }
            details={[
              ghgiIncluded ? t("included-in-run") : t("available-to-run"),
            ]}
            status={t(ghgiIncluded ? "connected" : "available-to-run")}
            tone={ghgiIncluded ? "positive" : "neutral"}
          />
          <ContextCard
            label={t("climate-risk-assessment")}
            value={t(
              ccraIncluded ? "bundle-source-available" : "not-available",
            )}
            details={[t("ccra-not-in-bundle")]}
            status={t(ccraIncluded ? "included-in-run" : "not-connected")}
            tone={ccraIncluded ? "positive" : "warning"}
          />
          <ContextCard
            label={t("hiap-context")}
            value={hiapIncluded ? hiapStatusLabel : t("not-available")}
            details={[
              t(hiapIncluded ? "hiap-optional" : "hiap-impact-missing-summary"),
            ]}
            status={t(
              hiapIncluded ? "included-in-run" : "bundle-source-missing",
            )}
            tone={hiapIncluded ? "positive" : "warning"}
          />
        </Grid>

        {!hiapIncluded && (
          <Flex
            data-testid="hiap-missing-impact"
            role="status"
            align="start"
            gap={3}
            border="1px solid"
            borderColor="sentiment.warningDefault"
            borderRadius="rounded"
            bg="sentiment.warningOverlay"
            p={4}
          >
            <Icon
              as={LuCircleAlert}
              flexShrink={0}
              mt={0.5}
              color="sentiment.warningDefault"
            />
            <Box>
              <Text
                fontFamily="heading"
                fontSize="body.sm"
                fontWeight="semibold"
                color="content.primary"
              >
                {t("hiap-impact-missing-title")}
              </Text>
              <Text
                mt={1}
                fontSize="label.sm"
                lineHeight="20px"
                color="content.secondary"
              >
                {t("hiap-impact-missing-description")}
              </Text>
            </Box>
          </Flex>
        )}
      </VStack>

      <VStack align="stretch" gap={2}>
        <ContextSectionLabel>
          {t("context-funder-similar-projects")}
        </ContextSectionLabel>
        <Grid
          gap={2}
          gridTemplateColumns={{ base: "1fr", lg: "repeat(2, minmax(0, 1fr))" }}
        >
          <ContextCard
            label={t("funder-profile")}
            value={
              applicationContext?.funder?.name || t("funding-not-selected")
            }
            details={[
              applicationContext?.opportunity?.name || "",
              applicationContext?.template
                ? t("template-context-detail", {
                    template: applicationContext.template.name,
                  })
                : t("template-not-selected"),
            ]}
            status={t(
              applicationContext?.funder ? "connected" : "not-connected",
            )}
            tone={applicationContext?.funder ? "positive" : "warning"}
          />
          <ContextCard
            label={t("similar-funded-projects")}
            value={t("not-available")}
            details={[t("similar-projects-unavailable")]}
            status={t("not-connected")}
            tone="warning"
          />
        </Grid>
      </VStack>

      <VStack align="stretch" gap={2}>
        <Flex align="center" justify="space-between" gap={3}>
          <ContextSectionLabel>{t("your-files")}</ContextSectionLabel>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf,text/markdown,text/plain,text/x-markdown,.md"
            hidden
            onChange={onFileChange}
          />
          <Button
            size="xs"
            variant="outline"
            loading={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon as={LuUpload} />
            {t("upload-pdf")}
          </Button>
        </Flex>

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
            bg={toneColor(uploadTone)}
          />
          <Box minW={0} flex={1}>
            <Text truncate fontSize="body.sm" color="content.primary">
              {upload?.filename ||
                firstCityFile ||
                (bundle.readySources
                  ? t("ready-run-sources", { count: bundle.readySources })
                  : t("no-run-sources"))}
            </Text>
            <Text fontSize="10px" color="content.tertiary">
              {upload
                ? `${t(uploadStatusTranslationKey(upload.status))}${
                    upload.pageCount
                      ? ` · ${t("pages-count", { count: upload.pageCount })}`
                      : ""
                  }`
                : firstCityFile
                  ? t("city-files-available", {
                      count: cityFilesCount,
                      file: firstCityFile,
                    })
                  : t("upload-source-help")}
            </Text>
          </Box>
          <ContextStatusBadge
            label={
              upload
                ? t(uploadStatusTranslationKey(upload.status))
                : t("not-connected")
            }
            tone={uploadTone}
          />
          {upload?.status === "failed" && upload.canRetry && (
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

      {bundle.status === "failed" && bundle.retryable && (
        <Flex
          align={{ base: "start", sm: "center" }}
          direction={{ base: "column", sm: "row" }}
          gap={3}
          border="1px solid"
          borderColor="sentiment.warningDefault"
          borderRadius="rounded"
          bg="sentiment.warningOverlay"
          p={4}
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
              {t("context-failed-description")}
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
      )}
    </VStack>
  );
}
