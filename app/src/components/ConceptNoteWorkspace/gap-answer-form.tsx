"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  HStack,
  Icon,
  Text,
  Textarea,
  VStack,
  chakra,
} from "@chakra-ui/react";
import { LuArrowLeft, LuPaperclip } from "react-icons/lu";

import { Field } from "@/components/ui/field";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { useTranslation } from "@/i18n/client";
import type { ChapterGapRow } from "./chapter-gaps-panel";
import { ReviewButton as Button } from "./review-button";

export interface GapAnswerRequest {
  chapterId: string;
  chapterTitle: string;
  row: ChapterGapRow;
}

interface GapAnswerFormProps {
  runId: string;
  request: GapAnswerRequest;
  lng: string;
  disabled: boolean;
  /** Characters the combined answer may use within the edit request limit. */
  answerLimit: number;
  /**
   * complete is true when every question has a substantive answer. Returns
   * false when the request is too long to send, so the form keeps the answers.
   */
  onAnswer: (answer: string, complete: boolean) => boolean;
  onClose: () => void;
  onAddSource: () => void;
}

/** Validated by Climate Advisor's GapQuestionOutput before it reaches the browser. */
interface GapQuestion {
  why_asking: string;
  questions: { question: string; options: string[] }[];
}

/** Unsent answers, kept for the browser session so leaving the form loses nothing. */
interface GapDraft {
  question: GapQuestion | null;
  choices: Record<number, string>;
  customAnswers: Record<string, string>;
  details: string;
}

function readDraft(key: string): GapDraft | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function saveDraft(key: string, draft: GapDraft | null): void {
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  } catch {
    // Storage can be full or blocked; the form still works without a draft.
  }
}

/** Ask about each missing part; choices are user answers, not inferred project facts. */
export function GapAnswerForm({
  runId,
  request,
  lng,
  disabled,
  answerLimit,
  onAnswer,
  onClose,
  onAddSource,
}: GapAnswerFormProps) {
  const { t } = useTranslation(lng, "concept-notes");
  // A new gap version starts fresh, since earlier answers may no longer fit it.
  const draftKey = `cnb-gap-draft:${runId}:${request.chapterId}:${request.row.gap?.gap_id ?? request.row.question}:${request.row.gap?.version}`;
  const [draft] = useState(() => readDraft(draftKey));
  const [question, setQuestion] = useState<GapQuestion | null>(
    draft?.question ?? null,
  );
  const [loading, setLoading] = useState(!draft?.question);
  const [attempt, setAttempt] = useState(0);
  const [choices, setChoices] = useState<Record<number, string>>(
    draft?.choices ?? {},
  );
  // Keyed by question text so a retry that changes the questions cannot
  // attach earlier text to a different question.
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>(
    draft?.customAnswers ?? {},
  );
  const [details, setDetails] = useState(draft?.details ?? "");
  const [showRequest, setShowRequest] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const headingRef = useRef<HTMLParagraphElement>(null);
  const whyAsking = question?.why_asking ?? request.row.whyAsking;
  // Without generated questions, the original gap is one free-text question.
  const questions = question?.questions ?? [
    { question: request.row.question, options: [] },
  ];
  const answerKey = (index: number) => `${index}:${questions[index].question}`;
  const answers = questions.map(({ options }, index) => {
    const choice = choices[index];
    if (choice === "custom")
      return customAnswers[answerKey(index)]?.trim() || undefined;
    if (choice === "unknown") return undefined;
    return options[Number(choice)];
  });
  // Edit validation only lets a marker be replaced for a recorded open gap, so
  // legacy inline markers (no gap record) are answered without replacing them.
  // The unavailable fallback asks the original gap itself, so its answer covers it.
  const complete = request.row.gap !== null && answers.every(Boolean);
  const answered = answers.some(Boolean);
  const answerText = [
    ...questions.map(
      ({ question: text }, index) =>
        `${index + 1}. ${text}\n${answers[index] ?? t("gap-not-decided")}`,
    ),
    details.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
  const charsLeft = answerLimit - answerText.length;
  // Fields stop accepting text once the shared limit is used up.
  const fieldMax = (value: string) =>
    Math.min(2000, value.length + Math.max(0, charsLeft));

  useEffect(() => {
    // Reopening a saved draft keeps its questions, so its answers still match.
    if (attempt === 0 && draft?.question) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/v1/concept-notes/${runId}/gap-question/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chapter_id: request.chapterId,
              gap_id: request.row.gap?.gap_id ?? null,
              question: request.row.question,
              language: lng,
            }),
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Question unavailable");
        const result: GapQuestion = await response.json();
        if (controller.signal.aborted) return;
        setQuestion(result);
        setChoices(
          Object.fromEntries(
            result.questions.flatMap(({ options }, index) =>
              options.length ? [] : [[index, "custom"]],
            ),
          ),
        );
      } catch {
        if (controller.signal.aborted) return;
        setQuestion(null);
        setChoices({ 0: "custom" });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    runId,
    lng,
    request.chapterId,
    request.row.gap?.gap_id,
    request.row.question,
    attempt,
    draft,
  ]);

  useEffect(() => {
    if (loading) return;
    saveDraft(
      draftKey,
      answered || details.trim()
        ? { question, choices, customAnswers, details }
        : null,
    );
  }, [draftKey, loading, answered, question, choices, customAnswers, details]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.closest("form")?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <chakra.form
      data-testid="concept-note-gap-answer-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || loading || !answered) return;
        const sent = onAnswer(answerText, complete);
        setTooLong(!sent);
        if (sent) saveDraft(draftKey, null);
      }}
    >
      <VStack align="stretch" gap={3}>
        <Button
          type="button"
          alignSelf="start"
          size="xs"
          variant="ghost"
          onClick={onClose}
        >
          <Icon as={LuArrowLeft} />
          {t("gap-back-to-chat")}
        </Button>
        <Box>
          <Text fontSize="label.sm" color="content.tertiary" mb={1}>
            {t("gap-question-context", {
              chapter: request.chapterTitle,
              interpolation: { escapeValue: false },
            })}
          </Text>
          <HStack justify="space-between" align="baseline" gap={2}>
            <Text
              ref={headingRef}
              tabIndex={-1}
              data-testid="concept-note-gap-answer-heading"
              fontFamily="heading"
              fontSize="body.lg"
              fontWeight="semibold"
              color="content.primary"
            >
              {loading
                ? t("gap-loading-question")
                : t("gap-questions-heading", { count: questions.length })}
            </Text>
            {!loading && questions.length > 1 && (
              <Text fontSize="label.sm" color="content.tertiary" flexShrink={0}>
                {t("gap-questions-progress", {
                  answered: answers.filter(Boolean).length,
                  total: questions.length,
                })}
              </Text>
            )}
          </HStack>
          {/* The original gap request is long; keep it as collapsible context. */}
          <Box
            mt={3}
            px={3}
            py={2}
            bg="sentiment.warningOverlay"
            borderLeft="3px solid"
            borderColor="sentiment.warningDefault"
            borderRadius="rounded"
          >
            <Text
              fontSize="body.sm"
              color="content.secondary"
              lineClamp={showRequest ? undefined : 2}
              data-testid="concept-note-gap-question"
            >
              {request.row.question}
            </Text>
            {showRequest && whyAsking && (
              <Text mt={2} fontSize="label.sm" color="content.tertiary">
                {whyAsking}
              </Text>
            )}
            <chakra.button
              type="button"
              mt={1}
              fontSize="label.sm"
              fontWeight="semibold"
              color="content.link"
              aria-expanded={showRequest}
              onClick={() => setShowRequest((value) => !value)}
            >
              {t(showRequest ? "gap-show-less" : "gap-show-more")}
            </chakra.button>
          </Box>
        </Box>
        {loading && (
          <Text role="status" fontSize="body.sm">
            {t("gap-loading-options")}
          </Text>
        )}
        {!loading && !question && (
          <Box role="alert">
            <Text fontSize="body.sm">{t("gap-question-unavailable")}</Text>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setLoading(true);
                setAttempt((value) => value + 1);
              }}
            >
              {t("gap-retry-question")}
            </Button>
          </Box>
        )}
        {!loading &&
          questions.map(({ question: text, options }, index) => (
            <VStack
              key={`${index}-${text}`}
              align="stretch"
              gap={2}
              p={3}
              border="1px solid"
              borderColor={answers[index] ? "content.link" : "border.neutral"}
              borderRadius="rounded"
              bg="base.light"
              data-testid="concept-note-gap-subquestion"
            >
              <HStack align="start" gap={2}>
                {questions.length > 1 && (
                  <Box
                    flexShrink={0}
                    boxSize="20px"
                    mt="1px"
                    borderRadius="full"
                    bg={answers[index] ? "content.link" : "background.neutral"}
                    color={answers[index] ? "base.light" : "content.secondary"}
                    fontSize="11px"
                    fontWeight="semibold"
                    lineHeight="20px"
                    textAlign="center"
                  >
                    {index + 1}
                  </Box>
                )}
                <Text fontSize="body.sm" fontWeight="semibold">
                  {text}
                </Text>
              </HStack>
              <RadioGroup
                value={choices[index] ?? null}
                onValueChange={({ value }) =>
                  value &&
                  setChoices((current) => ({ ...current, [index]: value }))
                }
                aria-label={text}
              >
                <VStack align="stretch" gap={2}>
                  {options.map((option, optionIndex) => (
                    <Radio
                      key={optionIndex}
                      value={String(optionIndex)}
                      alignItems="start"
                    >
                      <Text fontSize="body.sm">{option}</Text>
                    </Radio>
                  ))}
                  <Radio value="custom">
                    <Text fontSize="body.sm">
                      {t(options.length ? "gap-other" : "gap-your-answer")}
                    </Text>
                  </Radio>
                  <Radio value="unknown">
                    <Text fontSize="body.sm">{t("gap-not-decided")}</Text>
                  </Radio>
                </VStack>
              </RadioGroup>
              {choices[index] === "custom" && (
                <Textarea
                  value={customAnswers[answerKey(index)] ?? ""}
                  onChange={(event) =>
                    setCustomAnswers((current) => ({
                      ...current,
                      [answerKey(index)]: event.target.value,
                    }))
                  }
                  aria-label={text}
                  placeholder={t("gap-answer-placeholder")}
                  data-testid="concept-note-gap-custom-answer"
                  maxLength={fieldMax(customAnswers[answerKey(index)] ?? "")}
                  rows={2}
                  fontSize="body.sm"
                />
              )}
            </VStack>
          ))}
        {!loading && (
          <Field label={t("gap-additional-details")}>
            <Textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={t("gap-details-placeholder")}
              data-testid="concept-note-gap-details"
              maxLength={fieldMax(details)}
              rows={2}
              fontSize="body.sm"
            />
          </Field>
        )}
        <HStack justify="space-between" flexWrap="wrap">
          <Button type="button" size="xs" variant="ghost" onClick={onAddSource}>
            <Icon as={LuPaperclip} />
            {t("gap-add-source")}
          </Button>
          <Button type="button" size="xs" variant="ghost" onClick={onClose}>
            {t("gap-answer-later")}
          </Button>
        </HStack>
        {/* Stays in view while the questions scroll, as the form's only submit. */}
        <VStack
          align="stretch"
          gap={2}
          position="sticky"
          bottom={-4}
          mx={-4}
          px={4}
          pt={3}
          pb={4}
          bg="base.light"
          borderTop="1px solid"
          borderColor="border.neutral"
        >
          {tooLong && (
            <Text
              role="alert"
              fontSize="body.sm"
              color="sentiment.negativeDefault"
            >
              {t("gap-answer-too-long")}
            </Text>
          )}
          {!loading && charsLeft < 2000 && (
            <Text
              aria-live="polite"
              fontSize="label.sm"
              textAlign="center"
              color={
                charsLeft > 0
                  ? "content.secondary"
                  : "sentiment.negativeDefault"
              }
              data-testid="concept-note-gap-chars-left"
            >
              {charsLeft > 0
                ? t("gap-characters-left", {
                    left: charsLeft.toLocaleString(lng),
                  })
                : t("gap-characters-full")}
            </Text>
          )}
          <Button
            type="submit"
            bg="content.link"
            disabled={disabled || loading || !answered || charsLeft < 0}
            data-testid="concept-note-gap-preview"
          >
            {t("gap-preview-change")}
          </Button>
          <Text fontSize="label.sm" color="content.tertiary" textAlign="center">
            {t(complete ? "gap-complete-hint" : "gap-acceptance-hint")}
          </Text>
        </VStack>
      </VStack>
    </chakra.form>
  );
}
