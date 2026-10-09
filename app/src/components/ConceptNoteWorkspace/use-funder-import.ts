"use client";

import { useEffect, useRef, useState } from "react";

import {
  conceptNoteSourceLabel,
  validateConceptNoteSourceFile,
} from "@/components/ConceptNoteWiringHarness/utils";
import { useAppDispatch } from "@/lib/hooks";
import { api } from "@/services/api";
import type { ConceptNoteFunderImport } from "@/util/types";

import { funderApiErrorKey, funderImportErrorKey } from "./funder-form";

const POLL_MS = 2000;

type UploadedFile = { uploadId: string; filename: string };

/** Browser-only progress; the server's import is the source of truth after start. */
interface LocalState {
  /** File being uploaded and handed to the import. */
  sending: string | null;
  /** Upload whose import could not be started, kept so it can be retried. */
  unstarted: UploadedFile | null;
  /** Hide the server's import while the user picks a different file. */
  picking: boolean;
  /** i18n key for a file or request that failed in the browser. */
  error: string | null;
}

const IDLE: LocalState = {
  sending: null,
  unstarted: null,
  picking: false,
  error: null,
};

export type FunderImportPhase =
  "idle" | "uploading" | "converting" | "reading" | "ready" | "failed";

/** Status line key for each phase, shared by the panel and the rail entry. */
export const FUNDER_IMPORT_PHASE_LABEL: Record<FunderImportPhase, string> = {
  idle: "funder-add-entry-help",
  uploading: "funder-import-uploading",
  converting: "status-converting",
  reading: "funder-import-reading",
  ready: "funder-import-ready",
  failed: "funder-import-failed",
};

export interface FunderImportFlow {
  phase: FunderImportPhase;
  funderImport: ConceptNoteFunderImport | null;
  filename: string | null;
  /** i18n key for the current failure or a file that could not be sent. */
  error: string | null;
  busy: boolean;
  uploadFile: (file: File) => Promise<void>;
  retry: () => Promise<void>;
  /** Forget the pending import; rejects with the RTK error. */
  discard: () => Promise<void>;
  /** Show the file picker again, e.g. to try a different document. */
  chooseAnotherFile: () => void;
}

/**
 * Drives adding a funder from a document: upload the file through the note's
 * upload pipeline and start the import straight away. Climate Advisor waits
 * for the conversion, so the browser only polls the import. Lives at the
 * workspace level so the import keeps progressing after the dialog closes.
 */
export function useFunderImport({
  cityId,
  runId,
}: {
  cityId: string;
  runId: string;
}): FunderImportFlow {
  const dispatch = useAppDispatch();
  // Bumped by every user action so a late response from an earlier one is ignored.
  const generationRef = useRef(0);
  const [local, setLocal] = useState<LocalState>(IDLE);

  const { currentData } = api.useGetConceptNoteFunderImportQuery(runId, {
    refetchOnMountOrArgChange: true,
  });
  const funderImport = currentData?.funder_import ?? null;
  api.useGetConceptNoteFunderImportQuery(runId, {
    skip: funderImport?.status !== "processing",
    pollingInterval: POLL_MS,
  });
  const [uploadSource] = api.useUploadConceptNoteSourceMutation();
  const [retryUpload, retryUploadState] =
    api.useRetryConceptNoteUploadMutation();
  const [startImport, startState] =
    api.useStartConceptNoteFunderImportMutation();
  const [discardImport, discardState] =
    api.useDiscardConceptNoteFunderImportMutation();

  // Forget browser-only progress when the workspace switches to another note.
  useEffect(() => {
    generationRef.current += 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(IDLE);
  }, [runId]);

  /** Start reading an upload; an import a superseded action created is removed. */
  async function start(upload: UploadedFile, generation: number) {
    try {
      const started = await startImport({
        runId,
        uploadId: upload.uploadId,
      }).unwrap();
      if (generation !== generationRef.current) {
        if (started.funder_import) {
          await discardImport({
            runId,
            importId: started.funder_import.import_id,
          });
        }
        return;
      }
      dispatch(
        api.util.upsertQueryData("getConceptNoteFunderImport", runId, started),
      );
      setLocal(IDLE);
    } catch (cause) {
      if (generation === generationRef.current) {
        setLocal({
          ...IDLE,
          unstarted: upload,
          error: funderApiErrorKey(cause),
        });
      }
    }
  }

  async function uploadFile(file: File): Promise<void> {
    const generation = ++generationRef.current;
    const validationError = await validateConceptNoteSourceFile(file);
    if (generation !== generationRef.current) return;
    if (validationError) {
      setLocal((state) => ({ ...state, error: validationError }));
      return;
    }
    setLocal({ ...IDLE, sending: file.name });
    try {
      const formData = new FormData();
      formData.set("file", file);
      // The funder document also becomes an ordinary source of the note.
      formData.set("sourceLabel", conceptNoteSourceLabel(file.name));
      const { uploadId } = await uploadSource({
        cityId,
        formData,
        runId,
      }).unwrap();
      if (generation !== generationRef.current) return;
      await start({ uploadId, filename: file.name }, generation);
    } catch {
      if (generation === generationRef.current) {
        setLocal({ ...IDLE, picking: true, error: "upload-source-error" });
      }
    }
  }

  async function retry(): Promise<void> {
    const generation = ++generationRef.current;
    const upload =
      local.unstarted ??
      (funderImport && {
        uploadId: funderImport.upload_id,
        filename: funderImport.filename,
      });
    if (!upload) return;
    setLocal((state) => ({ ...state, error: null }));
    if (!local.unstarted && funderImport?.error_code === "upload_failed") {
      try {
        await retryUpload({ runId, uploadId: upload.uploadId }).unwrap();
      } catch {
        if (generation === generationRef.current) {
          setLocal((state) => ({ ...state, error: "conversion-retry-error" }));
        }
        return;
      }
    }
    // Starting again on the same upload replaces the failed import.
    await start(upload, generation);
  }

  async function discard(): Promise<void> {
    generationRef.current += 1;
    setLocal({ ...IDLE, picking: true });
    if (!funderImport) return;
    try {
      await discardImport({ runId, importId: funderImport.import_id }).unwrap();
    } catch (cause) {
      // Keep a failed discard visible so the user can retry it.
      setLocal(IDLE);
      throw cause;
    }
  }

  function chooseAnotherFile(): void {
    generationRef.current += 1;
    setLocal({ ...IDLE, picking: true });
  }

  let phase: FunderImportPhase = "idle";
  let filename: string | null = null;
  let failure: string | null = null;
  if (local.sending) {
    phase = "uploading";
    filename = local.sending;
  } else if (local.unstarted) {
    phase = "failed";
    filename = local.unstarted.filename;
  } else if (funderImport && !local.picking) {
    filename = funderImport.filename;
    phase =
      funderImport.status === "processing"
        ? (funderImport.stage ?? "reading")
        : funderImport.status;
    if (phase === "failed") {
      failure = funderImportErrorKey(funderImport.error_code);
    }
  }

  return {
    phase,
    funderImport,
    filename,
    error: local.error ?? failure,
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
