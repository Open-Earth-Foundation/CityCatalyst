"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  conceptNoteSourceLabel,
  shouldPollConceptNoteUpload,
  validateConceptNoteSourceFile,
} from "@/components/ConceptNoteWiringHarness/utils";
import { useAppDispatch } from "@/lib/hooks";
import { api } from "@/services/api";
import type { ConceptNoteFunderImport } from "@/util/types";

import {
  funderApiErrorCode,
  funderApiErrorKey,
  funderImportErrorKey,
} from "./funder-form";

const POLL_MS = 2000;
/** Climate Advisor can see a converted upload a moment after CityCatalyst. */
const START_ATTEMPTS = 5;

export type FunderImportPhase =
  "idle" | "uploading" | "converting" | "reading" | "ready" | "failed";

export interface FunderImportFlow {
  phase: FunderImportPhase;
  funderImport: ConceptNoteFunderImport | null;
  filename: string | null;
  pageCount: number | null;
  /** i18n key for the current failure or a file that could not be sent. */
  error: string | null;
  canRetry: boolean;
  busy: boolean;
  uploadFile: (file: File) => Promise<void>;
  retry: () => Promise<void>;
  /** Forget the pending import; rejects with the RTK error. */
  discard: () => Promise<void>;
  /** Show the file picker again, e.g. to try a different document. */
  chooseAnotherFile: () => void;
}

/**
 * Drives adding a funder from a document: upload and convert the file through
 * the note's upload pipeline, then start and poll the funder import. Lives at
 * the workspace level so an upload keeps progressing after the dialog closes.
 */
export function useFunderImport({
  cityId,
  runId,
}: {
  cityId: string;
  runId: string;
}): FunderImportFlow {
  // The upload being converted, until the server import tracks it.
  const [pending, setPending] = useState<{
    uploadId: string;
    filename: string;
  } | null>(null);
  const [sendingFile, setSendingFile] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startTick, setStartTick] = useState(0);
  const startedRef = useRef<string | null>(null);
  const notReadyRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dispatch = useAppDispatch();

  const { data } = api.useGetConceptNoteFunderImportQuery(runId);
  const funderImport = data?.funder_import ?? null;
  api.useGetConceptNoteFunderImportQuery(runId, {
    skip: funderImport?.status !== "processing",
    pollingInterval: POLL_MS,
  });
  const uploadQuery = api.useGetConceptNoteUploadStatusQuery(
    { runId, uploadId: pending?.uploadId ?? "" },
    { skip: !pending },
  );
  const upload =
    pending && uploadQuery.currentData?.uploadId === pending.uploadId
      ? uploadQuery.currentData
      : undefined;
  api.useGetConceptNoteUploadStatusQuery(
    { runId, uploadId: pending?.uploadId ?? "" },
    {
      skip: !pending || (upload && !shouldPollConceptNoteUpload(upload.status)),
      pollingInterval: POLL_MS,
    },
  );

  const [uploadSource] = api.useUploadConceptNoteSourceMutation();
  const [retryUpload, retryUploadState] =
    api.useRetryConceptNoteUploadMutation();
  const [startImport, startState] =
    api.useStartConceptNoteFunderImportMutation();
  const [discardImport, discardState] =
    api.useDiscardConceptNoteFunderImportMutation();

  const startRead = useCallback(
    async (uploadId: string) => {
      const started = await startImport({ runId, uploadId }).unwrap();
      // Show the new import at once instead of the previous one.
      dispatch(
        api.util.upsertQueryData("getConceptNoteFunderImport", runId, started),
      );
    },
    [dispatch, runId, startImport],
  );

  // Start reading funder details as soon as the file has been converted.
  const uploadReady = upload?.status === "ready";
  useEffect(() => {
    if (!pending || !uploadReady || startedRef.current === pending.uploadId) {
      return;
    }
    startedRef.current = pending.uploadId;
    startRead(pending.uploadId)
      .then(() => setPending(null))
      .catch((cause: unknown) => {
        if (
          funderApiErrorCode(cause) === "upload_not_ready" &&
          notReadyRef.current < START_ATTEMPTS
        ) {
          notReadyRef.current += 1;
          retryTimerRef.current = setTimeout(() => {
            startedRef.current = null;
            setStartTick((tick) => tick + 1);
          }, POLL_MS);
          return;
        }
        setError(funderApiErrorKey(cause));
      });
  }, [pending, uploadReady, startRead, startTick]);

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  let phase: FunderImportPhase = "idle";
  let failure: string | null = null;
  let filename: string | null = null;
  if (sendingFile) {
    phase = "uploading";
    filename = sendingFile;
  } else if (pending) {
    filename = pending.filename;
    if (upload?.status === "failed") failure = "funder-upload-failed";
    else if (uploadReady && error) failure = error;
    phase = failure ? "failed" : uploadReady ? "reading" : "converting";
  } else if (funderImport && !picking) {
    filename = funderImport.filename;
    if (funderImport.status === "failed") {
      failure = funderImportErrorKey(funderImport.error_code);
    }
    phase = failure
      ? "failed"
      : funderImport.status === "ready"
        ? "ready"
        : "reading";
  }

  function resetStart(): void {
    startedRef.current = null;
    notReadyRef.current = 0;
    setError(null);
  }

  async function uploadFile(file: File): Promise<void> {
    setError(null);
    const validationError = await validateConceptNoteSourceFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSendingFile(file.name);
    try {
      const formData = new FormData();
      formData.set("file", file);
      // The funder document also becomes an ordinary source of the note.
      formData.set("sourceLabel", conceptNoteSourceLabel(file.name));
      const created = await uploadSource({ cityId, formData, runId }).unwrap();
      resetStart();
      setPicking(false);
      setPending({ uploadId: created.uploadId, filename: file.name });
    } catch {
      setError("upload-source-error");
    } finally {
      setSendingFile(null);
    }
  }

  async function retry(): Promise<void> {
    if (pending && upload?.status === "failed") {
      await retryUpload({ runId, uploadId: pending.uploadId })
        .unwrap()
        .catch(() => setError("conversion-retry-error"));
    } else if (pending) {
      resetStart();
      setStartTick((tick) => tick + 1);
    } else if (funderImport) {
      // Starting again on the same upload replaces the failed import.
      setError(null);
      await startRead(funderImport.upload_id).catch((cause: unknown) =>
        setError(funderApiErrorKey(cause)),
      );
    }
  }

  async function discard(): Promise<void> {
    setPending(null);
    setPicking(false);
    resetStart();
    if (funderImport) await discardImport(runId).unwrap();
  }

  function chooseAnotherFile(): void {
    setPending(null);
    resetStart();
    setPicking(true);
  }

  return {
    phase,
    funderImport,
    filename,
    pageCount: upload?.pageCount ?? null,
    error: error ?? failure,
    canRetry:
      phase === "failed" &&
      (upload?.status !== "failed" || Boolean(upload.canRetry)),
    busy:
      retryUploadState.isLoading ||
      startState.isLoading ||
      discardState.isLoading,
    uploadFile,
    retry,
    discard,
    chooseAnotherFile,
  };
}
