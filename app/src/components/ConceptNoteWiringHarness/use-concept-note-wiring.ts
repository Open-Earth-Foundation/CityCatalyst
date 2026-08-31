"use client";

import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import type {
  ConceptNoteUploadResponse,
  ConceptNoteUploadStatus,
} from "@/util/types";

import {
  requireConceptNoteUploadIdentity,
  shouldPollConceptNoteUpload,
  validateConceptNoteSourceFile,
} from "./utils";

export type ConceptNoteWiringScreen = "home" | "scope";
export type ConceptNoteRequestStage =
  "idle" | "loading" | "creating" | "uploading" | "polling";

interface UseConceptNoteWiringOptions {
  cityId: string;
  initialRunId?: string;
  lng: string;
}

export interface ConceptNoteWiringController {
  cityCountry: string | null;
  cityName: string;
  error: string | null;
  isBusy: boolean;
  isDragging: boolean;
  noteName: string;
  requestStage: ConceptNoteRequestStage;
  runId: string | null;
  screen: ConceptNoteWiringScreen;
  selectedFile: File | null;
  sourceLabel: string;
  uploadDetails: ConceptNoteUploadResponse | null;
  uploadId: string | null;
  uploadStatus: ConceptNoteUploadStatus | null;
  chooseFile: (file: File | null) => Promise<void>;
  completeFlow: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  openNewRun: () => void;
  retryUpload: () => Promise<void>;
  setIsDragging: (isDragging: boolean) => void;
  setNoteName: (name: string) => void;
  setSourceLabel: (label: string) => void;
  showHome: () => void;
  showScope: () => void;
  submitWiringTest: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

const POLL_INTERVAL_MS = 2_000;

function createDefaultName(locale: string, label: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
  return `${label} · ${date}`;
}

export function useConceptNoteWiring({
  cityId,
  initialRunId,
  lng,
}: UseConceptNoteWiringOptions): ConceptNoteWiringController {
  const { t } = useTranslation(lng, "concept-notes");
  const [screen, setScreen] = useState<ConceptNoteWiringScreen>(
    initialRunId ? "scope" : "home",
  );
  const [noteName, setNoteName] = useState(() =>
    createDefaultName(lng, t("default-note-name")),
  );
  const [sourceLabel, setSourceLabel] = useState(() =>
    t("supporting-document"),
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resumeRunId, setResumeRunId] = useState(initialRunId ?? null);
  const [runId, setRunId] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadDetails, setUploadDetails] =
    useState<ConceptNoteUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const { data: city } = api.useGetCityQuery(cityId);
  const {
    data: resumedRun,
    isError: resumeFailed,
    isFetching: resumeLoading,
  } = api.useGetConceptNoteRunQuery(
    { cityId, runId: resumeRunId ?? "" },
    {
      skip: !resumeRunId,
    },
  );
  const [startConceptNoteRun, startState] =
    api.useStartConceptNoteRunMutation();
  const [uploadConceptNoteSource, uploadState] =
    api.useUploadConceptNoteSourceMutation();
  const [retryConceptNoteUpload, retryState] =
    api.useRetryConceptNoteUploadMutation();

  const uploadStatus = uploadDetails?.status ?? null;
  const shouldPoll = shouldPollConceptNoteUpload(uploadStatus);
  const { data: refreshedUpload, isError: refreshFailed } =
    api.useGetConceptNoteUploadStatusQuery(
      { runId: runId ?? "", uploadId: uploadId ?? "" },
      {
        skip: !runId || !uploadId,
        pollingInterval: shouldPoll ? POLL_INTERVAL_MS : 0,
        skipPollingIfUnfocused: true,
      },
    );
  const resumedRunIsInvalid = Boolean(
    resumedRun &&
    (resumedRun.run_id !== resumeRunId ||
      resumedRun.city_id !== cityId ||
      !resumedRun.name),
  );
  const refreshedUploadIsInvalid = Boolean(
    refreshedUpload &&
    runId &&
    uploadId &&
    (refreshedUpload.uploadId !== uploadId || refreshedUpload.runId !== runId),
  );
  const queryError =
    resumeFailed || resumedRunIsInvalid
      ? t("resume-error")
      : refreshFailed || refreshedUploadIsInvalid
        ? t("refresh-status-error")
        : null;

  /* eslint-disable react-hooks/set-state-in-effect -- Validated RTK Query results hydrate local editable state and advance polling. */
  useEffect(() => {
    if (!resumedRun || resumedRunIsInvalid) {
      return;
    }
    setRunId(resumedRun.run_id);
    setNoteName(resumedRun.name);
  }, [resumedRun, resumedRunIsInvalid]);

  useEffect(() => {
    if (!refreshedUpload || !runId || !uploadId || refreshedUploadIsInvalid) {
      return;
    }
    setUploadDetails(refreshedUpload);
  }, [refreshedUpload, refreshedUploadIsInvalid, runId, uploadId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function resetHarness(): void {
    setNoteName(createDefaultName(lng, t("default-note-name")));
    setSourceLabel(t("supporting-document"));
    setSelectedFile(null);
    setRunId(null);
    setUploadId(null);
    setUploadDetails(null);
    setError(null);
    setResumeRunId(null);
    startState.reset();
    uploadState.reset();
    retryState.reset();
    idempotencyKey.current = crypto.randomUUID();
  }

  function openNewRun(): void {
    resetHarness();
    setScreen("scope");
  }

  async function chooseFile(file: File | null): Promise<void> {
    setError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const validationError = await validateConceptNoteSourceFile(file);
    if (validationError) {
      setSelectedFile(null);
      setError(t(validationError));
      return;
    }
    setSelectedFile(file);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    void chooseFile(event.target.files?.[0] || null);
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);
    void chooseFile(event.dataTransfer.files?.[0] || null);
  }

  async function startRun(): Promise<string> {
    if (runId) {
      return runId;
    }
    if (resumeRunId) {
      throw new Error("Concept note resume failed");
    }
    const run = await startConceptNoteRun({
      cityId,
      idempotencyKey: idempotencyKey.current,
      name: noteName.trim(),
    }).unwrap();
    if (!run.run_id || run.city_id !== cityId) {
      throw new Error("Run creation response does not match the request");
    }
    setRunId(run.run_id);
    return run.run_id;
  }

  async function uploadSource(targetRunId: string): Promise<void> {
    if (!selectedFile) {
      throw new Error("A source file is required before upload");
    }
    const formData = new FormData();
    formData.set("file", selectedFile);
    if (sourceLabel.trim()) {
      formData.set("sourceLabel", sourceLabel.trim());
    }
    const upload = await uploadConceptNoteSource({
      cityId,
      formData,
      runId: targetRunId,
    }).unwrap();
    const identity = requireConceptNoteUploadIdentity(upload);
    setUploadId(identity.uploadId);
    setUploadDetails(upload);
  }

  async function submitWiringTest(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!noteName.trim()) {
      setError(t("concept-note-name-required"));
      return;
    }
    if (!selectedFile) {
      setError(t("choose-pdf-error"));
      return;
    }

    try {
      const targetRunId = await startRun();
      await uploadSource(targetRunId);
    } catch {
      setError(t("wiring-request-failed"));
    }
  }

  async function retryUpload(): Promise<void> {
    if (!runId || !uploadId) {
      return;
    }
    setError(null);
    try {
      const upload = await retryConceptNoteUpload({ runId, uploadId }).unwrap();
      const identity = requireConceptNoteUploadIdentity(upload);
      if (identity.uploadId !== uploadId) {
        throw new Error("Retry response does not match the upload");
      }
      setUploadDetails((current) => ({ ...(current ?? {}), ...upload }));
    } catch {
      setError(t("conversion-retry-error"));
    }
  }

  let requestStage: ConceptNoteRequestStage = "idle";
  if (shouldPoll || retryState.isLoading) {
    requestStage = "polling";
  }
  if (uploadState.isLoading) {
    requestStage = "uploading";
  }
  if (startState.isLoading) {
    requestStage = "creating";
  }
  if (resumeLoading) {
    requestStage = "loading";
  }

  return {
    cityCountry: city?.country || null,
    cityName: city?.name || t("selected-city"),
    error: error ?? queryError,
    isBusy:
      resumeLoading ||
      startState.isLoading ||
      uploadState.isLoading ||
      retryState.isLoading,
    isDragging,
    noteName,
    requestStage,
    runId,
    screen,
    selectedFile,
    sourceLabel,
    uploadDetails,
    uploadId,
    uploadStatus,
    chooseFile,
    completeFlow: () => setScreen("home"),
    onDrop,
    onFileChange,
    openNewRun,
    retryUpload,
    setIsDragging,
    setNoteName,
    setSourceLabel,
    showHome: () => setScreen("home"),
    showScope: () => setScreen("scope"),
    submitWiringTest,
  };
}
