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

type PendingUpload = { uploadId: string; filename: string };

function readPendingUpload(key: string): PendingUpload | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "uploadId" in value &&
      typeof value.uploadId === "string" &&
      "filename" in value &&
      typeof value.filename === "string"
    )
      return { uploadId: value.uploadId, filename: value.filename };
  } catch {
    // Storage may be disabled, or left with an invalid entry.
  }
  return null;
}

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
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const storageKey = `cnb-funder-upload:${cityId}:${runId}`;
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  const generationRef = useRef(0);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const [sendingFile, setSendingFile] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startTick, setStartTick] = useState(0);
  const startedRef = useRef<string | null>(null);
  const notReadyRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dispatch = useAppDispatch();

  const importQuery = api.useGetConceptNoteFunderImportQuery(runId, {
    refetchOnMountOrArgChange: true,
  });
  const funderImport = importQuery.currentData?.funder_import ?? null;
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

  const rememberPending = useCallback(
    (value: PendingUpload | null) => {
      try {
        if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
        else sessionStorage.removeItem(storageKey);
      } catch {
        // The current mount still works when browser storage is unavailable.
      }
      setPending(value);
    },
    [storageKey],
  );

  useEffect(() => {
    generationRef.current += 1;
    startedRef.current = null;
    notReadyRef.current = 0;
    // Restore tab storage after hydration; also reset when navigating between runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(readPendingUpload(storageKey));
    setRestoredKey(storageKey);
    setSendingFile(null);
    setPicking(false);
    setError(null);
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [storageKey]);

  const startRead = useCallback(
    async (uploadId: string, generation: number) => {
      const promise = (async () => {
        const started = await startImport({ runId, uploadId }).unwrap();
        if (generation !== generationRef.current) {
          // A discard/replacement can happen while POST is in flight. Remove
          // only its result, never a newer import another request created.
          if (started.funder_import) {
            await discardImport({
              runId,
              importId: started.funder_import.import_id,
            }).unwrap();
          }
          return;
        }
        dispatch(
          api.util.upsertQueryData(
            "getConceptNoteFunderImport",
            runId,
            started,
          ),
        );
      })();
      startPromiseRef.current = promise;
      try {
        await promise;
      } finally {
        if (startPromiseRef.current === promise) startPromiseRef.current = null;
      }
    },
    [discardImport, dispatch, runId, startImport],
  );

  // Start reading funder details as soon as the file has been converted.
  const uploadReady = upload?.status === "ready";
  useEffect(() => {
    if (
      !pending ||
      restoredKey !== storageKey ||
      !importQuery.isSuccess ||
      importQuery.isFetching
    ) {
      return;
    }
    // A previous mount may have completed the handoff before it disappeared.
    if (funderImport?.upload_id === pending.uploadId) {
      // Synchronize local recovery state with the refreshed server snapshot.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      rememberPending(null);
      return;
    }
    if (!uploadReady || startedRef.current === pending.uploadId) {
      return;
    }
    const generation = generationRef.current;
    startedRef.current = pending.uploadId;
    startRead(pending.uploadId, generation)
      .then(() => {
        if (generation === generationRef.current) rememberPending(null);
      })
      .catch((cause: unknown) => {
        if (generation !== generationRef.current) return;
        if (
          funderApiErrorCode(cause) === "upload_not_ready" &&
          notReadyRef.current < START_ATTEMPTS
        ) {
          notReadyRef.current += 1;
          retryTimerRef.current = setTimeout(() => {
            if (generation !== generationRef.current) return;
            startedRef.current = null;
            setStartTick((tick) => tick + 1);
          }, POLL_MS);
          return;
        }
        setError(funderApiErrorKey(cause));
      });
  }, [
    pending,
    uploadReady,
    startRead,
    startTick,
    funderImport,
    importQuery.isSuccess,
    importQuery.isFetching,
    rememberPending,
    restoredKey,
    storageKey,
  ]);

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
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    startedRef.current = null;
    notReadyRef.current = 0;
    setError(null);
  }

  async function uploadFile(file: File): Promise<void> {
    const generation = ++generationRef.current;
    setError(null);
    const validationError = await validateConceptNoteSourceFile(file);
    if (generation !== generationRef.current) return;
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
      if (generation !== generationRef.current) return;
      resetStart();
      setPicking(false);
      rememberPending({ uploadId: created.uploadId, filename: file.name });
    } catch {
      if (generation === generationRef.current) setError("upload-source-error");
    } finally {
      if (generation === generationRef.current) setSendingFile(null);
    }
  }

  async function retry(): Promise<void> {
    const generation = generationRef.current;
    if (pending && upload?.status === "failed") {
      await retryUpload({ runId, uploadId: pending.uploadId })
        .unwrap()
        .catch(() => {
          if (generation === generationRef.current)
            setError("conversion-retry-error");
        });
    } else if (pending) {
      resetStart();
      setStartTick((tick) => tick + 1);
    } else if (funderImport) {
      // Starting again on the same upload replaces the failed import.
      setError(null);
      await startRead(funderImport.upload_id, generation).catch(
        (cause: unknown) => {
          if (generation === generationRef.current)
            setError(funderApiErrorKey(cause));
        },
      );
    }
  }

  async function discard(): Promise<void> {
    const generation = ++generationRef.current;
    rememberPending(null);
    setSendingFile(null);
    setPicking(true);
    resetStart();
    // startRead cleans up an accepted response that arrives after cancellation.
    const inFlight = startPromiseRef.current;
    try {
      if (funderImport)
        await discardImport({
          runId,
          importId: funderImport.import_id,
        }).unwrap();
      if (inFlight) await inFlight;
    } catch (cause) {
      // Keep a failed discard visible so the user can retry it.
      if (generation === generationRef.current) setPicking(false);
      throw cause;
    }
  }

  function chooseAnotherFile(): void {
    generationRef.current += 1;
    rememberPending(null);
    setSendingFile(null);
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
