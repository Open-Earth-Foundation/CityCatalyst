"use client";

import { useState } from "react";
import {
  Box,
  Heading,
  HStack,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { ReviewButton as Button } from "./review-button";
import { documentWorkspaceErrorKind } from "./workspace-errors";
import { Field } from "@/components/ui/field";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/client";
import { documentWorkspaceApi } from "@/services/document-workspace-api";
import type {
  DocumentPointCommand,
  DocumentWorkspacePoint,
} from "@/util/document-workspace";
import {
  currentPointCandidate,
  parsePointAnswer,
  pointValueText,
} from "./point-state";

export function DocumentPointCard({
  point,
  runId,
  lng,
  onAddSource,
  compact = false,
  onOpenPoint,
  sourceBusy = false,
  onOpenContext,
}: {
  point: DocumentWorkspacePoint;
  runId: string;
  lng: string;
  onAddSource: () => void;
  compact?: boolean;
  onOpenPoint?: () => void;
  sourceBusy?: boolean;
  onOpenContext?: () => void;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const [command, commandState] =
    documentWorkspaceApi.useCommandDocumentPointMutation();
  const [ask, questionState] =
    documentWorkspaceApi.useGetDocumentPointQuestionMutation();
  const [answer, setAnswer] = useState(pointValueText(point.value));
  const incomingValue = pointValueText(point.value);
  const [baseValue, setBaseValue] = useState(incomingValue);
  if (baseValue !== incomingValue) {
    setBaseValue(incomingValue);
    if (answer === baseValue) setAnswer(incomingValue);
  }
  const [reason, setReason] = useState("");
  const [waitingFor, setWaitingFor] = useState(point.task?.waiting_for ?? "");
  const [requested, setRequested] = useState(
    point.task?.requested_information ?? "",
  );
  const [parkOpen, setParkOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const options = [...new Set(point.choices ?? [])];
  const errorKind = documentWorkspaceErrorKind(commandState.error);
  const stale = errorKind === "stale";
  const [refresh, refreshState] =
    documentWorkspaceApi.useLazyGetDocumentWorkspaceQuery();
  async function send(
    payload: Pick<DocumentPointCommand, "command"> &
      Partial<DocumentPointCommand>,
  ) {
    setSaved(false);
    try {
      const result = await command({
        runId,
        pointKey: point.key,
        command: {
          ...payload,
          expected_version: point.version,
          idempotency_key: crypto.randomUUID(),
        },
      }).unwrap();
      if (result.point) setAnswer(pointValueText(result.point.value));
      setSaved(true);
    } catch {
      /* RTK mutation state renders the actionable error. */
    }
  }
  const accepted = ["answered", "assumption", "not_applicable"].includes(
    point.status,
  );
  const acceptedBasis =
    point.accepted_reason === undefined
      ? point.task?.note
      : point.accepted_reason;
  const currentAnswer =
    accepted ||
    (point.status === "conflict" &&
      (point.value !== null ||
        point.candidates.some((candidate) => candidate.status === "accepted")));
  const currentCandidate = currentPointCandidate(point);
  const acceptedCitations = currentCandidate?.citations ?? [];
  const earlierCandidates = point.candidates.filter(
    (candidate) =>
      candidate.status === "accepted" &&
      candidate.candidate_id !== currentCandidate?.candidate_id,
  );
  const pending = point.candidates.filter(
    (candidate) => candidate.status === "pending",
  );
  const value =
    point.answer_type === "choice"
      ? options.includes(answer)
        ? answer
        : null
      : parsePointAnswer(answer, point.answer_type);
  return (
    <VStack
      align="stretch"
      gap={3}
      data-testid="document-point-card"
      aria-busy={commandState.isLoading}
    >
      <Box>
        <HStack justify="space-between" flexWrap="wrap">
          <Heading as="h2" fontSize="title.md" color="content.primary">
            {point.label}
          </Heading>
          <Text fontSize="label.sm" color="content.tertiary">
            {t(point.required ? "workspace-required" : "workspace-optional")}
          </Text>
        </HStack>
        <Text
          mt={1}
          fontSize="body.md"
          lineHeight={1.6}
          color="content.secondary"
        >
          {point.description}
        </Text>
        <HStack gap={3} mt={2} flexWrap="wrap">
          <Text fontSize="label.sm" color="content.link">
            {t(`workspace-point-status-${point.status}`)}
          </Text>
          <Text fontSize="label.sm" color="content.tertiary">
            {t(`workspace-freshness-${point.freshness}`)}
          </Text>
        </HStack>
      </Box>
      {currentAnswer && (
        <Box
          bg="background.alternativeLight"
          p={3}
          borderRadius="rounded"
          data-testid="document-point-accepted-answer"
        >
          <Text
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.secondary"
            mb={1}
          >
            {t("workspace-current-answer")}
          </Text>
          <Text whiteSpace="pre-wrap">
            {point.status === "not_applicable"
              ? t("workspace-not-applicable")
              : pointValueText(point.value) || t("workspace-no-value")}
          </Text>
          {acceptedCitations.map((citation, index) => (
            <Box
              key={index}
              as="blockquote"
              mt={2}
              borderLeft="2px solid"
              borderColor="border.neutral"
              pl={3}
            >
              <Text fontSize="body.sm" lineHeight={1.6}>
                {citation.quote}
              </Text>
              <Text fontSize="body.sm" mt={1} color="content.tertiary">
                {citation.source_label}
                {citation.page_number !== null
                  ? ` · ${t("workspace-page", { page: citation.page_number })}`
                  : ""}
              </Text>
            </Box>
          ))}
          {acceptedBasis?.trim() && (
            <Box mt={3}>
              <Text
                fontSize="label.sm"
                fontWeight="medium"
                color="content.secondary"
              >
                {t("workspace-accepted-basis")}
              </Text>
              <Text
                mt={1}
                fontSize="body.sm"
                whiteSpace="pre-wrap"
                color="content.primary"
              >
                {acceptedBasis}
              </Text>
            </Box>
          )}
        </Box>
      )}
      {earlierCandidates.length > 0 && (
        <Box as="details">
          <Text
            as="summary"
            cursor="pointer"
            fontSize="body.sm"
            color="content.secondary"
          >
            {t("workspace-earlier-accepted", {
              count: earlierCandidates.length,
            })}
          </Text>
          {earlierCandidates.map((candidate) => (
            <Box
              key={candidate.candidate_id}
              mt={2}
              pl={3}
              borderLeft="2px solid"
              borderColor="border.neutral"
            >
              <Text fontSize="body.sm">{pointValueText(candidate.value)}</Text>
              {candidate.citations.map((citation, index) => (
                <Box key={index} mt={1}>
                  <Text fontSize="body.sm">{citation.quote}</Text>
                  <Text fontSize="body.sm" color="content.tertiary">
                    {citation.source_label}
                  </Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )}
      {pending.slice(0, compact ? 1 : undefined).map((candidate) => (
        <VStack
          key={candidate.candidate_id}
          align="stretch"
          gap={3}
          p={3}
          border="1px solid"
          borderColor="border.neutral"
          borderRadius="rounded"
        >
          {point.status === "conflict" && (
            <Text fontSize="body.sm" color="content.secondary">
              {t("workspace-new-source-answer")}
            </Text>
          )}
          <Text fontWeight="semibold" whiteSpace="pre-wrap">
            {pointValueText(candidate.value)}
          </Text>
          {candidate.citations.map((citation, index) => (
            <Box
              key={index}
              borderLeft="3px solid"
              borderColor="content.link"
              pl={3}
            >
              <Text as="blockquote" fontSize="body.sm" whiteSpace="pre-wrap">
                {citation.quote}
              </Text>
              <Text mt={1} fontSize="label.sm" color="content.tertiary">
                {citation.source_label}
                {citation.page_number !== null
                  ? ` · ${t("workspace-page", { page: citation.page_number })}`
                  : ""}
                {citation.source_anchor ? ` · ${citation.source_anchor}` : ""}
              </Text>
            </Box>
          ))}
          {candidate.status === "pending" && (
            <HStack flexWrap="wrap">
              <Button
                size="sm"
                variant="outline"
                disabled={commandState.isLoading}
                onClick={() =>
                  void send({
                    command: "confirm_candidate",
                    candidate_id: candidate.candidate_id,
                    note: reason.trim() || undefined,
                  })
                }
              >
                {t(
                  point.status === "conflict"
                    ? "workspace-use-candidate"
                    : "workspace-confirm",
                )}
              </Button>
              {!compact && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={commandState.isLoading}
                  onClick={() =>
                    void send({
                      command: "dismiss_candidate",
                      candidate_id: candidate.candidate_id,
                    })
                  }
                >
                  {t("workspace-dismiss-candidate")}
                </Button>
              )}
            </HStack>
          )}
        </VStack>
      ))}
      {compact ? (
        <Button size="sm" variant="outline" onClick={onOpenPoint}>
          {t("workspace-open-point")}
        </Button>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            alignSelf="start"
            loading={questionState.isLoading}
            onClick={() =>
              void ask({ runId, pointKey: point.key, language: lng })
            }
          >
            {t("workspace-help-answer")}
          </Button>
          {questionState.isError && (
            <Text role="alert" color="sentiment.negativeDefault">
              {t("workspace-question-error")}
            </Text>
          )}
          {questionState.data && (
            <Box bg="background.alternativeLight" p={3} borderRadius="rounded">
              <Text fontSize="body.sm">{questionState.data.why_asking}</Text>
              {questionState.data.questions
                .slice(0, 4)
                .map((question, index) => (
                  <Box key={index} mt={2}>
                    <Text fontWeight="medium">{question.question}</Text>
                    <HStack mt={2} flexWrap="wrap">
                      {question.options.slice(0, 6).map((option) => (
                        <Button
                          key={option}
                          size="sm"
                          variant="outline"
                          whiteSpace="normal"
                          h="auto"
                          minH="32px"
                          py={2}
                          aria-pressed={answer === option}
                          disabled={
                            point.answer_type === "choice" &&
                            !options.includes(option)
                          }
                          onClick={() => setAnswer(option)}
                        >
                          {option}
                        </Button>
                      ))}
                    </HStack>
                  </Box>
                ))}
            </Box>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (value !== null)
                void send({
                  command: accepted ? "correct" : "answer",
                  value,
                  reason: reason.trim() || undefined,
                });
            }}
          >
            <VStack align="stretch" gap={3}>
              <Field
                label={t(
                  accepted
                    ? "workspace-correct-answer"
                    : "workspace-your-answer",
                )}
                required
                disabled={
                  point.answer_type === "choice" && options.length === 0
                }
              >
                {point.answer_type === "choice" ? (
                  <NativeSelectRoot disabled={options.length === 0}>
                    <NativeSelectField
                      value={options.includes(answer) ? answer : ""}
                      onChange={(event) => setAnswer(event.target.value)}
                    >
                      <option value="">{t("workspace-choose-option")}</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </NativeSelectField>
                  </NativeSelectRoot>
                ) : point.answer_type === "multiline" ? (
                  <Textarea
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                  />
                ) : (
                  <Input
                    type={
                      point.answer_type === "number"
                        ? "number"
                        : point.answer_type === "date"
                          ? "date"
                          : "text"
                    }
                    step={point.answer_type === "number" ? "any" : undefined}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                  />
                )}
              </Field>
              {point.answer_type === "choice" && options.length === 0 && (
                <Text role="alert" fontSize="body.sm" color="content.secondary">
                  {t("workspace-choices-unavailable")}
                </Text>
              )}
              <Field
                label={t("workspace-reason")}
                helperText={t("workspace-reason-help")}
              >
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                />
              </Field>
              <HStack flexWrap="wrap">
                <Button
                  type="submit"
                  size="sm"
                  loading={commandState.isLoading}
                  disabled={value === null || Boolean(stale)}
                >
                  {t("workspace-save-answer")}
                </Button>
                {point.allow_assumption && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      value === null || !reason.trim() || commandState.isLoading
                    }
                    onClick={() =>
                      void send({ command: "assume", value: value!, reason })
                    }
                  >
                    {t("workspace-save-assumption")}
                  </Button>
                )}
                {point.allow_not_applicable && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!reason.trim() || commandState.isLoading}
                    onClick={() =>
                      void send({ command: "not_applicable", reason })
                    }
                  >
                    {t("workspace-not-applicable")}
                  </Button>
                )}
              </HStack>
            </VStack>
          </form>
          <HStack flexWrap="wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={onAddSource}
              disabled={sourceBusy}
            >
              {t(
                sourceBusy
                  ? "workspace-evidence-uploading"
                  : "workspace-add-evidence",
              )}
            </Button>
            {point.task?.status === "waiting" ||
            point.task?.status === "parked" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={commandState.isLoading}
                onClick={() => void send({ command: "resume" })}
              >
                {t("workspace-resume")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setParkOpen(!parkOpen)}
              >
                {t("workspace-park")}
              </Button>
            )}
          </HStack>
          {point.task?.waiting_for && (
            <Text fontSize="body.sm">
              {t("workspace-waiting-for-value", {
                name: point.task.waiting_for,
              })}
            </Text>
          )}
          {point.task?.requested_information && (
            <Text fontSize="body.sm" color="content.secondary">
              {point.task.requested_information}
            </Text>
          )}
          {parkOpen && (
            <VStack
              align="stretch"
              gap={3}
              p={3}
              bg="background.alternativeLight"
              borderRadius="rounded"
            >
              <Field label={t("workspace-waiting-for")}>
                <Input
                  value={waitingFor}
                  onChange={(event) => setWaitingFor(event.target.value)}
                />
              </Field>
              <Field label={t("workspace-requested-information")} required>
                <Textarea
                  value={requested}
                  onChange={(event) => setRequested(event.target.value)}
                />
              </Field>
              <Button
                size="sm"
                disabled={!requested.trim() || commandState.isLoading}
                onClick={() =>
                  void send({
                    command: "park",
                    waiting_for: waitingFor.trim() || undefined,
                    requested_information: requested.trim(),
                    note: reason.trim() || undefined,
                  })
                }
              >
                {t("workspace-save-waiting")}
              </Button>
            </VStack>
          )}
        </>
      )}
      {saved && (
        <Text
          role="status"
          fontSize="body.sm"
          color="sentiment.positiveDefault"
        >
          {t("workspace-answer-saved")}
        </Text>
      )}
      {commandState.isError && (
        <Box role="alert">
          <Text color="sentiment.negativeDefault">
            {t(
              errorKind === "source_unavailable"
                ? "workspace-source-unavailable-error"
                : stale
                  ? "workspace-stale-error"
                  : "workspace-command-error",
            )}
          </Text>
          {stale && (
            <Button
              mt={2}
              size="sm"
              variant="outline"
              loading={refreshState.isFetching}
              onClick={async () => {
                await refresh(runId);
                commandState.reset();
              }}
            >
              {t("workspace-reload")}
            </Button>
          )}
          {errorKind === "source_unavailable" && (
            <Button
              mt={2}
              size="sm"
              variant="outline"
              onClick={onOpenContext ?? onAddSource}
            >
              {t("workspace-review-evidence")}
            </Button>
          )}
        </Box>
      )}
    </VStack>
  );
}
