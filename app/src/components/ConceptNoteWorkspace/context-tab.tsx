"use client";

import type { ConceptNoteContextPresentation } from "./context-status";

import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import {
  Box,
  Flex,
  Grid,
  HStack,
  Icon,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import {
  LuCircleAlert,
  LuExternalLink,
  LuRefreshCw,
  LuUpload,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import { getGhgiInventoryPath } from "@/util/ghgi-routes";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteUploadResponse,
} from "@/util/types";

import {
  getContextSourceStatusTranslationKey,
  type ConceptNoteBundleProgress,
} from "../ConceptNoteDashboard/utils";
import { uploadStatusTranslationKey } from "../ConceptNoteWiringHarness/utils";
import { ApplicationTemplateDialog } from "./application-template-dialog";

interface ContextTabProps {
  applicationContext: ConceptNoteApplicationContext | null;
  onSelectFunding: () => void;
  fundingLoading: boolean;
  fundingError: boolean;
  onRetryFunding: () => void;
  bundle: ConceptNoteBundleProgress;
  contextStatus: ConceptNoteContextPresentation;
  cityContextLoading: boolean;
  cityFilesCount: number;
  cityId: string;
  cityName: string;
  country: string | null;
  firstCityFile: string | null;
  hiapAvailableInCity: boolean;
  inventoryHasData: boolean;
  inventoryId: string | null;
  inventoryYear: number | null;
  isDraftRunning: boolean;
  isRetryingBundle: boolean;
  isRetryingUpload: boolean;
  isUploading: boolean;
  lng: string;
  manualPopulation: { population: number; year: number } | null;
  manualPopulationSaving: boolean;
  onRetryBundle: () => void;
  onRetryUpload: () => void;
  onSaveManualPopulation: (
    value: { population: number; year: number } | null,
  ) => Promise<void>;
  onUploadFile: (file: File) => Promise<void>;
  populationFailed: boolean;
  populationLabel: string;
  populationLoading: boolean;
  populationMissing: boolean;
  upload: ConceptNoteUploadResponse | null;
  uploadPickerRequest?: number;
  uploadError: string | null;
}

import {
  ContextStatusBadge,
  toneColor,
  type ContextTone,
} from "./context-status-badge";

interface ContextCardAction {
  label: string;
  onClick?: () => void;
  // Links open in a new tab so the concept note stays open.
  href?: string;
  loading?: boolean;
  disabledReason?: string;
}

interface ContextCardProps {
  action?: ContextCardAction;
  children?: ReactNode;
  details: string[];
  label: string;
  status: string;
  tone?: ContextTone;
  value: string;
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
  action,
  children,
  details,
  label,
  status,
  tone = "neutral",
  value,
}: ContextCardProps) {
  const reasonId = useId();
  const disabled = Boolean(action?.disabledReason);
  return (
    <Box
      minW={0}
      textAlign="start"
      minH="128px"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      p={3}
    >
      <VStack align="stretch" gap={2} h="full">
        <HStack justify="space-between" align="start" gap={2}>
          <ContextSectionLabel>{label}</ContextSectionLabel>
          {action &&
            (action.href && !disabled ? (
              <Button
                asChild
                size="xs"
                variant="outline"
                flexShrink={0}
                textTransform="none"
                letterSpacing="normal"
              >
                <NextLink
                  href={action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {action.label}
                  <Icon as={LuExternalLink} />
                </NextLink>
              </Button>
            ) : (
              <Button
                size="xs"
                variant="outline"
                flexShrink={0}
                textTransform="none"
                letterSpacing="normal"
                disabled={disabled}
                loading={action.loading}
                aria-describedby={disabled ? reasonId : undefined}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
        </HStack>
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
        {disabled && (
          <Text id={reasonId} fontSize="xs" color="content.secondary">
            {action?.disabledReason}
          </Text>
        )}
        {children}
      </VStack>
    </Box>
  );
}

export function ContextTab({
  applicationContext,
  onSelectFunding,
  fundingLoading,
  fundingError,
  onRetryFunding,
  bundle,
  contextStatus,
  cityContextLoading,
  cityFilesCount,
  cityId,
  cityName,
  country,
  firstCityFile,
  hiapAvailableInCity,
  inventoryHasData,
  inventoryId,
  inventoryYear,
  isDraftRunning,
  isRetryingBundle,
  isRetryingUpload,
  isUploading,
  lng,
  manualPopulation,
  manualPopulationSaving,
  onRetryBundle,
  onRetryUpload,
  onSaveManualPopulation,
  onUploadFile,
  populationFailed,
  populationLabel,
  populationLoading,
  populationMissing,
  upload,
  uploadError,
  uploadPickerRequest,
}: ContextTabProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (uploadPickerRequest) fileInputRef.current?.click();
  }, [uploadPickerRequest]);
  const [editingPopulation, setEditingPopulation] = useState(false);
  const [populationInput, setPopulationInput] = useState("");
  const [yearInput, setYearInput] = useState("");
  const [populationError, setPopulationError] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const template = applicationContext?.template ?? null;
  const ghgiIncluded =
    bundle.availableContext.ghgi ||
    (applicationContext?.included_sources.ghgi ?? false);
  const hiapIncluded =
    bundle.availableContext.hiap ||
    (applicationContext?.included_sources.hiap ?? false);
  const cityIncluded =
    bundle.availableContext.city ||
    (applicationContext?.included_sources.city ?? false);
  const hiapStatusLabel = bundle.hiapStatus
    ? t(getContextSourceStatusTranslationKey(bundle.hiapStatus))
    : t("not-available");
  const contextBuilding = bundle.status === "building";
  // A rebuild pulls sources added in CityCatalyst since the run was built.
  const refreshRunAction: ContextCardAction = {
    label: t("refresh-run-context"),
    onClick: onRetryBundle,
    loading: isRetryingBundle,
    disabledReason: isDraftRunning
      ? t("context-action-draft-running")
      : contextBuilding
        ? t("context-action-rebuilding")
        : undefined,
  };
  function citySourceCard(
    included: boolean,
    availableInCity: boolean,
    missingAction?: ContextCardAction,
  ): Pick<ContextCardProps, "action" | "status" | "tone"> {
    if (included) return { status: t("included-in-run"), tone: "positive" };
    if (cityContextLoading) {
      return { status: t("context-source-checking"), tone: "neutral" };
    }
    if (availableInCity) {
      return {
        status: t(
          contextBuilding ? "bundle-source-pending" : "not-included-in-run",
        ),
        tone: contextBuilding ? "neutral" : "warning",
        action: refreshRunAction,
      };
    }
    return {
      status: t("not-connected"),
      tone: "warning",
      action: missingAction,
    };
  }
  // An inventory without emissions data adds nothing to the run, so point to
  // filling it before offering a refresh.
  const ghgiEmpty = Boolean(inventoryId) && !inventoryHasData;
  const ghgiCard =
    ghgiEmpty && inventoryId && !cityContextLoading
      ? {
          status: t("inventory-empty"),
          tone: "warning" as const,
          action: {
            label: t("add-inventory-data"),
            href: getGhgiInventoryPath(lng, cityId, inventoryId, "data"),
          },
        }
      : citySourceCard(ghgiIncluded, Boolean(inventoryId), {
          label: t("create-inventory"),
          href: `/${lng}/cities/${cityId}/GHGI/onboarding`,
        });
  // No link to the HIAP module: not every project has it enabled.
  const hiapCard = citySourceCard(hiapIncluded, hiapAvailableInCity);
  // A converted file is not ready for chat until context assembly finishes.
  // Kept separate from the raw "processing" status, which means converting.
  const awaitingContext = upload?.status === "ready" && contextStatus.blocked;
  const contextFailed = awaitingContext && contextStatus.state === "failed";
  const uploadStatus = contextFailed
    ? "failed"
    : awaitingContext
      ? null
      : (upload?.status ?? "queued");
  const uploadTone: ContextTone =
    uploadStatus === "ready"
      ? "positive"
      : uploadStatus === "failed"
        ? "warning"
        : "neutral";
  const uploadStatusLabel = t(
    awaitingContext && !contextFailed
      ? "status-processing"
      : uploadStatusTranslationKey(uploadStatus),
  );
  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      void onUploadFile(file);
    }
    event.target.value = "";
  }

  function beginPopulationEdit(): void {
    setPopulationInput(manualPopulation?.population.toString() ?? "");
    setYearInput(manualPopulation?.year.toString() ?? "");
    setPopulationError(null);
    setEditingPopulation(true);
  }

  async function savePopulation(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const population = Number(populationInput);
    const year = Number(yearInput);
    if (
      !populationInput.trim() ||
      !yearInput.trim() ||
      !Number.isSafeInteger(population) ||
      population < 0 ||
      population > 10_000_000_000 ||
      !Number.isInteger(year) ||
      year < 1800 ||
      year > 2100
    ) {
      setPopulationError(t("population-invalid"));
      return;
    }
    try {
      await onSaveManualPopulation({ population, year });
      setEditingPopulation(false);
      setPopulationError(null);
    } catch {
      setPopulationError(t("population-save-error"));
    }
  }

  async function clearPopulation(): Promise<void> {
    try {
      await onSaveManualPopulation(null);
      setPopulationError(null);
    } catch {
      setPopulationError(t("population-save-error"));
    }
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
            xl: "repeat(3, minmax(0, 1fr))",
          }}
        >
          <ContextCard
            label={t("city-population")}
            value={populationLabel}
            details={[[cityName, country].filter(Boolean).join(", ")]}
            status={t(
              manualPopulation
                ? "population-manual-source"
                : populationMissing
                  ? "population-unavailable"
                  : cityIncluded
                    ? "included-in-run"
                    : "not-included-in-run",
            )}
            tone={
              manualPopulation || (!populationMissing && cityIncluded)
                ? "positive"
                : "warning"
            }
          >
            {(populationMissing || Boolean(manualPopulation)) &&
              (!populationLoading || Boolean(manualPopulation)) && (
                <VStack align="stretch" gap={2}>
                  <Text fontSize="xs" color="content.tertiary">
                    {t("population-cnb-only")}
                  </Text>
                  {isDraftRunning && (
                    <Text fontSize="xs" color="content.tertiary">
                      {t("population-draft-running")}
                    </Text>
                  )}
                  {editingPopulation ? (
                    <form onSubmit={(event) => void savePopulation(event)}>
                      <VStack align="stretch" gap={2}>
                        <label>
                          <Text fontSize="xs">
                            {t("population-amount-label")}
                          </Text>
                          <Input
                            type="number"
                            min={0}
                            max={10_000_000_000}
                            step={1}
                            value={populationInput}
                            onChange={(event) =>
                              setPopulationInput(event.target.value)
                            }
                          />
                        </label>
                        <label>
                          <Text fontSize="xs">
                            {t("population-year-label")}
                          </Text>
                          <Input
                            type="number"
                            min={1800}
                            max={2100}
                            step={1}
                            value={yearInput}
                            onChange={(event) =>
                              setYearInput(event.target.value)
                            }
                          />
                        </label>
                        <HStack>
                          <Button
                            type="submit"
                            size="xs"
                            disabled={isDraftRunning}
                            loading={manualPopulationSaving}
                          >
                            {t("population-save")}
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() => setEditingPopulation(false)}
                          >
                            {t("cancel")}
                          </Button>
                        </HStack>
                      </VStack>
                    </form>
                  ) : (
                    <HStack>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isDraftRunning}
                        onClick={beginPopulationEdit}
                      >
                        {t(
                          manualPopulation
                            ? "population-edit"
                            : "population-enter",
                        )}
                      </Button>
                      {manualPopulation && (
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={isDraftRunning}
                          loading={manualPopulationSaving}
                          onClick={() => void clearPopulation()}
                        >
                          {t("population-remove")}
                        </Button>
                      )}
                    </HStack>
                  )}
                  {populationError && (
                    <Text role="alert" fontSize="xs" color="semantic.danger">
                      {populationError}
                    </Text>
                  )}
                  {populationFailed && !manualPopulation && (
                    <Text fontSize="xs" color="content.tertiary">
                      {t("population-source-error")}
                    </Text>
                  )}
                </VStack>
              )}
          </ContextCard>
          <ContextCard
            label={t("ghg-inventory")}
            value={
              inventoryYear
                ? t("inventory-year", { year: inventoryYear })
                : t("no-inventory")
            }
            details={[
              t("ghgi-why"),
              ghgiEmpty && !cityContextLoading
                ? t("inventory-empty-detail")
                : "",
            ]}
            {...ghgiCard}
          />
          <ContextCard
            label={t("hiap-context")}
            value={
              hiapIncluded
                ? hiapStatusLabel
                : hiapAvailableInCity
                  ? t("hiap-available-in-city")
                  : t("not-available")
            }
            details={[t("hiap-why")]}
            {...hiapCard}
          />
        </Grid>
      </VStack>

      <VStack align="stretch" gap={2}>
        <ContextSectionLabel>
          {t("context-funder-similar-projects")}
        </ContextSectionLabel>
        <Grid
          gap={2}
          gridTemplateColumns={{ base: "1fr", lg: "repeat(3, minmax(0, 1fr))" }}
        >
          <ContextCard
            label={t("funder-profile")}
            action={
              fundingError
                ? {
                    label: t("try-again"),
                    onClick: onRetryFunding,
                    loading: fundingLoading,
                  }
                : {
                    label: t(
                      applicationContext?.funder
                        ? "funding-view-change"
                        : "funding-browse",
                    ),
                    onClick: onSelectFunding,
                    loading: fundingLoading,
                  }
            }
            value={
              applicationContext?.funder?.name || t("funding-not-selected")
            }
            details={[
              applicationContext?.funder
                ? applicationContext.opportunity?.name || ""
                : t("funder-why"),
            ]}
            status={t(
              applicationContext?.funder ? "connected" : "not-connected",
            )}
            tone={applicationContext?.funder ? "positive" : "warning"}
          />
          <ContextCard
            label={t("funding-template-preview")}
            action={
              template
                ? {
                    label: t("template-view"),
                    onClick: () => setTemplateOpen(true),
                  }
                : fundingError
                  ? undefined
                  : {
                      label: t("template-choose"),
                      onClick: onSelectFunding,
                      loading: fundingLoading,
                    }
            }
            value={template?.name || t("template-not-selected")}
            details={
              template
                ? [
                    [
                      t("funding-template-chapters", {
                        count: template.chapter_schema.length,
                      }),
                      template.output_format?.toUpperCase(),
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  ]
                : [t("template-why")]
            }
            status={t(template ? "template-ready" : "not-connected")}
            tone={template ? "positive" : "warning"}
          />
          <ContextCard
            label={t("similar-funded-projects")}
            value={t("not-available")}
            details={[t("similar-projects-unavailable")]}
            status={t("not-connected")}
            tone="warning"
          />
        </Grid>
        {fundingError && (
          <Text
            role="alert"
            fontSize="body.sm"
            color="sentiment.negativeDefault"
          >
            {t("funding-load-error")}
          </Text>
        )}
        {templateOpen && template && (
          <ApplicationTemplateDialog
            lng={lng}
            template={template}
            onClose={() => setTemplateOpen(false)}
          />
        )}
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
                ? `${uploadStatusLabel}${
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
            label={upload ? uploadStatusLabel : t("not-connected")}
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

      {contextStatus.state === "failed" && bundle.retryable && (
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
              {contextStatus.title}
            </Text>
            <Text mt={1} fontSize="label.sm" color="content.secondary">
              {contextStatus.description}
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
