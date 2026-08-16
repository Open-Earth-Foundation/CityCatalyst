"use client";

import { useState } from "react";

import {
  Box,
  Flex,
  Grid,
  Heading,
  HStack,
  Icon,
  Skeleton,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { motion, useReducedMotion } from "framer-motion";
import NextLink from "next/link";
import {
  LuArrowLeft,
  LuDownload,
  LuFileText,
  LuLayers3,
  LuRefreshCw,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import type { ConceptNoteUploadResponse } from "@/util/types";

import {
  getConceptNoteBundleProgress,
  getRunStatusPresentation,
  humanizeLifecycleValue,
} from "../ConceptNoteDashboard/utils";
import { StatusBadge } from "../ConceptNoteDashboard/status-badge";
import {
  shouldPollConceptNoteUpload,
  validateConceptNotePdf,
} from "../ConceptNoteWiringHarness/utils";
import { ConceptNoteChatPanel } from "./chat-panel";
import { ContextTab } from "./context-tab";
import { DraftTab } from "./draft-tab";
import { ExportDialog } from "./export-dialog";
import { StructureTab } from "./structure-tab";

type WorkspaceTab = "draft" | "structure" | "context";

interface ConceptNoteWorkspaceProps {
  cityId: string;
  initialUploadId?: string;
  lng: string;
  runId: string;
}

const workspaceTabs: Array<{
  icon: typeof LuFileText;
  key: WorkspaceTab;
  translationKey: string;
}> = [
  { key: "draft", translationKey: "draft-tab", icon: LuFileText },
  { key: "structure", translationKey: "structure-tab", icon: LuLayers3 },
  { key: "context", translationKey: "context-tab", icon: LuRefreshCw },
];

export function ConceptNoteWorkspace({
  cityId,
  initialUploadId,
  lng,
  runId,
}: ConceptNoteWorkspaceProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const reducedMotion = useReducedMotion() ?? false;
  const [tab, setTab] = useState<WorkspaceTab>("draft");
  const [exportOpen, setExportOpen] = useState(false);
  const [activeUploadId, setActiveUploadId] = useState(initialUploadId ?? null);
  const [uploadDetails, setUploadDetails] =
    useState<ConceptNoteUploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const {
    data: run,
    isError: runFailed,
    isLoading: runLoading,
    refetch: refetchRun,
  } = api.useGetConceptNoteRunQuery(runId, {
    pollingInterval: 5_000,
    skipPollingIfUnfocused: true,
  });
  const { data: city } = api.useGetCityQuery(cityId);
  const { data: population } = api.useGetMostRecentCityPopulationQuery({
    cityId,
  });
  const { data: inventory } = api.useGetInventoryByCityIdQuery(cityId);
  const { data: cityFiles } = api.useGetUserFilesQuery(cityId);
  const [uploadPdf, uploadState] = api.useUploadConceptNotePdfMutation();
  const [retryUpload, retryUploadState] =
    api.useRetryConceptNoteUploadMutation();
  const [retryBundle, retryBundleState] =
    api.useRetryConceptNoteContextBundleMutation();
  const { data: refreshedUpload, isError: uploadRefreshFailed } =
    api.useGetConceptNoteUploadStatusQuery(
      { runId, uploadId: activeUploadId ?? "" },
      {
        skip: !activeUploadId,
        pollingInterval:
          activeUploadId &&
          shouldPollConceptNoteUpload(uploadDetails?.status ?? null)
            ? 2_000
            : activeUploadId
              ? 5_000
              : 0,
        skipPollingIfUnfocused: true,
      },
    );

  const bundle = getConceptNoteBundleProgress(run?.progress_summary ?? {});
  const effectiveUpload = refreshedUpload ?? uploadDetails;
  const effectiveUploadError = uploadRefreshFailed
    ? t("refresh-status-error")
    : uploadError;
  const cityName = city?.name || t("selected-city");
  const populationLabel = population
    ? t("population", {
        population: new Intl.NumberFormat(lng).format(population.population),
        year: population.year,
      })
    : t("population-unavailable");
  const files = cityFiles ?? [];

  async function uploadSource(file: File): Promise<void> {
    setUploadError(null);
    const validationError = await validateConceptNotePdf(file);
    if (validationError) {
      setUploadError(t(validationError));
      return;
    }

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("sourceLabel", file.name.replace(/\.pdf$/i, ""));
      const upload = await uploadPdf({ cityId, formData, runId }).unwrap();
      setActiveUploadId(upload.uploadId);
      setUploadDetails(upload);
      void refetchRun();
    } catch {
      setUploadError(t("upload-source-error"));
    }
  }

  async function retryActiveUpload(): Promise<void> {
    if (!activeUploadId) {
      return;
    }
    setUploadError(null);
    try {
      const upload = await retryUpload({
        runId,
        uploadId: activeUploadId,
      }).unwrap();
      setUploadDetails(upload);
    } catch {
      setUploadError(t("conversion-retry-error"));
    }
  }

  async function retryContextBundle(): Promise<void> {
    try {
      await retryBundle(runId).unwrap();
      await refetchRun();
    } catch {
      setUploadError(t("context-retry-error"));
    }
  }

  if (runLoading) {
    return (
      <Box
        minH="calc(100vh - 80px)"
        bg="background.alternativeLight"
        px={{ base: 4, md: 10 }}
        py={8}
      >
        <VStack align="stretch" gap={5} maxW="1480px" mx="auto">
          <Skeleton h="70px" />
          <Grid
            gap={5}
            gridTemplateColumns={{ base: "1fr", xl: "480px minmax(0, 1fr)" }}
          >
            <Skeleton h="680px" />
            <Skeleton h="680px" />
          </Grid>
        </VStack>
      </Box>
    );
  }

  if (runFailed || !run || run.city_id !== cityId) {
    return (
      <Flex
        minH="calc(100vh - 80px)"
        align="center"
        justify="center"
        bg="background.alternativeLight"
        p={6}
      >
        <VStack
          align="start"
          gap={4}
          maxW="560px"
          border="1px solid"
          borderColor="sentiment.negativeDefault"
          borderRadius="rounded"
          bg="sentiment.negativeOverlay"
          p={6}
        >
          <Heading
            as="h1"
            fontFamily="heading"
            fontSize="title.md"
            color="content.primary"
          >
            {t("workspace-load-error-title")}
          </Heading>
          <Text fontSize="body.sm" color="content.secondary">
            {t("workspace-load-error-description")}
          </Text>
          <Button asChild size="sm" variant="outline">
            <NextLink href={`/${lng}/cities/${cityId}/concept-notes`}>
              <Icon as={LuArrowLeft} />
              {t("all-concept-notes")}
            </NextLink>
          </Button>
        </VStack>
      </Flex>
    );
  }

  const status = getRunStatusPresentation(run.status);
  const statusLabel = status.translationKey
    ? t(status.translationKey)
    : humanizeLifecycleValue(run.status);

  return (
    <Box minH="calc(100vh - 80px)" bg="background.alternativeLight">
      <motion.main
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        <VStack
          align="stretch"
          gap={4}
          maxW="1480px"
          mx="auto"
          px={{ base: 4, md: 10 }}
          py={6}
        >
          <HStack gap={2} color="content.tertiary">
            <NextLink href={`/${lng}/cities/${cityId}/concept-notes`}>
              <HStack gap={1.5} _hover={{ color: "content.link" }}>
                <Icon as={LuArrowLeft} />
                <Text fontSize="label.sm">{t("all-concept-notes")}</Text>
              </HStack>
            </NextLink>
            <Text fontSize="label.sm">/</Text>
            <Text
              truncate
              maxW="420px"
              fontSize="label.sm"
              color="content.secondary"
            >
              {run.name}
            </Text>
          </HStack>

          <Flex
            align={{ base: "start", md: "center" }}
            direction={{ base: "column", md: "row" }}
            gap={4}
          >
            <Box minW={0} flex={1}>
              <HStack align="center" gap={3} flexWrap="wrap">
                <Heading
                  as="h1"
                  truncate
                  fontFamily="heading"
                  fontSize="title.lg"
                  fontWeight="semibold"
                  color="content.primary"
                >
                  {run.name}
                </Heading>
                <StatusBadge label={statusLabel} tone={status.tone} />
              </HStack>
              <Text mt={1} fontSize="label.sm" color="content.tertiary">
                {cityName} · {humanizeLifecycleValue(run.workflow_step)} ·{" "}
                {t("autosaved")}
              </Text>
            </Box>
            <Button
              size="sm"
              variant="solid"
              bg="sentiment.positiveDefault"
              onClick={() => setExportOpen(true)}
            >
              <Icon as={LuDownload} />
              {t("export")}
            </Button>
          </Flex>

          <Grid
            gap={5}
            alignItems="start"
            gridTemplateColumns={{
              base: "minmax(0, 1fr)",
              xl: "480px minmax(0, 900px)",
            }}
          >
            <ConceptNoteChatPanel
              bundleStatus={bundle.status}
              lng={lng}
              onOpenContext={() => setTab("context")}
            />

            <Tabs.Root
              value={tab}
              onValueChange={(details) =>
                setTab(details.value as WorkspaceTab)
              }
              minW={0}
              overflow="hidden"
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="base.light"
              boxShadow="1dp"
            >
              <Tabs.List
                gap={0}
                borderBottom="1px solid"
                borderColor="border.neutral"
                bg="base.light"
                px={3}
              >
                {workspaceTabs.map((item) => (
                  <Tabs.Trigger
                    key={item.key}
                    value={item.key}
                    display="flex"
                    alignItems="center"
                    gap={2}
                    borderBottom="2px solid"
                    borderColor="transparent"
                    color="content.tertiary"
                    px={{ base: 2, md: 4 }}
                    py={3.5}
                    fontFamily="heading"
                    fontSize="label.sm"
                    fontWeight="semibold"
                    _selected={{
                      borderColor: "content.link",
                      color: "content.link",
                    }}
                    _hover={{ color: "content.link" }}
                  >
                    <Icon as={item.icon} />
                    {t(item.translationKey)}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <Tabs.Content value="draft" p={0}>
                <DraftTab
                  bundle={bundle}
                  isRetrying={retryBundleState.isLoading}
                  lng={lng}
                  noteName={run.name}
                  onOpenContext={() => setTab("context")}
                  onRetry={() => void retryContextBundle()}
                />
              </Tabs.Content>
              <Tabs.Content value="structure" p={0}>
                <StructureTab lng={lng} />
              </Tabs.Content>
              <Tabs.Content value="context" p={0}>
                <ContextTab
                  bundle={bundle}
                  cityFilesCount={files.length}
                  cityName={cityName}
                  country={city?.country ?? null}
                  firstCityFile={files[0]?.fileName ?? null}
                  inventoryYear={inventory?.year ?? null}
                  isRetryingBundle={retryBundleState.isLoading}
                  isRetryingUpload={retryUploadState.isLoading}
                  isUploading={uploadState.isLoading}
                  lng={lng}
                  onRetryBundle={() => void retryContextBundle()}
                  onRetryUpload={() => void retryActiveUpload()}
                  onUploadFile={uploadSource}
                  populationLabel={populationLabel}
                  projectName={city?.project?.name ?? null}
                  upload={effectiveUpload}
                  uploadError={effectiveUploadError}
                />
              </Tabs.Content>
            </Tabs.Root>
          </Grid>
        </VStack>
      </motion.main>

      <ExportDialog
        bundleReady={bundle.status === "ready"}
        lng={lng}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </Box>
  );
}
