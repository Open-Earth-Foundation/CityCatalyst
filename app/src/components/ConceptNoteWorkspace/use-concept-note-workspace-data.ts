"use client";

import { useEffect, useRef, useState } from "react";

import { isSourceLookupFailure } from "@/components/ConceptNoteDashboard/context-source-status";
import { useConceptNoteWorkspaceEvents } from "@/components/ConceptNoteWorkspace/use-concept-note-workspace-events";
import { useTranslation } from "@/i18n/client";
import { useAppDispatch } from "@/lib/hooks";
import { api } from "@/services/api";
import type { ConceptNoteRun, ConceptNoteUploadResponse } from "@/util/types";
import {
  getConceptNoteContextState,
  getConceptNoteContextPresentation,
} from "@/components/ConceptNoteWorkspace/context-status";

import {
  getConceptNoteBundleProgress,
  getConceptNoteDraftProgress,
  normalizePopulationData,
} from "@/components/ConceptNoteDashboard/utils";
import {
  CONCEPT_NOTE_MAX_UPLOADS,
  conceptNoteSourceLabel,
  isConceptNoteUploadLimitError,
  shouldPollConceptNoteUpload,
  validateConceptNoteSourceFile,
} from "@/components/ConceptNoteWiringHarness/utils";

const REFRESH_ON_RETURN_MS = 10_000;

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
  // Set by uploads and retries in this session.
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
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
  // Context cards link to GHGI in a new tab; refetch city sources on focus so
  // the cards reflect work done there without a page reload.
  const {
    data: cityDashboard,
    isError: cityDashboardFailed,
    isLoading: cityDashboardLoading,
  } = api.useGetCityDashboardQuery({ cityId, lng }, { refetchOnFocus: true });
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
  // Refetch on open and on focus so an inventory created or filled in another
  // tab shows up on return.
  const {
    data: inventory,
    error: inventoryError,
    isLoading: inventoryLoading,
  } = api.useGetInventoryByCityIdQuery(cityId, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const inventoryFailed = isSourceLookupFailure(inventoryError);
  // Same refetch rules as the inventory, so the picker lists an inventory
  // created in another tab.
  const { data: cityYears } = api.useGetCityYearsQuery(cityId, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const inventoryOptions = [...(cityYears?.years ?? [])].sort(
    (a, b) => b.year - a.year,
  );
  const { data: cityFiles } = api.useGetUserFilesQuery(cityId);
  const [uploadSourceMutation, uploadState] =
    api.useUploadConceptNoteSourceMutation();
  const [retryUpload, retryUploadState] =
    api.useRetryConceptNoteUploadMutation();
  const [retryBundle, retryBundleState] =
    api.useRetryConceptNoteContextBundleMutation();
  const [refreshBundle] = api.useRefreshConceptNoteContextBundleMutation();
  const [selectInventoryMutation, selectInventoryState] =
    api.useSelectConceptNoteInventoryMutation();
  const [startDraftMutation, startDraftState] =
    api.useStartConceptNoteDraftMutation();

  const runUploads = run?.uploads ?? [];
  const persistedUpload = runUploads[0];
  // `?uploadId=` only tracks a just-created note's upload until the run lists
  // it; after that the newest upload drives status like any other visit.
  const initialUploadListed =
    Boolean(initialUploadId) &&
    runUploads.some((upload) => upload.upload_id === initialUploadId);
  const pendingInitialUploadId =
    initialUploadId && !initialUploadListed ? initialUploadId : null;
  const selectedUploadId =
    activeUploadId ??
    pendingInitialUploadId ??
    persistedUpload?.upload_id ??
    null;
  const selectedRunUpload = runUploads.find(
    (upload) => upload.upload_id === selectedUploadId,
  );
  const persistedUploadStatus = selectedRunUpload?.status ?? null;
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

  // Drop the served `?uploadId=` so a reload does not track a stale upload.
  useEffect(() => {
    if (!initialUploadListed) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("uploadId")) return;
    url.searchParams.delete("uploadId");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [initialUploadListed]);

  const bundle = getConceptNoteBundleProgress(run?.progress_summary ?? {});

  // On open, and when the user returns to the tab (e.g. after creating or
  // filling an inventory in GHGI), rebuild context if the city's inventory
  // changed since the last build. The server skips the rebuild when nothing
  // changed; returns are throttled so tab switching stays cheap.
  const refreshedRunRef = useRef<string | null>(null);
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    function refresh(): void {
      lastRefreshRef.current = Date.now();
      void refreshBundle(runId);
    }
    if (refreshedRunRef.current !== runId) {
      refreshedRunRef.current = runId;
      refresh();
    }
    function onReturn(): void {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshRef.current < REFRESH_ON_RETURN_MS) return;
      refresh();
    }
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refreshBundle, runId]);

  // A finished rebuild can change which sources the application context lists,
  // and a file added after drafting makes the draft report a pending review.
  const completedBuildRef = useRef<string | null>(null);
  const completedBuild =
    bundle.status === "ready" ? `${runId}:${bundle.buildId}` : null;
  useEffect(() => {
    if (!completedBuild) return;
    if (
      completedBuildRef.current &&
      completedBuildRef.current !== completedBuild
    ) {
      void refetchApplicationContext();
      void refetchDraft();
    }
    completedBuildRef.current = completedBuild;
  }, [completedBuild, refetchApplicationContext, refetchDraft]);
  const draftProgress = getConceptNoteDraftProgress(
    run?.progress_summary ?? {},
  );
  const effectiveUpload =
    refreshedUpload ??
    uploadDetails ??
    (selectedRunUpload ? toUploadResponse(selectedRunUpload) : null);
  const uploads = listConceptNoteUploads(runUploads, effectiveUpload);
  const uploadLimitReached = uploads.length >= CONCEPT_NOTE_MAX_UPLOADS;
  const contextState = getConceptNoteContextState({
    bundle,
    uploads: run?.uploads,
    activeUpload: effectiveUpload,
    initialUploadId: pendingInitialUploadId ?? undefined,
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
    // A finished upload can be ready before its rebuild starts, leaving the
    // last ready bundle behind the uploads; keep watching until it catches up.
    observeRun:
      bundle.status === "building" ||
      runFailed ||
      (contextState === "processing" && !isUploadActive),
  });

  async function uploadSource(file: File): Promise<void> {
    setUploadError(null);
    if (uploadLimitReached) {
      setUploadError(
        t("upload-limit-reached", { max: CONCEPT_NOTE_MAX_UPLOADS }),
      );
      return;
    }
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
    } catch (error) {
      setUploadError(
        isConceptNoteUploadLimitError(error)
          ? t("upload-limit-reached", { max: CONCEPT_NOTE_MAX_UPLOADS })
          : t("upload-source-error"),
      );
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

  async function selectInventory(inventoryId: string | null): Promise<void> {
    await selectInventoryMutation({ runId, inventoryId }).unwrap();
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
    cityDashboard,
    cityDashboardFailed,
    cityDashboardLoading,
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
    inventory,
    inventoryFailed,
    inventoryLoading,
    inventoryOptions,
    inventorySelectionSaving: selectInventoryState.isLoading,
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
    selectInventory,
    startDrafting,
    startDraftState,
    uploads,
    uploadSource,
    uploadState,
  };
}

type RunUpload = NonNullable<ConceptNoteRun["uploads"]>[number];

function toUploadResponse(upload: RunUpload): ConceptNoteUploadResponse {
  return {
    uploadId: upload.upload_id,
    runId: upload.run_id,
    status: upload.status,
    filename: upload.filename,
    sourceLabel: upload.source_label,
    pageCount: upload.page_count,
    errorCode: upload.error_code ?? undefined,
    receivedAt: upload.received_at,
    completedAt: upload.completed_at,
  };
}

/**
 * Every upload on the run, newest first. The tracked upload's fresher status
 * replaces its row, or leads the list until the run lists it.
 */
export function listConceptNoteUploads(
  runUploads: RunUpload[],
  trackedUpload: ConceptNoteUploadResponse | null,
): ConceptNoteUploadResponse[] {
  const uploads = runUploads.map((upload) => {
    const persisted = toUploadResponse(upload);
    if (trackedUpload?.uploadId !== upload.upload_id) return persisted;
    return {
      ...persisted,
      ...trackedUpload,
      filename: trackedUpload.filename || persisted.filename,
      pageCount: trackedUpload.pageCount ?? persisted.pageCount,
    };
  });
  if (
    trackedUpload &&
    !runUploads.some((upload) => upload.upload_id === trackedUpload.uploadId)
  ) {
    uploads.unshift(trackedUpload);
  }
  return uploads;
}
