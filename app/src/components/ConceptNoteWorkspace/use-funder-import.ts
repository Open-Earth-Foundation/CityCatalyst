"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  shouldPollConceptNoteUpload,
  validateConceptNoteSourceFile,
} from "@/components/ConceptNoteWiringHarness/utils";
import { useAppDispatch } from "@/lib/hooks";
import { api } from "@/services/api";
import type {
  ConceptNoteFunderCreateRequest,
  ConceptNoteFunderCreateResponse,
  ConceptNoteFunderImport,
} from "@/util/types";

import {
  funderApiErrorCode,
  funderApiErrorKey,
  funderImportErrorKey,
} from "./funder-import-form";

const POLL_MS = 2000;
const START_RETRY_MS = 3000;
const START_ATTEMPTS = 5;
/** Internal marker while a start is re-attempted after `upload_not_ready`. */
const START_RETRYING = "retrying";
/** The funder document also becomes an ordinary source of the note. */
export const FUNDER_DOCUMENT_SOURCE_LABEL = "Funder document";

export type FunderImportPhase =
  "idle" | "uploading" | "converting" | "reading" | "ready" | "failed";

export interface FunderImportFailure {
  /** Which step failed: file conversion, starting the read, or the read. */
  kind: "upload" | "start" | "import";
  messageKey: string;
  canRetry: boolean;
}

export interface FunderImportFlow {
  phase: FunderImportPhase;
  funderImport: ConceptNoteFunderImport | null;
  failure: FunderImportFailure | null;
  filename: string | null;
  pageCount: number | null;
  /** i18n key for a file the user just picked that could not be sent. */
  error: string | null;
  retrying: boolean;
  discarding: boolean;
  creating: boolean;
  uploadFile: (file: File) => Promise<void>;
  retry: () => Promise<void>;
  discard: () => Promise<void>;
  /** Show the file picker again, e.g. to try a different document. */
  chooseAnotherFile: () => void;
  /** Add reviewed values to the catalogue; rejects with the RTK error. */
  createFunder: (
    request: ConceptNoteFunderCreateRequest,
  ) => Promise<ConceptNoteFunderCreateResponse>;
}

interface PendingUpload {
  uploadId: string;
  filename: string;
}

function storageKey(runId: string): string {
  return `cnb-funder-upload:${runId}`;
}

function readPendingUpload(runId: string): PendingUpload | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.sessionStorage.getItem(storageKey(runId));
    return saved ? (JSON.parse(saved) as PendingUpload) : null;
  } catch {
    // Storage is optional; the flow still works for this page view.
    return null;
  }
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
  // A reload during conversion must still start the read once it is ready.
  const [pending, setPending] = useState<PendingUpload | null>(() =>
    readPendingUpload(runId),
  );
  const [picking, setPicking] = useState(false);
  const [sendingFile, setSendingFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const startedRef = useRef<string | null>(null);
  const startAttemptsRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remember = useCallback(
    (upload: PendingUpload | null) => {
      setPending(upload);
      try {
        if (upload) {
          window.sessionStorage.setItem(
            storageKey(runId),
            JSON.stringify(upload),
          );
        } else {
          window.sessionStorage.removeItem(storageKey(runId));
        }
      } catch {
        // Ignore unavailable storage.
      }
    },
    [runId],
  );

  const importQuery = api.useGetConceptNoteFunderImportQuery(runId);
  const serverStatus = importQuery.data?.funder_import?.status;
  const funderImport = importQuery.data?.funder_import ?? null;
  // Poll only while the read is running.
  api.useGetConceptNoteFunderImportQuery(runId, {
    skip: serverStatus !== "processing",
    pollingInterval: POLL_MS,
  });

  const localUpload =
    pending && funderImport?.upload_id !== pending.uploadId ? pending : null;
  const trackedUploadId = localUpload?.uploadId ?? funderImport?.upload_id;
  const uploadQuery = api.useGetConceptNoteUploadStatusQuery(
    { runId, uploadId: trackedUploadId ?? "" },
    { skip: !trackedUploadId },
  );
  const upload =
    uploadQuery.currentData?.uploadId === trackedUploadId
      ? uploadQuery.currentData
      : undefined;
  const uploadPolling =
    Boolean(localUpload) &&
    (upload === undefined || shouldPollConceptNoteUpload(upload.status));
  api.useGetConceptNoteUploadStatusQuery(
    { runId, uploadId: localUpload?.uploadId ?? "" },
    { skip: !uploadPolling, pollingInterval: POLL_MS },
  );

  const [uploadSource] = api.useUploadConceptNoteSourceMutation();
  const [retryUpload, retryUploadState] =
    api.useRetryConceptNoteUploadMutation();
  const [startImport] = api.useStartConceptNoteFunderImportMutation();
  const [retryImport, retryImportState] =
    api.useRetryConceptNoteFunderImportMutation();
  const [discardImport, discardState] =
    api.useDiscardConceptNoteFunderImportMutation();
  const [createFunderMutation, createState] =
    api.useCreateConceptNoteFunderMutation();

  // Start reading funder details as soon as the file has been converted.
  const readyToStart =
    localUpload !== null && upload?.status === "ready" && !startError;
  useEffect(() => {
    if (!readyToStart || !localUpload) return;
    if (startedRef.current === localUpload.uploadId) return;
    startedRef.current = localUpload.uploadId;
    startImport({ runId, uploadId: localUpload.uploadId })
      .unwrap()
      .then((started) => {
        startAttemptsRef.current = 0;
        // The server import now tracks this upload; the local record is done.
        dispatch(
          api.util.upsertQueryData(
            "getConceptNoteFunderImport",
            runId,
            started,
          ),
        );
        remember(null);
      })
      .catch((cause: unknown) => {
        // Delivery to Climate Advisor can lag the converted status briefly.
        if (
          funderApiErrorCode(cause) === "upload_not_ready" &&
          startAttemptsRef.current < START_ATTEMPTS
        ) {
          startAttemptsRef.current += 1;
          setStartError(START_RETRYING);
          retryTimerRef.current = setTimeout(() => {
            startedRef.current = null;
            setStartError(null);
          }, START_RETRY_MS);
          return;
        }
        setStartError(funderApiErrorKey(cause));
      });
  }, [dispatch, localUpload, readyToStart, remember, runId, startImport]);
  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  let phase: FunderImportPhase = "idle";
  let failure: FunderImportFailure | null = null;
  let filename: string | null = null;
  if (sendingFile) {
    phase = "uploading";
    filename = sendingFile;
  } else if (localUpload) {
    filename = localUpload.filename;
    if (upload?.status === "failed") {
      phase = "failed";
      failure = {
        kind: "upload",
        messageKey: "funder-upload-failed",
        canRetry: Boolean(upload.canRetry),
      };
    } else if (upload?.status !== "ready") {
      phase = "converting";
    } else if (startError && startError !== START_RETRYING) {
      phase = "failed";
      failure = { kind: "start", messageKey: startError, canRetry: true };
    } else {
      phase = "reading";
    }
  } else if (funderImport && !picking) {
    filename = funderImport.filename;
    if (funderImport.status === "processing") phase = "reading";
    else if (funderImport.status === "ready") phase = "ready";
    else {
      phase = "failed";
      failure = {
        kind: "import",
        messageKey: funderImportErrorKey(funderImport.error_code),
        canRetry: true,
      };
    }
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
      formData.set("sourceLabel", FUNDER_DOCUMENT_SOURCE_LABEL);
      const created = await uploadSource({ cityId, formData, runId }).unwrap();
      startedRef.current = null;
      startAttemptsRef.current = 0;
      setStartError(null);
      setPicking(false);
      remember({ uploadId: created.uploadId, filename: file.name });
    } catch {
      setError("upload-source-error");
    } finally {
      setSendingFile(null);
    }
  }

  async function retry(): Promise<void> {
    setError(null);
    if (failure?.kind === "upload" && localUpload) {
      try {
        await retryUpload({ runId, uploadId: localUpload.uploadId }).unwrap();
      } catch {
        setError("conversion-retry-error");
      }
    } else if (failure?.kind === "start") {
      startedRef.current = null;
      startAttemptsRef.current = 0;
      setStartError(null);
    } else if (failure?.kind === "import") {
      try {
        await retryImport(runId).unwrap();
      } catch (cause) {
        setError(funderApiErrorKey(cause));
      }
    }
  }

  async function discard(): Promise<void> {
    setError(null);
    remember(null);
    setStartError(null);
    setPicking(false);
    if (!funderImport) return;
    try {
      await discardImport(runId).unwrap();
    } catch (cause) {
      setError(funderApiErrorKey(cause));
      throw cause;
    }
  }

  function chooseAnotherFile(): void {
    remember(null);
    setStartError(null);
    setError(null);
    setPicking(true);
  }

  return {
    phase,
    funderImport,
    failure,
    filename,
    pageCount: upload?.pageCount ?? null,
    error,
    retrying: retryUploadState.isLoading || retryImportState.isLoading,
    discarding: discardState.isLoading,
    creating: createState.isLoading,
    uploadFile,
    retry,
    discard,
    chooseAnotherFile,
    createFunder: (request) =>
      createFunderMutation({ runId, funder: request }).unwrap(),
  };
}
