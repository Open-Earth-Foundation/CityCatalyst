"use client";

import { useState } from "react";

import { useConceptNoteWorkspaceEvents } from "@/components/ConceptNoteWorkspace/use-concept-note-workspace-events";
import { useTranslation } from "@/i18n/client";
import { useAppDispatch } from "@/lib/hooks";
import { api } from "@/services/api";
import type { ConceptNoteUploadResponse } from "@/util/types";
import {
  getConceptNoteContextState,
  getConceptNoteContextPresentation,
} from "@/components/ConceptNoteWorkspace/context-status";

import {
  getConceptNoteBundleProgress,
  getConceptNoteDraftProgress,
  hasPrioritizedHiapActions,
  normalizePopulationData,
} from "@/components/ConceptNoteDashboard/utils";
import {
  conceptNoteSourceLabel,
  shouldPollConceptNoteUpload,
  validateConceptNoteSourceFile,
} from "@/components/ConceptNoteWiringHarness/utils";

interface WorkspaceDataOptions {
  cityId: string;
  initialUploadId?: string;
  lng: string;
  runId: string;
}

export function useConceptNoteWorkspaceData({
  cityId,
  initialUploadId,
  lng,
  runId,
}: WorkspaceDataOptions) {
  const { t } = useTranslation(lng, "concept-notes");
  const dispatch = useAppDispatch();
  const [activeUploadId, setActiveUploadId] = useState(initialUploadId ?? null);
  const [uploadDetails, setUploadDetails] =
    useState<ConceptNoteUploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const {
    data: run,
    isError: runFailed,
    isLoading: runLoading,
    refetch: refetchRun,
  } = api.useGetConceptNoteRunQuery(
    { cityId, runId },
    {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const { data: city } = api.useGetCityQuery(cityId);
  const {
    data: applicationContext,
    isError: applicationContextFailed,
    isLoading: applicationContextLoading,
    refetch: refetchApplicationContext,
  } = api.useGetConceptNoteApplicationContextQuery(runId);
  const {
    data: draft,
    isError: draftQueryFailed,
    isLoading: draftLoading,
    refetch: refetchDraft,
  } = api.useGetConceptNoteDraftQuery(runId, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const {
    data: population,
    isError: populationFailed,
    isLoading: populationLoading,
  } = api.useGetMostRecentCityPopulationQuery({ cityId });
  const [updateManualPopulation, manualPopulationState] =
    api.useUpdateConceptNotePopulationMutation();
  // Context cards link to GHGI and HIAP in a new tab; refetch on focus so the
  // cards reflect work done there without a page reload.
  const { data: inventory, isLoading: inventoryLoading } =
    api.useGetInventoryByCityIdQuery(cityId, { refetchOnFocus: true });
  const { data: cityDashboard, isLoading: cityDashboardLoading } =
    api.useGetCityDashboardQuery({ cityId, lng }, { refetchOnFocus: true });
  const { data: cityFiles } = api.useGetUserFilesQuery(cityId);
  const [uploadSourceMutation, uploadState] =
    api.useUploadConceptNoteSourceMutation();
  const [retryUpload, retryUploadState] =
    api.useRetryConceptNoteUploadMutation();
  const [retryBundle, retryBundleState] =
    api.useRetryConceptNoteContextBundleMutation();
  const [startDraftMutation, startDraftState] =
    api.useStartConceptNoteDraftMutation();

  const persistedUpload = run?.uploads?.[0];
  const selectedUploadId = activeUploadId ?? persistedUpload?.upload_id ?? null;
  const persistedUploadStatus =
    persistedUpload?.upload_id === selectedUploadId
      ? persistedUpload.status
      : null;
  const { currentData: refreshedUpload, isError: uploadRefreshFailed } =
    api.useGetConceptNoteUploadStatusQuery(
      { runId, uploadId: selectedUploadId ?? "" },
      {
        skip: !selectedUploadId,
        refetchOnMountOrArgChange: true,
        refetchOnFocus: true,
        refetchOnReconnect: true,
      },
    );

  const bundle = getConceptNoteBundleProgress(run?.progress_summary ?? {});
  const draftProgress = getConceptNoteDraftProgress(
    run?.progress_summary ?? {},
  );
  const persistedUploadDetails: ConceptNoteUploadResponse | null =
    persistedUpload
      ? {
          uploadId: persistedUpload.upload_id,
          runId: persistedUpload.run_id,
          status: persistedUpload.status,
          filename: persistedUpload.filename,
          sourceLabel: persistedUpload.source_label,
          pageCount: persistedUpload.page_count,
          errorCode: persistedUpload.error_code ?? undefined,
          receivedAt: persistedUpload.received_at,
          completedAt: persistedUpload.completed_at,
        }
      : null;
  const effectiveUpload =
    refreshedUpload ?? uploadDetails ?? persistedUploadDetails;
  const contextState = getConceptNoteContextState({
    bundle,
    uploads: run?.uploads,
    activeUpload: effectiveUpload,
    initialUploadId,
    isUploading: uploadState.isLoading,
    isRetrying: retryUploadState.isLoading || retryBundleState.isLoading,
  });
  const effectiveUploadError = uploadRefreshFailed
    ? t("refresh-status-error")
    : uploadError;
  const cityName = city?.name || t("selected-city");
  const populationData = normalizePopulationData(population);
  const manualPopulation = run?.manual_population ?? null;
  const displayedPopulation = manualPopulation ?? populationData;
  const populationLabel = displayedPopulation
    ? t("population", {
        population: new Intl.NumberFormat(lng).format(
          displayedPopulation.population,
        ),
        year: displayedPopulation.year,
      })
    : t(
        populationLoading
          ? "population-loading"
          : populationFailed
            ? "population-load-error"
            : "population-unavailable",
      );
  const files = cityFiles ?? [];
  const canStartDrafting = Boolean(
    applicationContext?.funder &&
    applicationContext.opportunity &&
    applicationContext.template?.chapter_schema.length,
  );
  const hasApplicationTemplate = Boolean(applicationContext?.template);
  const hasDraftChapters = Boolean(draft?.chapters.length);
  const draftFailed = draftQueryFailed && draft === undefined;
  const reviewAvailabilityDescription = applicationContextFailed
    ? t("review-setup-load-error")
    : draftFailed
      ? t("review-draft-load-error")
      : applicationContextLoading || draftLoading
        ? t("review-setup-loading")
        : !hasApplicationTemplate && !hasDraftChapters
          ? t("review-requires-template-and-draft")
          : !hasApplicationTemplate
            ? t("review-requires-template")
            : !hasDraftChapters
              ? t("review-requires-draft")
              : null;
  const draftStartError = startDraftState.isError
    ? t("draft-start-error")
    : null;
  const isDraftRunning = draft?.status === "running";
  const isUploadActive = shouldPollConceptNoteUpload(
    effectiveUpload?.status ?? persistedUploadStatus,
  );

  useConceptNoteWorkspaceEvents({
    cityId,
    runId,
    uploadId: selectedUploadId,
    observeDraft: isDraftRunning || draftQueryFailed,
    observeUpload: isUploadActive || uploadRefreshFailed,
    observeRun: bundle.status === "building" || runFailed,
  });

  async function uploadSource(file: File): Promise<void> {
    setUploadError(null);
    const validationError = await validateConceptNoteSourceFile(file);
    if (validationError) {
      setUploadError(t(validationError));
      return;
    }

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("sourceLabel", conceptNoteSourceLabel(file.name));
      const upload = await uploadSourceMutation({
        cityId,
        formData,
        runId,
      }).unwrap();
      setActiveUploadId(upload.uploadId);
      setUploadDetails(upload);
    } catch {
      setUploadError(t("upload-source-error"));
    }
  }

  async function retryActiveUpload(): Promise<void> {
    const uploadId = selectedUploadId;
    if (!uploadId) return;
    setUploadError(null);
    try {
      const upload = await retryUpload({
        runId,
        uploadId,
      }).unwrap();
      setActiveUploadId(uploadId);
      setUploadDetails(upload);
    } catch {
      setUploadError(t("conversion-retry-error"));
    }
  }

  async function retryContextBundle(): Promise<void> {
    try {
      await retryBundle(runId).unwrap();
    } catch {
      setUploadError(t("context-retry-error"));
    }
  }

  async function startDrafting(): Promise<void> {
    if (!canStartDrafting || isDraftRunning) return;
    try {
      const startedDraft = await startDraftMutation(runId).unwrap();
      dispatch(
        api.util.upsertQueryEntries([
          {
            endpointName: "getConceptNoteDraft",
            arg: runId,
            value: startedDraft,
          },
        ]),
      );
    } catch {
      return;
    }
  }

  async function saveManualPopulation(
    value: { population: number; year: number } | null,
  ): Promise<void> {
    await updateManualPopulation({
      cityId,
      runId,
      manualPopulation: value,
    }).unwrap();
  }

  return {
    refetchApplicationContext,
    applicationContext,
    applicationContextFailed,
    applicationContextLoading,
    bundle,
    canStartDrafting,
    contextStatus: getConceptNoteContextPresentation(contextState, bundle, t),
    city,
    cityName,
    draft,
    draftFailed,
    draftLoading,
    draftProgress,
    draftStartError,
    effectiveUpload,
    effectiveUploadError,
    files,
    hasApplicationTemplate,
    hiapAvailableInCity: hasPrioritizedHiapActions(cityDashboard?.widgets.hiap),
    inventory,
    cityContextLoading: inventoryLoading || cityDashboardLoading,
    isDraftRunning,
    manualPopulation,
    manualPopulationSaving: manualPopulationState.isLoading,
    populationFailed,
    populationLabel,
    populationLoading,
    populationMissing: !populationData,
    refetchDraft,
    refetchRun,
    retryActiveUpload,
    retryBundleState,
    retryContextBundle,
    retryUploadState,
    reviewAvailabilityDescription,
    run,
    runFailed,
    runLoading,
    saveManualPopulation,
    startDrafting,
    startDraftState,
    uploadSource,
    uploadState,
  };
}
