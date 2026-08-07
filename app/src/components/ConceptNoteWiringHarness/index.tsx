"use client";

import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Box,
  Flex,
  Grid,
  Heading,
  HStack,
  Icon,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { motion, useReducedMotion } from "framer-motion";
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

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useTranslation } from "@/i18n/client";
import { useAppDispatch } from "@/lib/hooks";
import { api } from "@/services/api";

import {
  formatFileSize,
  requireConceptNoteUploadIdentity,
  type ConceptNoteUploadStatus,
  uploadStatusTranslationKey,
  validateConceptNotePdf,
} from "./utils";

type Screen = "home" | "scope";
type RequestStage = "idle" | "loading" | "creating" | "uploading" | "polling";

interface ConceptNoteWiringHarnessProps {
  cityId: string;
  initialRunId?: string;
  lng: string;
}

interface CityResponse {
  data?: {
    name?: string | null;
    country?: string | null;
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
}

interface PanelHeadingProps {
  aside?: ReactNode;
  eyebrow: string;
  step: string;
  title: string;
}

const POLL_INTERVAL_MS = 2_000;

const uploadStatusStyles: Record<
  ConceptNoteUploadStatus | "idle",
  { color: string; surface: string }
> = {
  idle: { color: "content.tertiary", surface: "background.graySubtle" },
  queued: { color: "content.link", surface: "background.neutral" },
  processing: {
    color: "sentiment.warningDefault",
    surface: "sentiment.warningOverlay",
  },
  ready: {
    color: "sentiment.positiveDefault",
    surface: "sentiment.positiveOverlay",
  },
  failed: {
    color: "sentiment.negativeDefault",
    surface: "sentiment.negativeOverlay",
  },
};

async function responsePayload<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload === null) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return payload as T;
}

function createDefaultName(locale: string, label: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
  return `${label} · ${date}`;
}

function Overline({ children }: { children: ReactNode }) {
  return (
    <Text
      fontFamily="heading"
      fontSize="overline"
      fontWeight="semibold"
      letterSpacing="widest"
      lineHeight="16"
      color="content.tertiary"
      textTransform="uppercase"
    >
      {children}
    </Text>
  );
}

function StatusBadge({
  label,
  status,
}: {
  label: string;
  status: ConceptNoteUploadStatus | null;
}) {
  const styles = uploadStatusStyles[status ?? "idle"];

  return (
    <HStack
      gap={1.5}
      width="fit-content"
      border="1px solid"
      borderColor={styles.color}
      borderRadius="pill"
      bg={styles.surface}
      px={2.5}
      py={1}
    >
      <Box boxSize="6px" borderRadius="full" bg={styles.color} />
      <Text
        fontSize="label.sm"
        fontWeight="medium"
        lineHeight="16"
        color="content.secondary"
      >
        {label}
      </Text>
    </HStack>
  );
}

function PanelHeading({ aside, eyebrow, step, title }: PanelHeadingProps) {
  return (
    <Flex align="start" justify="space-between" gap={4}>
      <HStack align="start" gap={3}>
        <Flex
          boxSize="34px"
          flexShrink={0}
          align="center"
          justify="center"
          border="1px solid"
          borderColor="background.overlay"
          borderRadius="minimal"
          bg="background.alternativeLight"
          color="content.link"
          fontFamily="heading"
          fontSize="label.sm"
          fontWeight="semibold"
        >
          {step}
        </Flex>
        <Box>
          <Overline>{eyebrow}</Overline>
          <Heading
            as="h2"
            mt={0.5}
            fontFamily="heading"
            fontSize="title.md"
            fontWeight="medium"
            color="content.primary"
          >
            {title}
          </Heading>
        </Box>
      </HStack>
      {aside}
    </Flex>
  );
}

function WorkflowPanel({
  children,
  elevated = false,
}: {
  children: ReactNode;
  elevated?: boolean;
}) {
  return (
    <VStack
      as="section"
      align="stretch"
      gap={5}
      height={elevated ? "fit-content" : undefined}
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      p={{ base: 4, md: 5 }}
      boxShadow={elevated ? "2dp" : "1dp"}
    >
      {children}
    </VStack>
  );
}

function ScopeItem({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <VStack align="stretch" gap={1} minW={0} p={4}>
      <Overline>{label}</Overline>
      <Text fontSize="body.sm" fontWeight="semibold" color="content.primary">
        {value}
      </Text>
      <Text fontSize="label.sm" color="content.tertiary">
        {detail}
      </Text>
    </VStack>
  );
}

function CheckItem({
  complete,
  detail,
  step,
  title,
}: {
  complete: boolean;
  detail: string;
  step: string;
  title: string;
}) {
  return (
    <HStack align="start" gap={3}>
      <Flex
        boxSize="28px"
        flexShrink={0}
        align="center"
        justify="center"
        border="1px solid"
        borderColor={complete ? "sentiment.positiveDefault" : "border.neutral"}
        borderRadius="full"
        bg={complete ? "sentiment.positiveOverlay" : "base.light"}
        color={complete ? "sentiment.positiveDefault" : "content.tertiary"}
        fontSize="label.sm"
        fontWeight="semibold"
      >
        {complete ? <Icon as={FiCheck} /> : step}
      </Flex>
      <Box>
        <Text fontSize="body.sm" fontWeight="semibold" color="content.primary">
          {title}
        </Text>
        <Text mt={0.5} fontSize="label.sm" color="content.tertiary">
          {detail}
        </Text>
      </Box>
    </HStack>
  );
}

export function ConceptNoteWiringHarness({
  cityId,
  initialRunId,
  lng,
}: ConceptNoteWiringHarnessProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const dispatch = useAppDispatch();
  const reducedMotion = useReducedMotion() ?? false;
  const [screen, setScreen] = useState<Screen>(initialRunId ? "scope" : "home");
  const [cityName, setCityName] = useState(() => t("selected-city"));
  const [cityCountry, setCityCountry] = useState<string | null>(null);
  const [noteName, setNoteName] = useState(() =>
    createDefaultName(lng, t("default-note-name")),
  );
  const [sourceLabel, setSourceLabel] = useState(() =>
    t("supporting-document"),
  );
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
        if (active) {
          setCityName(payload.data?.name || t("selected-city"));
          setCityCountry(payload.data?.country || null);
        }
      })
      .catch(() => {
        // Protected workflow requests still surface authorization failures.
      });
    return () => {
      active = false;
    };
  }, [cityId, t]);

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
          throw new Error("Concept note response does not match the request");
        }
        if (active) {
          setRunId(run.run_id);
          setNoteName(run.name);
        }
      })
      .catch(() => {
        if (active) {
          setError(t("resume-error"));
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
  }, [cityId, resumeRunId, t]);

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
      throw new Error("Upload status response does not match the request");
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
      void pollUpload().catch(() => {
        setStage("idle");
        setError(t("refresh-status-error"));
      });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [pollUpload, t, uploadId, uploadStatus]);

  function resetHarness() {
    setNoteName(createDefaultName(lng, t("default-note-name")));
    setSourceLabel(t("supporting-document"));
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
      setError(t(validationError));
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
      throw new Error("Concept note resume failed");
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
      throw new Error("Run creation response is missing its ID");
    }
    setRunId(payload.run_id);
    dispatch(
      api.util.invalidateTags([{ type: "ConceptNoteRuns", id: cityId }]),
    );
    return payload.run_id;
  }

  async function uploadPdf(targetRunId: string) {
    if (!selectedFile) {
      throw new Error("A PDF is required before upload");
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
      setError(t("concept-note-name-required"));
      return;
    }
    if (!selectedFile) {
      setError(t("choose-pdf-error"));
      return;
    }

    try {
      const targetRunId = await startRun();
      await uploadPdf(targetRunId);
    } catch {
      setStage("idle");
      setError(t("wiring-request-failed"));
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
        throw new Error("Retry response does not match the upload");
      }
      setUploadStatus(identity.status);
      setUploadDetails((current) => ({ ...current, ...payload }));
    } catch {
      setStage("idle");
      setError(t("conversion-retry-error"));
    }
  }

  const isBusy = stage !== "idle";
  const statusLabel = t(uploadStatusTranslationKey(uploadStatus));
  const statusDetail =
    uploadStatus === "ready"
      ? uploadDetails?.pageCount
        ? t("pages-delivered", { count: uploadDetails.pageCount })
        : t("all-pages-delivered")
      : uploadStatus === "failed"
        ? t("conversion-needs-attention")
        : t("status-auto-refresh");
  const currentStageLabel =
    stage === "creating"
      ? t("creating-durable-run")
      : stage === "loading"
        ? t("loading-concept-note")
        : stage === "uploading"
          ? t("storing-source-pdf")
          : statusLabel;

  return (
    <Box
      as="main"
      minH="calc(100vh - 74px)"
      bg="background.alternativeLight"
      px={{ base: 4, md: 10 }}
      py={{ base: 6, md: 10 }}
    >
      <motion.div
        key={screen}
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        {screen === "home" ? (
          <VStack align="stretch" gap={8} maxW="1180px" mx="auto">
            <Flex
              align={{ base: "stretch", md: "end" }}
              direction={{ base: "column", md: "row" }}
              gap={5}
            >
              <Box flex={1}>
                <Overline>{t("wiring-eyebrow")}</Overline>
                <Heading
                  as="h1"
                  mt={1.5}
                  fontFamily="heading"
                  fontSize={{ base: "headline.md", md: "headline.lg" }}
                  fontWeight="medium"
                  color="content.primary"
                >
                  {t("title")}
                </Heading>
                <Text
                  maxW="660px"
                  mt={2}
                  fontSize="body.md"
                  lineHeight="24"
                  color="content.tertiary"
                >
                  {t("wiring-description")}
                </Text>
              </Box>
              <Button type="button" variant="solid" onClick={openNewRun}>
                {t("new-concept-note")}
                <Icon as={FiArrowRight} />
              </Button>
            </Flex>

            <Flex
              align={{ base: "start", sm: "center" }}
              direction={{ base: "column", sm: "row" }}
              gap={4}
              border="1px solid"
              borderColor="border.neutral"
              borderLeftWidth="3px"
              borderLeftColor="content.link"
              borderRadius="rounded"
              bg="base.light"
              p={4}
              boxShadow="1dp"
            >
              <Flex
                boxSize="36px"
                flexShrink={0}
                align="center"
                justify="center"
                borderRadius="rounded"
                bg="background.neutral"
                color="content.link"
              >
                <Icon as={FiMapPin} />
              </Flex>
              <Box flex={1}>
                <Overline>{t("shared-city-context")}</Overline>
                <Text mt={0.5} fontWeight="semibold" color="content.primary">
                  {cityName}
                </Text>
              </Box>
              <StatusBadge label={t("city-access-connected")} status="ready" />
            </Flex>

            <Box>
              <Flex align="end" justify="space-between" gap={4} mb={4}>
                <Box>
                  <Overline>{t("browser-runs")}</Overline>
                  <Heading
                    as="h2"
                    mt={1}
                    fontFamily="heading"
                    fontSize="headline.sm"
                    fontWeight="medium"
                    color="content.primary"
                  >
                    {t("wiring-checks")}
                  </Heading>
                </Box>
                <Text fontSize="label.sm" color="content.tertiary">
                  {t("browser-run-count", { count: runId ? 1 : 0 })}
                </Text>
              </Flex>

              {runId ? (
                <VStack
                  as="article"
                  align="stretch"
                  gap={4}
                  border="1px solid"
                  borderColor="border.neutral"
                  borderRadius="rounded"
                  bg="base.light"
                  p={5}
                  boxShadow="2dp"
                >
                  <Flex align="start" justify="space-between" gap={4}>
                    <Box>
                      <StatusBadge label={statusLabel} status={uploadStatus} />
                      <Heading
                        as="h3"
                        mt={3}
                        fontFamily="heading"
                        fontSize="title.md"
                        fontWeight="medium"
                        color="content.primary"
                      >
                        {noteName}
                      </Heading>
                    </Box>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setScreen("scope")}
                    >
                      {t("resume")}
                    </Button>
                  </Flex>
                  <Box
                    h="4px"
                    overflow="hidden"
                    borderRadius="pill"
                    bg="background.neutral"
                  >
                    <Box
                      h="full"
                      w={uploadStatus === "ready" ? "100%" : "42%"}
                      borderRadius="pill"
                      bg={
                        uploadStatus === "ready"
                          ? "sentiment.positiveDefault"
                          : "content.link"
                      }
                      transition={reducedMotion ? "none" : "width 180ms ease"}
                    />
                  </Box>
                  <Text fontSize="body.sm" color="content.tertiary">
                    {selectedFile?.name || t("run-upload-incomplete")}
                  </Text>
                </VStack>
              ) : (
                <Flex
                  align={{ base: "start", md: "center" }}
                  direction={{ base: "column", md: "row" }}
                  gap={4}
                  border="1px dashed"
                  borderColor="border.neutral"
                  borderRadius="rounded"
                  bg="base.light"
                  p={6}
                >
                  <Flex
                    boxSize="44px"
                    flexShrink={0}
                    align="center"
                    justify="center"
                    borderRadius="rounded"
                    bg="background.neutral"
                    color="content.link"
                  >
                    <Icon as={FiFileText} />
                  </Flex>
                  <Box flex={1}>
                    <Heading
                      as="h3"
                      fontFamily="heading"
                      fontSize="title.md"
                      fontWeight="medium"
                      color="content.primary"
                    >
                      {t("no-wiring-run-title")}
                    </Heading>
                    <Text mt={1} fontSize="body.sm" color="content.tertiary">
                      {t("no-wiring-run-description")}
                    </Text>
                  </Box>
                  <Button type="button" variant="outline" onClick={openNewRun}>
                    {t("start-check")}
                    <Icon as={FiArrowRight} />
                  </Button>
                </Flex>
              )}
            </Box>
          </VStack>
        ) : (
          <VStack align="stretch" gap={6} maxW="1320px" mx="auto">
            <Button
              type="button"
              width="fit-content"
              size="sm"
              variant="outline"
              onClick={() => setScreen("home")}
            >
              <Icon as={FiArrowLeft} />
              {t("all-concept-notes")}
            </Button>

            <Flex
              align={{ base: "start", md: "center" }}
              direction={{ base: "column", md: "row" }}
              gap={4}
            >
              <Box flex={1}>
                <Overline>{t("scope-context-eyebrow")}</Overline>
                <Heading
                  as="h1"
                  mt={1.5}
                  fontFamily="heading"
                  fontSize={{ base: "headline.md", md: "headline.lg" }}
                  fontWeight="medium"
                  color="content.primary"
                >
                  {resumeRunId
                    ? t("resume-concept-note")
                    : t("start-concept-note")}
                </Heading>
              </Box>
              <StatusBadge label={t("local-wiring-harness")} status={null} />
            </Flex>

            <Grid
              overflow="hidden"
              gridTemplateColumns={{
                base: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
                xl: "repeat(4, minmax(0, 1fr))",
              }}
              border="1px solid"
              borderColor="border.neutral"
              borderRadius="rounded"
              bg="base.light"
              boxShadow="1dp"
            >
              <ScopeItem
                label={t("city")}
                value={cityName}
                detail={cityCountry || t("city-access-connected")}
              />
              <ScopeItem
                label={t("workflow")}
                value={t("run-scoped-upload")}
                detail={t("workflow-detail")}
              />
              <ScopeItem
                label={t("funder")}
                value={t("not-set")}
                detail={t("optional-check")}
              />
              <ScopeItem
                label={t("status")}
                value={statusLabel}
                detail={
                  runId ? t("durable-run-created") : t("waiting-to-start")
                }
              />
            </Grid>

            <form onSubmit={submitWiringTest}>
              <Grid
                gridTemplateColumns={{
                  base: "1fr",
                  lg: "minmax(0, 1fr) 380px",
                }}
                gap={6}
              >
                <VStack align="stretch" gap={5}>
                  <WorkflowPanel>
                    <PanelHeading
                      step="01"
                      eyebrow={t("run-identity")}
                      title={t("name-application")}
                      aside={
                        runId ? (
                          <StatusBadge label={t("persisted")} status="ready" />
                        ) : null
                      }
                    />
                    <Field label={t("concept-note-name")} required>
                      <Input
                        value={noteName}
                        maxLength={120}
                        disabled={Boolean(resumeRunId || runId)}
                        bg="base.light"
                        borderColor="border.neutral"
                        onChange={(event) => setNoteName(event.target.value)}
                      />
                    </Field>
                    {runId && (
                      <Grid
                        gridTemplateColumns="auto minmax(0, 1fr)"
                        alignItems="center"
                        gap={3}
                        borderRadius="minimal"
                        bg="background.alternativeLight"
                        p={3}
                      >
                        <Text fontSize="label.sm" color="content.tertiary">
                          {t("run-id")}
                        </Text>
                        <Text
                          as="code"
                          overflow="hidden"
                          fontSize="label.sm"
                          color="content.secondary"
                          textOverflow="ellipsis"
                          whiteSpace="nowrap"
                        >
                          {runId}
                        </Text>
                      </Grid>
                    )}
                  </WorkflowPanel>

                  <WorkflowPanel>
                    <PanelHeading
                      step="02"
                      eyebrow={t("connected-context")}
                      title={t("check-purpose")}
                    />
                    <Grid
                      gridTemplateColumns={{
                        base: "1fr",
                        md: "repeat(3, 1fr)",
                      }}
                      gap={5}
                    >
                      <CheckItem
                        complete
                        step="1"
                        title={t("city-authorization")}
                        detail={t("validated-before-file")}
                      />
                      <CheckItem
                        complete={Boolean(runId)}
                        step="2"
                        title={t("cnb-run-persistence")}
                        detail={t("authoritative-row")}
                      />
                      <CheckItem
                        complete={uploadStatus === "ready"}
                        step="3"
                        title={t("ocr-pointer-delivery")}
                        detail={t("markdown-storage")}
                      />
                    </Grid>
                  </WorkflowPanel>

                  <HStack
                    align="start"
                    gap={3}
                    borderLeft="3px solid"
                    borderLeftColor="content.link"
                    borderRadius="minimal"
                    bg="background.neutral"
                    p={4}
                  >
                    <Icon as={FiInfo} mt={0.5} color="content.link" />
                    <Text fontSize="body.sm" color="content.secondary">
                      {t("local-harness-note")}
                    </Text>
                  </HStack>
                </VStack>

                <WorkflowPanel elevated>
                  <PanelHeading
                    step="03"
                    eyebrow={t("your-file")}
                    title={t("upload-one-pdf")}
                  />

                  <Field label={t("source-label")}>
                    <Input
                      value={sourceLabel}
                      maxLength={255}
                      disabled={isBusy || Boolean(uploadId)}
                      bg="base.light"
                      borderColor="border.neutral"
                      onChange={(event) => setSourceLabel(event.target.value)}
                    />
                  </Field>

                  {!selectedFile ? (
                    <VStack
                      gap={3}
                      border="1px dashed"
                      borderColor={
                        isDragging ? "content.link" : "border.neutral"
                      }
                      borderRadius="rounded"
                      bg={
                        isDragging
                          ? "background.neutral"
                          : "background.alternativeLight"
                      }
                      p={6}
                      textAlign="center"
                      transition={
                        reducedMotion
                          ? "none"
                          : "background-color 160ms ease, border-color 160ms ease"
                      }
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={onDrop}
                    >
                      <Icon
                        as={FiUploadCloud}
                        boxSize={6}
                        color="content.link"
                      />
                      <Box>
                        <Text
                          fontSize="body.sm"
                          fontWeight="semibold"
                          color="content.primary"
                        >
                          {t("drop-pdf")}
                        </Text>
                        <Text
                          mt={1}
                          fontSize="label.sm"
                          color="content.tertiary"
                        >
                          {t("choose-file-help")}
                        </Text>
                      </Box>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fileInput.current?.click()}
                      >
                        {t("choose-pdf")}
                      </Button>
                      <Input
                        ref={fileInput}
                        display="none"
                        type="file"
                        accept="application/pdf,.pdf"
                        aria-label={t("choose-pdf")}
                        onChange={onFileChange}
                      />
                    </VStack>
                  ) : (
                    <HStack
                      align="start"
                      gap={3}
                      border="1px solid"
                      borderColor="border.neutral"
                      borderRadius="rounded"
                      bg="background.alternativeLight"
                      p={4}
                    >
                      <Flex
                        boxSize="36px"
                        flexShrink={0}
                        align="center"
                        justify="center"
                        borderRadius="rounded"
                        bg="background.neutral"
                        color="content.link"
                      >
                        <Icon as={FiFileText} />
                      </Flex>
                      <Box minW={0} flex={1}>
                        <Text
                          overflow="hidden"
                          fontSize="body.sm"
                          fontWeight="semibold"
                          color="content.primary"
                          textOverflow="ellipsis"
                          whiteSpace="nowrap"
                        >
                          {selectedFile.name}
                        </Text>
                        <Text
                          mt={1}
                          fontSize="label.sm"
                          color="content.tertiary"
                        >
                          {formatFileSize(selectedFile.size)} · {sourceLabel}
                        </Text>
                        {uploadId && (
                          <Text
                            as="code"
                            display="block"
                            overflow="hidden"
                            mt={2}
                            fontSize="label.sm"
                            color="content.secondary"
                            textOverflow="ellipsis"
                            whiteSpace="nowrap"
                          >
                            {uploadId}
                          </Text>
                        )}
                      </Box>
                      {!uploadId && !isBusy && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={t("remove-selected-pdf")}
                          onClick={() => void chooseFile(null)}
                        >
                          <Icon as={FiX} />
                        </Button>
                      )}
                    </HStack>
                  )}

                  {(uploadStatus || isBusy) && (
                    <motion.div
                      initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <HStack
                        align="start"
                        gap={3}
                        border="1px solid"
                        borderColor={
                          uploadStatusStyles[uploadStatus ?? "queued"].color
                        }
                        borderRadius="rounded"
                        bg={
                          uploadStatusStyles[uploadStatus ?? "queued"].surface
                        }
                        p={4}
                      >
                        {isBusy ? (
                          <Spinner
                            size="sm"
                            mt={0.5}
                            color={
                              uploadStatusStyles[uploadStatus ?? "queued"].color
                            }
                          />
                        ) : (
                          <Box
                            boxSize="8px"
                            mt={1.5}
                            borderRadius="full"
                            bg={
                              uploadStatusStyles[uploadStatus ?? "queued"].color
                            }
                          />
                        )}
                        <Box>
                          <Text
                            fontSize="body.sm"
                            fontWeight="semibold"
                            color="content.primary"
                          >
                            {currentStageLabel}
                          </Text>
                          <Text
                            mt={0.5}
                            fontSize="label.sm"
                            color="content.tertiary"
                          >
                            {statusDetail}
                          </Text>
                        </Box>
                      </HStack>
                    </motion.div>
                  )}

                  {error && (
                    <HStack
                      align="start"
                      gap={3}
                      role="alert"
                      borderLeft="3px solid"
                      borderLeftColor="sentiment.negativeDefault"
                      borderRadius="minimal"
                      bg="sentiment.negativeOverlay"
                      p={4}
                    >
                      <Icon
                        as={FiInfo}
                        mt={0.5}
                        color="sentiment.negativeDefault"
                      />
                      <Text fontSize="body.sm" color="content.secondary">
                        {error}
                      </Text>
                    </HStack>
                  )}

                  {uploadStatus === "failed" && uploadId ? (
                    <Button
                      type="button"
                      variant="solid"
                      loading={isBusy}
                      onClick={() => void retryUpload()}
                    >
                      <Icon as={FiRefreshCw} />
                      {t("retry-conversion")}
                    </Button>
                  ) : uploadStatus === "ready" ? (
                    <Button
                      type="button"
                      variant="solid"
                      onClick={() => setScreen("home")}
                    >
                      <Icon as={FiCheck} />
                      {t("wiring-flow-ready")}
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      variant="solid"
                      loading={isBusy}
                      loadingText={t("working")}
                      disabled={Boolean(uploadId)}
                    >
                      {runId
                        ? t("upload-and-continue")
                        : t("create-run-and-convert")}
                      <Icon as={FiArrowRight} />
                    </Button>
                  )}
                </WorkflowPanel>
              </Grid>
            </form>
          </VStack>
        )}
      </motion.div>
    </Box>
  );
}
