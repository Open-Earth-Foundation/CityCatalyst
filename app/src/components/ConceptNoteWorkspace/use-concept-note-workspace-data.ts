"use client";

import { useState } from "react";

import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import type { ConceptNoteUploadResponse } from "@/util/types";

import {
  getConceptNoteBundleProgress,
  normalizePopulationData,
} from "../ConceptNoteDashboard/utils";
import {
  conceptNoteSourceLabel,
  shouldPollConceptNoteUpload,
  validateConceptNoteSourceFile,
} from "../ConceptNoteWiringHarness/utils";

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
    { pollingInterval: 15_000, skipPollingIfUnfocused: true },
  );
  const { data: city } = api.useGetCityQuery(cityId);
  const {
    data: applicationContext,
    isError: applicationContextFailed,
    isLoading: applicationContextLoading,
  } = api.useGetConceptNoteApplicationContextQuery(runId);
  const {
    data: draft,
    isError: draftQueryFailed,
    isLoading: draftLoading,
    refetch: refetchDraft,
  } = api.useGetConceptNoteDraftQuery(runId, {
    pollingInterval: 15_000,
    skipPollingIfUnfocused: true,
  });
  const { data: population } = api.useGetMostRecentCityPopulationQuery({
    cityId,
  });
  const { data: inventory } = api.useGetInventoryByCityIdQuery(cityId);
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
  const { data: refreshedUpload, isError: uploadRefreshFailed } =
    api.useGetConceptNoteUploadStatusQuery(
      { runId, uploadId: selectedUploadId ?? "" },
      {
        skip: !selectedUploadId,
        pollingInterval:
          selectedUploadId &&
          shouldPollConceptNoteUpload(
            persistedUploadStatus ?? uploadDetails?.status ?? null,
          )
            ? 2_000
            : 0,
        skipPollingIfUnfocused: true,
      },
    );

  const bundle = getConceptNoteBundleProgress(run?.progress_summary ?? {});
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
  const effectiveUploadError = uploadRefreshFailed
    ? t("refresh-status-error")
    : uploadError;
  const cityName = city?.name || t("selected-city");
  const populationData = normalizePopulationData(population);
  const populationLabel = populationData
    ? t("population", {
        population: new Intl.NumberFormat(lng).format(
          populationData.population,
        ),
        year: populationData.year,
      })
    : t("population-unavailable");
  const files = cityFiles ?? [];
  const canStartDrafting = Boolean(
    applicationContext?.funder &&
    applicationContext.opportunity &&
    applicationContext.template,
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
      void refetchRun();
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
      await refetchRun();
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

  async function startDrafting(): Promise<void> {
    if (!canStartDrafting || isDraftRunning) return;
    try {
      await startDraftMutation(runId).unwrap();
      await Promise.all([refetchDraft(), refetchRun()]);
    } catch {
      return;
    }
  }

  return {
    applicationContext,
    applicationContextFailed,
    applicationContextLoading,
    bundle,
    canStartDrafting,
    city,
    cityName,
    draft,
    draftFailed,
    draftLoading,
    draftStartError,
    effectiveUpload,
    effectiveUploadError,
    files,
    hasApplicationTemplate,
    inventory,
    isDraftRunning,
    populationLabel,
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
    startDrafting,
    startDraftState,
    uploadSource,
    uploadState,
  };
}
