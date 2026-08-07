"use client";

/* eslint-disable i18next/no-literal-string */

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiFileText,
  FiInfo,
  FiMapPin,
  FiRefreshCw,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";

import styles from "./ConceptNoteWiringHarness.module.css";
import {
  formatFileSize,
  requireConceptNoteUploadIdentity,
  type ConceptNoteUploadStatus,
  uploadStatusLabel,
  validateConceptNotePdf,
} from "./utils";

type Screen = "home" | "scope";
type RequestStage = "idle" | "loading" | "creating" | "uploading" | "polling";

interface CityResponse {
  data?: {
    cityId?: string;
    name?: string | null;
    country?: string | null;
    projectId?: string | null;
  };
}

interface RunResponse {
  run_id?: string;
  city_id?: string;
  name?: string;
}

interface UploadResponse {
  uploadId?: string;
  runId?: string;
  status?: ConceptNoteUploadStatus;
  pageCount?: number | null;
  errorCode?: string;
}

const POLL_INTERVAL_MS = 2_000;

async function responsePayload<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; error?: string } | string;
    message?: string;
    detail?: string;
  };
  if (response.ok) {
    return payload;
  }

  const nestedError =
    typeof payload.error === "object"
      ? payload.error.message || payload.error.error
      : payload.error;
  throw new Error(
    nestedError ||
      payload.message ||
      payload.detail ||
      `Request failed with status ${response.status}`,
  );
}

function newDefaultName() {
  return `Concept note · ${new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date())}`;
}

export default function ConceptNoteWiringHarness({
  cityId,
  initialRunId,
}: {
  cityId: string;
  initialRunId?: string;
}) {
  const [screen, setScreen] = useState<Screen>(initialRunId ? "scope" : "home");
  const [cityName, setCityName] = useState("Selected city");
  const [cityCountry, setCityCountry] = useState<string | null>(null);
  const [noteName, setNoteName] = useState(newDefaultName);
  const [sourceLabel, setSourceLabel] = useState("Supporting document");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<RequestStage>(
    initialRunId ? "loading" : "idle",
  );
  const [resumeRunId, setResumeRunId] = useState(initialRunId ?? null);
  const [runId, setRunId] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] =
    useState<ConceptNoteUploadStatus | null>(null);
  const [uploadDetails, setUploadDetails] = useState<UploadResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/city/${cityId}`)
      .then((response) => responsePayload<CityResponse>(response))
      .then((payload) => {
        if (!active) {
          return;
        }
        setCityName(payload.data?.name || "Selected city");
        setCityCountry(payload.data?.country || null);
      })
      .catch(() => {
        // The protected workflow calls still surface authorization failures.
      });
    return () => {
      active = false;
    };
  }, [cityId]);

  useEffect(() => {
    if (!resumeRunId) {
      return;
    }

    let active = true;
    setStage("loading");
    setError(null);
    void fetch(`/api/v1/concept-notes/${encodeURIComponent(resumeRunId)}`, {
      cache: "no-store",
    })
      .then((response) => responsePayload<RunResponse>(response))
      .then((run) => {
        if (
          !run.run_id ||
          !run.name ||
          run.run_id !== resumeRunId ||
          run.city_id !== cityId
        ) {
          throw new Error("The selected concept note could not be resumed.");
        }
        if (active) {
          setRunId(run.run_id);
          setNoteName(run.name);
        }
      })
      .catch((resumeError: unknown) => {
        if (active) {
          setError(
            resumeError instanceof Error
              ? resumeError.message
              : "The selected concept note could not be resumed.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setStage("idle");
        }
      });
    return () => {
      active = false;
    };
  }, [cityId, resumeRunId]);

  const pollUpload = useCallback(async () => {
    if (!runId || !uploadId) {
      return;
    }
    const response = await fetch(
      `/api/v1/concept-notes/${runId}/uploads/${uploadId}`,
      { cache: "no-store" },
    );
    const payload = await responsePayload<UploadResponse>(response);
    const identity = requireConceptNoteUploadIdentity(payload);
    if (identity.uploadId !== uploadId || payload.runId !== runId) {
      throw new Error("Upload status response does not match this run.");
    }
    setUploadDetails(payload);
    setUploadStatus(identity.status);
    setStage(
      identity.status === "queued" || identity.status === "processing"
        ? "polling"
        : "idle",
    );
  }, [runId, uploadId]);

  useEffect(() => {
    if (
      !uploadId ||
      (uploadStatus !== "queued" && uploadStatus !== "processing")
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void pollUpload().catch((pollError: unknown) => {
        setStage("idle");
        setError(
          pollError instanceof Error
            ? pollError.message
            : "Could not refresh the conversion status.",
        );
      });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [pollUpload, uploadId, uploadStatus]);

  function resetHarness() {
    setNoteName(newDefaultName());
    setSourceLabel("Supporting document");
    setSelectedFile(null);
    setStage("idle");
    setRunId(null);
    setUploadId(null);
    setUploadStatus(null);
    setUploadDetails(null);
    setError(null);
    setResumeRunId(null);
    idempotencyKey.current = crypto.randomUUID();
  }

  function openNewRun() {
    resetHarness();
    setScreen("scope");
  }

  async function chooseFile(file: File | null) {
    setError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const validationError = await validateConceptNotePdf(file);
    if (validationError) {
      setSelectedFile(null);
      setError(validationError);
      return;
    }
    setSelectedFile(file);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void chooseFile(event.target.files?.[0] || null);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void chooseFile(event.dataTransfer.files?.[0] || null);
  }

  async function startRun(): Promise<string> {
    if (runId) {
      return runId;
    }
    if (resumeRunId) {
      throw new Error("The selected concept note could not be resumed.");
    }
    setStage("creating");
    const response = await fetch("/api/v1/concept-notes/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: noteName.trim(),
        city_id: cityId,
        idempotency_key: idempotencyKey.current,
      }),
    });
    const payload = await responsePayload<RunResponse>(response);
    if (!payload.run_id) {
      throw new Error("Run creation response is missing a run ID.");
    }
    setRunId(payload.run_id);
    return payload.run_id;
  }

  async function uploadPdf(targetRunId: string) {
    if (!selectedFile) {
      throw new Error("Choose a PDF before starting the wiring test.");
    }
    setStage("uploading");
    const formData = new FormData();
    formData.set("file", selectedFile);
    if (sourceLabel.trim()) {
      formData.set("sourceLabel", sourceLabel.trim());
    }
    const response = await fetch(
      `/api/v1/concept-notes/${targetRunId}/uploads`,
      { method: "POST", body: formData },
    );
    const payload = await responsePayload<UploadResponse>(response);
    const identity = requireConceptNoteUploadIdentity(payload);
    setUploadId(identity.uploadId);
    setUploadStatus(identity.status);
    setUploadDetails(payload);
    setStage(
      identity.status === "queued" || identity.status === "processing"
        ? "polling"
        : "idle",
    );
  }

  async function submitWiringTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!noteName.trim()) {
      setError("Give this concept note a name.");
      return;
    }
    if (!selectedFile) {
      setError("Choose a PDF before starting the wiring test.");
      return;
    }

    try {
      const targetRunId = await startRun();
      await uploadPdf(targetRunId);
    } catch (requestError) {
      setStage("idle");
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The wiring test could not be started.",
      );
    }
  }

  async function retryUpload() {
    if (!runId || !uploadId) {
      return;
    }
    setError(null);
    setStage("polling");
    try {
      const response = await fetch(
        `/api/v1/concept-notes/${runId}/uploads/${uploadId}/retry`,
        { method: "POST" },
      );
      const payload = await responsePayload<UploadResponse>(response);
      const identity = requireConceptNoteUploadIdentity(payload);
      if (identity.uploadId !== uploadId) {
        throw new Error("Retry response does not match this upload.");
      }
      setUploadStatus(identity.status);
      setUploadDetails((current) => ({ ...current, ...payload }));
    } catch (retryError) {
      setStage("idle");
      setError(
        retryError instanceof Error
          ? retryError.message
          : "The conversion could not be retried.",
      );
    }
  }

  const isBusy = stage !== "idle";
  const statusLabel = uploadStatusLabel(uploadStatus);

  if (screen === "home") {
    return (
      <main className={styles.page}>
        <section className={`${styles.surface} ${styles.homeSurface}`}>
          <div className={styles.titleRow}>
            <div>
              <p className={styles.eyebrow}>
                Concept Note Builder · local wiring
              </p>
              <h1>Concept notes</h1>
              <p className={styles.lede}>
                One concept note is one funder application. This lightweight
                screen exercises run creation, PDF OCR, and durable delivery.
              </p>
            </div>
            <button className={styles.primaryButton} onClick={openNewRun}>
              <span>New concept note</span>
              <FiArrowRight aria-hidden />
            </button>
          </div>

          <div className={styles.contextStrip}>
            <div className={styles.contextIdentity}>
              <span className={styles.iconTile}>
                <FiMapPin aria-hidden />
              </span>
              <div>
                <span className={styles.miniLabel}>Shared city context</span>
                <strong>{cityName}</strong>
              </div>
            </div>
            <span className={styles.connectionBadge}>
              <FiCheck aria-hidden />
              City access connected
            </span>
          </div>

          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.miniLabel}>Runs in this browser</span>
              <h2>Wiring checks</h2>
            </div>
            <span className={styles.countBadge}>
              {runId ? "1 run" : "0 runs"}
            </span>
          </div>

          {runId ? (
            <article className={styles.runCard}>
              <div className={styles.runCardTop}>
                <div>
                  <span
                    className={`${styles.statusBadge} ${
                      styles[`status_${uploadStatus || "idle"}`]
                    }`}
                  >
                    {statusLabel}
                  </span>
                  <h3>{noteName}</h3>
                </div>
                <button
                  className={styles.secondaryButton}
                  onClick={() => setScreen("scope")}
                >
                  Resume
                </button>
              </div>
              <div className={styles.progressTrack} aria-hidden>
                <span
                  className={
                    uploadStatus === "ready"
                      ? styles.progressComplete
                      : styles.progressActive
                  }
                />
              </div>
              <p>
                {selectedFile?.name || "Run created; PDF upload is incomplete."}
              </p>
            </article>
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>
                <FiFileText aria-hidden />
              </span>
              <div>
                <h3>No wiring run yet</h3>
                <p>
                  Start one run and upload a small PDF to exercise S1 → S2 and
                  the backend persistence flow.
                </p>
              </div>
              <button className={styles.textButton} onClick={openNewRun}>
                Start the check <FiArrowRight aria-hidden />
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.surface}>
        <button className={styles.backButton} onClick={() => setScreen("home")}>
          <FiArrowLeft aria-hidden />
          All concept notes
        </button>

        <div className={styles.scopeHeader}>
          <div>
            <p className={styles.eyebrow}>S2 · Scope and context</p>
            <h1>
              {resumeRunId ? "Resume concept note" : "Start a new concept note"}
            </h1>
          </div>
          <span className={styles.localBadge}>Local wiring harness</span>
        </div>

        <div className={styles.scopeStrip}>
          <div>
            <span className={styles.miniLabel}>City</span>
            <strong>{cityName}</strong>
            {cityCountry && <small>{cityCountry}</small>}
          </div>
          <div>
            <span className={styles.miniLabel}>Workflow</span>
            <strong>Run-scoped upload</strong>
            <small>PDF → OCR → CNB pointer</small>
          </div>
          <div>
            <span className={styles.miniLabel}>Funder</span>
            <strong>Not set</strong>
            <small>Optional for this check</small>
          </div>
          <div>
            <span className={styles.miniLabel}>Status</span>
            <strong>{statusLabel}</strong>
            <small>{runId ? "Durable run created" : "Waiting to start"}</small>
          </div>
        </div>

        <form className={styles.workspace} onSubmit={submitWiringTest}>
          <div className={styles.mainColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.stepNumber}>01</span>
                  <div>
                    <span className={styles.miniLabel}>Run identity</span>
                    <h2>Name this application</h2>
                  </div>
                </div>
                {runId && (
                  <span className={styles.connectionBadge}>
                    <FiCheck aria-hidden /> Persisted
                  </span>
                )}
              </div>
              <label className={styles.field}>
                <span>Concept note name</span>
                <input
                  value={noteName}
                  onChange={(event) => setNoteName(event.target.value)}
                  maxLength={120}
                  disabled={Boolean(resumeRunId || runId)}
                  required
                />
              </label>
              {runId && (
                <div className={styles.technicalId}>
                  <span>Run ID</span>
                  <code>{runId}</code>
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.stepNumber}>02</span>
                  <div>
                    <span className={styles.miniLabel}>Connected context</span>
                    <h2>What this check proves</h2>
                  </div>
                </div>
              </div>
              <div className={styles.checkGrid}>
                <div className={styles.checkItem}>
                  <span
                    className={`${styles.checkMark} ${styles.checkMarkReady}`}
                  >
                    <FiCheck aria-hidden />
                  </span>
                  <div>
                    <strong>City authorization</strong>
                    <small>Validated before file consumption</small>
                  </div>
                </div>
                <div className={styles.checkItem}>
                  <span
                    className={`${styles.checkMark} ${
                      runId ? styles.checkMarkReady : ""
                    }`}
                  >
                    {runId ? <FiCheck aria-hidden /> : "2"}
                  </span>
                  <div>
                    <strong>CNB run persistence</strong>
                    <small>Authoritative row in Climate Advisor</small>
                  </div>
                </div>
                <div className={styles.checkItem}>
                  <span
                    className={`${styles.checkMark} ${
                      uploadStatus === "ready" ? styles.checkMarkReady : ""
                    }`}
                  >
                    {uploadStatus === "ready" ? <FiCheck aria-hidden /> : "3"}
                  </span>
                  <div>
                    <strong>OCR and pointer delivery</strong>
                    <small>Markdown remains in CityCatalyst S3</small>
                  </div>
                </div>
              </div>
            </section>

            <div className={styles.infoNote}>
              <FiInfo aria-hidden />
              <p>
                This page is intentionally a local integration harness. It does
                not implement the production Concept Note Builder UI planned for
                CC-604.
              </p>
            </div>
          </div>

          <aside className={styles.sideColumn}>
            <section className={`${styles.panel} ${styles.uploadPanel}`}>
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.stepNumber}>03</span>
                  <div>
                    <span className={styles.miniLabel}>Your file</span>
                    <h2>Upload one PDF</h2>
                  </div>
                </div>
              </div>

              <label className={styles.field}>
                <span>Source label</span>
                <input
                  value={sourceLabel}
                  onChange={(event) => setSourceLabel(event.target.value)}
                  maxLength={255}
                  disabled={isBusy || Boolean(uploadId)}
                />
              </label>

              {!selectedFile ? (
                <div
                  className={`${styles.dropzone} ${
                    isDragging ? styles.dropzoneActive : ""
                  }`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                >
                  <FiUploadCloud aria-hidden />
                  <strong>Drop a PDF here</strong>
                  <span>or choose a file · maximum 20 MiB</span>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => fileInput.current?.click()}
                  >
                    Choose PDF
                  </button>
                  <input
                    ref={fileInput}
                    className={styles.hiddenInput}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={onFileChange}
                  />
                </div>
              ) : (
                <div className={styles.fileCard}>
                  <span className={styles.fileIcon}>
                    <FiFileText aria-hidden />
                  </span>
                  <div className={styles.fileMeta}>
                    <strong>{selectedFile.name}</strong>
                    <span>
                      {formatFileSize(selectedFile.size)} · {sourceLabel}
                    </span>
                    {uploadId && <code>{uploadId}</code>}
                  </div>
                  {!uploadId && !isBusy && (
                    <button
                      type="button"
                      className={styles.removeButton}
                      aria-label="Remove selected PDF"
                      onClick={() => void chooseFile(null)}
                    >
                      <FiX aria-hidden />
                    </button>
                  )}
                </div>
              )}

              {(uploadStatus || isBusy) && (
                <div
                  className={`${styles.statusPanel} ${
                    styles[`statusPanel_${uploadStatus || "queued"}`]
                  }`}
                >
                  <div>
                    <span className={styles.statusPulse} aria-hidden />
                    <div>
                      <strong>
                        {stage === "creating"
                          ? "Creating durable run"
                          : stage === "loading"
                            ? "Loading concept note"
                            : stage === "uploading"
                              ? "Storing source PDF"
                              : statusLabel}
                      </strong>
                      <small>
                        {uploadStatus === "ready"
                          ? uploadDetails?.pageCount === 1
                            ? "1 page delivered"
                            : `${uploadDetails?.pageCount || "All"} pages delivered`
                          : uploadStatus === "failed"
                            ? uploadDetails?.errorCode ||
                              "Conversion needs attention"
                            : "The page refreshes this status automatically"}
                      </small>
                    </div>
                  </div>
                  {(uploadStatus === "queued" ||
                    uploadStatus === "processing" ||
                    isBusy) && <span className={styles.loadingLine} />}
                </div>
              )}

              {error && (
                <div className={styles.errorMessage} role="alert">
                  <FiInfo aria-hidden />
                  <span>{error}</span>
                </div>
              )}

              {uploadStatus === "failed" && uploadId ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void retryUpload()}
                  disabled={isBusy}
                >
                  <FiRefreshCw aria-hidden />
                  Retry conversion
                </button>
              ) : uploadStatus === "ready" ? (
                <button
                  type="button"
                  className={styles.successButton}
                  onClick={() => setScreen("home")}
                >
                  <FiCheck aria-hidden />
                  Wiring flow is ready
                </button>
              ) : (
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={isBusy || Boolean(uploadId)}
                >
                  {isBusy
                    ? "Working…"
                    : runId
                      ? "Upload and continue"
                      : "Create run and convert"}
                  {!isBusy && <FiArrowRight aria-hidden />}
                </button>
              )}
            </section>
          </aside>
        </form>
      </section>
    </main>
  );
}
