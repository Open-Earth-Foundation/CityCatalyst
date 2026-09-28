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
  Link,
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
  CityDashboardResponse,
  CityYearData,
  ConceptNoteApplicationContext,
  ConceptNoteUploadResponse,
} from "@/util/types";

import {
  getContextSourceStatusTranslationKey,
  hasPrioritizedHiapActions,
  type ConceptNoteBundleProgress,
} from "../ConceptNoteDashboard/utils";
import {
  ContextSourceActionButton,
  ContextSourceChip,
  type ContextSourceAction,
} from "../ConceptNoteDashboard/context-source-action";
import {
  contextSourceHelpKey,
  contextSourceStatusKey,
  contextSourceTone,
  getRunSourceState,
  inventorySourceAction,
  type ContextSourceState,
} from "../ConceptNoteDashboard/context-source-status";
import { uploadStatusTranslationKey } from "../ConceptNoteWiringHarness/utils";
import { ApplicationTemplateDialog } from "./application-template-dialog";
import { InventorySelectionDialog } from "./inventory-selection-dialog";

interface ContextTabProps {
  applicationContext: ConceptNoteApplicationContext | null;
  onSelectFunding: () => void;
  fundingLoading: boolean;
  fundingError: boolean;
  onRetryFunding: () => void;
  bundle: ConceptNoteBundleProgress;
  contextStatus: ConceptNoteContextPresentation;
  cityDashboard: CityDashboardResponse | null;
  cityDashboardFailed: boolean;
  cityDashboardLoading: boolean;
  cityFilesCount: number;
  cityId: string;
  cityName: string;
  country: string | null;
  firstCityFile: string | null;
  inventoryAvailable: boolean;
  inventoryFailed: boolean;
  inventoryHasData: boolean;
  inventoryId: string | null;
  inventoryLoading: boolean;
  inventoryOptions: CityYearData[];
  inventorySelectionSaving: boolean;
  inventoryYear: number | null;
  onSelectInventory: (inventoryId: string | null) => Promise<void>;
  isDraftRunning: boolean;
  isRetryingBundle: boolean;
  isRetryingUpload: boolean;
  isUploading: boolean;
  livePopulation: { population: number; year: number } | null;
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
  upload: ConceptNoteUploadResponse | null;
  uploadPickerRequest?: number;
  uploadError: string | null;
}

import {
  ContextStatusBadge,
  toneColor,
  type ContextTone,
} from "./context-status-badge";

interface ContextCardProps {
  action?: ContextSourceAction;
  /** "status" renders the action as a chip beside the status badge. */
  actionPlacement?: "header" | "status";
  /** Label for the chip's tooltip when the action sits beside the status. */
  actionTitle?: string;
  children?: ReactNode;
  details: string[];
  /** Shown top right when the header has no action, e.g. an external link. */
  headerAside?: ReactNode;
  label: string;
  status: string;
  tone?: ContextTone;
  value?: ReactNode;
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
  actionPlacement = "header",
  actionTitle,
  children,
  details,
  headerAside,
  label,
  status,
  tone = "neutral",
  value,
}: ContextCardProps) {
  const reasonId = useId();
  const disabled = Boolean(action?.disabledReason);
  const statusAction = actionPlacement === "status" ? action : undefined;
  const headerAction = actionPlacement === "header" ? action : undefined;
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
          {headerAction ? (
            <ContextSourceActionButton
              action={headerAction}
              reasonId={reasonId}
            />
          ) : (
            headerAside
          )}
        </HStack>
        {statusAction ? (
          <HStack gap={2} flexWrap="wrap">
            <ContextStatusBadge label={status} tone={tone} />
            <ContextSourceChip
              action={statusAction}
              reasonId={reasonId}
              title={actionTitle}
            />
          </HStack>
        ) : (
          <ContextStatusBadge label={status} tone={tone} />
        )}
        {value != null && (
          <Text
            fontFamily="heading"
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {value}
          </Text>
        )}
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
  cityDashboard,
  cityDashboardFailed,
  cityDashboardLoading,
  cityFilesCount,
  cityId,
  cityName,
  country,
  firstCityFile,
  inventoryAvailable,
  inventoryFailed,
  inventoryHasData,
  inventoryId,
  inventoryLoading,
  inventoryOptions,
  inventorySelectionSaving,
  inventoryYear,
  onSelectInventory,
  isDraftRunning,
  isRetryingBundle,
  isRetryingUpload,
  isUploading,
  livePopulation,
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
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false);
  const template = applicationContext?.template ?? null;
  const ghgiIncluded =
    bundle.availableContext.ghgi ||
    (applicationContext?.included_sources.ghgi ?? false);
  const hiapIncluded =
    bundle.availableContext.hiap ||
    (applicationContext?.included_sources.hiap ?? false);
  const populationMissing = !livePopulation;
  const runPopulation = bundle.cityPopulation;
  // The run keeps the population from its last context build; offer a refresh
  // when CityCatalyst has a figure the run is missing or has since changed.
  const populationRefreshNeeded =
    !manualPopulation &&
    bundle.status !== "building" &&
    livePopulation !== null &&
    (runPopulation === null ||
      runPopulation.population !== livePopulation.population ||
      runPopulation.year !== livePopulation.year);
  const populationStatus = manualPopulation
    ? "population-manual-source"
    : bundle.status === "building"
      ? "bundle-source-pending"
      : runPopulation
        ? "included-in-run"
        : populationMissing
          ? "population-unavailable"
          : "not-included-in-run";
  // The run uses the chosen inventory, else the newest one in the city.
  const chosenInventory =
    inventoryOptions.find(
      (option) => option.inventoryId === bundle.selectedInventoryId,
    ) ?? null;
  // An inventory without emissions data adds nothing to the run. Only the
  // newest one's data is known here; other choices rely on the build status.
  const inventoryEmpty =
    inventoryAvailable &&
    !inventoryHasData &&
    (chosenInventory?.inventoryId ?? inventoryId) === inventoryId;
  const inventoryState = getRunSourceState({
    cityAvailable: inventoryAvailable,
    included: ghgiIncluded,
    bundleStatus: bundle.status,
    sourceStatus: inventoryFailed ? "failed" : bundle.ghgiStatus,
    empty: inventoryEmpty,
    selected: Boolean(chosenInventory),
  });
  const actionPlanAvailable = hasPrioritizedHiapActions(
    cityDashboard?.widgets.hiap,
  );
  const actionPlanState = getRunSourceState({
    cityAvailable: actionPlanAvailable,
    included: hiapIncluded,
    bundleStatus: bundle.status,
    sourceStatus: cityDashboardFailed ? "failed" : bundle.hiapStatus,
  });
  const inventoryInRun =
    inventoryState === "included" || inventoryState === "partial";
  const usedInventory = bundle.sourceProvenance.ghgi;
  const displayedInventory = inventoryInRun
    ? usedInventory && {
        id: usedInventory.inventoryId,
        year: usedInventory.inventoryYear,
      }
    : chosenInventory
      ? { id: chosenInventory.inventoryId, year: chosenInventory.year }
      : inventoryId
        ? { id: inventoryId, year: inventoryYear }
        : null;
  const inventoryHref =
    displayedInventory &&
    getGhgiInventoryPath(lng, cityId, displayedInventory.id);
  // A source the city has but the build could not load gets its own hint.
  const runHelp = (state: ContextSourceState, existsInCity: boolean) =>
    t(
      state === "unavailable" && existsInCity
        ? "source-help-run-unavailable-existing"
        : contextSourceHelpKey(state, "run"),
    );
  const hiapStatusLabel = bundle.hiapStatus
    ? t(getContextSourceStatusTranslationKey(bundle.hiapStatus))
    : t("not-available");
  // Create an inventory, fill an empty one, or choose which one this run uses.
  const inventoryNext = inventoryLoading
    ? undefined
    : inventorySourceAction(inventoryState, { lng, cityId, inventoryId });
  // An empty inventory can still be swapped for another year that has data.
  const inventoryChoosable =
    inventoryNext?.kind === "choose" ||
    (inventoryNext?.kind === "fill" && inventoryOptions.length > 1);
  const inventoryLinkAction = inventoryNext?.href
    ? { label: t(inventoryNext.labelKey), href: inventoryNext.href }
    : undefined;
  const inventoryAction: ContextSourceAction | undefined = inventoryChoosable
    ? {
        // The chip is the inventory year; clicking it opens the picker.
        label:
          displayedInventory?.year != null
            ? t("inventory-year", { year: displayedInventory.year })
            : t("inventory-choose-different"),
        onClick: () => setInventoryPickerOpen(true),
        loading: inventorySelectionSaving,
        disabledReason: isDraftRunning
          ? t("context-action-draft-running")
          : bundle.status === "building"
            ? t("context-action-rebuilding")
            : undefined,
      }
    : inventoryLinkAction;
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
            details={[
              [cityName, country].filter(Boolean).join(", "),
              populationRefreshNeeded
                ? t(
                    runPopulation
                      ? "population-refresh-outdated"
                      : "population-refresh-hint",
                  )
                : "",
            ]}
            status={t(populationStatus)}
            tone={
              populationStatus === "bundle-source-pending"
                ? "neutral"
                : manualPopulation || runPopulation
                  ? "positive"
                  : "warning"
            }
            action={
              populationRefreshNeeded
                ? {
                    label: t("population-refresh"),
                    onClick: onRetryBundle,
                    loading: isRetryingBundle,
                    disabledReason: isDraftRunning
                      ? t("population-draft-running")
                      : undefined,
                  }
                : undefined
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
            action={inventoryAction}
            actionPlacement={inventoryChoosable ? "status" : "header"}
            actionTitle={t("inventory-choose-different")}
            headerAside={
              inventoryChoosable && inventoryLinkAction ? (
                // An empty inventory keeps its fill link beside the picker.
                <ContextSourceActionButton action={inventoryLinkAction} />
              ) : inventoryChoosable && inventoryHref ? (
                <Link
                  asChild
                  color="content.tertiary"
                  aria-label={t("inventory-open-in-ghgi")}
                  title={t("inventory-open-in-ghgi")}
                >
                  <NextLink
                    href={inventoryHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon as={LuExternalLink} boxSize={3.5} />
                  </NextLink>
                </Link>
              ) : undefined
            }
            value={
              inventoryChoosable ? undefined : inventoryHref &&
                displayedInventory?.year != null ? (
                <Link asChild color="interactive.secondary">
                  <NextLink
                    href={inventoryHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("inventory-year", { year: displayedInventory.year })}
                  </NextLink>
                </Link>
              ) : inventoryInRun ? (
                t("inventory-used-unknown")
              ) : (
                t("no-inventory")
              )
            }
            details={[
              t("ghgi-why"),
              inventoryState === "available" ||
              (inventoryState === "unavailable" && inventoryAvailable)
                ? t("not-included-in-run")
                : "",
              runHelp(inventoryState, inventoryAvailable),
            ]}
            status={t(contextSourceStatusKey(inventoryState, inventoryLoading))}
            tone={contextSourceTone(inventoryState)}
          />
          <ContextCard
            label={t("hiap-context")}
            value={
              hiapIncluded
                ? hiapStatusLabel
                : actionPlanAvailable
                  ? t("bundle-source-available")
                  : t("hiap-no-actions")
            }
            details={[
              t("hiap-why"),
              actionPlanState === "available" ? t("not-included-in-run") : "",
              runHelp(actionPlanState, actionPlanAvailable),
            ]}
            status={t(
              contextSourceStatusKey(actionPlanState, cityDashboardLoading),
            )}
            tone={contextSourceTone(actionPlanState)}
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
        {inventoryPickerOpen && (
          <InventorySelectionDialog
            cityId={cityId}
            lng={lng}
            options={inventoryOptions}
            saving={inventorySelectionSaving}
            selectedInventoryId={chosenInventory?.inventoryId ?? null}
            onClose={() => setInventoryPickerOpen(false)}
            onSelect={onSelectInventory}
          />
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
