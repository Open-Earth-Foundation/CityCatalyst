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
import { z } from "zod";

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
  /** complete is true when every question has a substantive answer. */
  onAnswer: (answer: string, complete: boolean) => void;
  onClose: () => void;
  onAddSource: () => void;
}

const subQuestionSchema = z
  .object({
    question: z.string().trim().min(1).max(160),
    options: z
      .array(z.string().trim().min(1).max(80))
      .max(5)
      .refine(
        (options) =>
          options.length !== 1 &&
          new Set(options.map((option) => option.toLowerCase())).size ===
            options.length,
      ),
  })
  .strict();

const questionSchema = z
  .object({
    why_asking: z.string().trim().min(1).max(240),
    questions: z.array(subQuestionSchema).min(1).max(4),
  })
  .strict();

/** Ask about each missing part; choices are user answers, not inferred project facts. */
export function GapAnswerForm({
  runId,
  request,
  lng,
  disabled,
  onAnswer,
  onClose,
  onAddSource,
}: GapAnswerFormProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const [question, setQuestion] = useState<z.infer<
    typeof questionSchema
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>(
    {},
  );
  const [details, setDetails] = useState("");
  const headingRef = useRef<HTMLParagraphElement>(null);
  const whyAsking = question?.why_asking ?? request.row.whyAsking;
  // Without generated questions, the original gap is one free-text question.
  const questions = question?.questions ?? [
    { question: request.row.question, options: [] },
  ];
  const answers = questions.map(({ options }, index) => {
    const choice = choices[index];
    if (choice === "custom") return customAnswers[index]?.trim() || undefined;
    if (choice === "unknown") return undefined;
    return options.find((_, option) => choice === String(option));
  });
  const complete = answers.every(Boolean);
  const answered = answers.some(Boolean);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/v1/concept-notes/${runId}/gap-question`,
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
        const result = questionSchema.parse(await response.json());
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
  ]);

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
        onAnswer(
          [
            ...questions.map(
              ({ question: text }, index) =>
                `${index + 1}. ${text}\n${answers[index] ?? t("gap-not-decided")}`,
            ),
            details.trim(),
          ]
            .filter(Boolean)
            .join("\n\n"),
          complete,
        );
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
          <Text fontSize="label.sm" color="content.tertiary" mb={2}>
            {t("gap-question-context", {
              chapter: request.chapterTitle,
              interpolation: { escapeValue: false },
            })}
          </Text>
          <Text
            ref={headingRef}
            tabIndex={-1}
            fontFamily="heading"
            fontSize="body.lg"
            fontWeight="semibold"
            color="content.primary"
            data-testid="concept-note-gap-question"
          >
            {request.row.question}
          </Text>
          {!loading && whyAsking && (
            <Text mt={2} fontSize="body.sm" color="content.secondary">
              {whyAsking}
            </Text>
          )}
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
              data-testid="concept-note-gap-subquestion"
            >
              <Text fontSize="body.md" fontWeight="semibold">
                {questions.length > 1 ? `${index + 1}. ${text}` : text}
              </Text>
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
                    {t(options.length ? "gap-other" : "gap-your-answer")}
                  </Radio>
                  <Radio value="unknown">{t("gap-not-decided")}</Radio>
                </VStack>
              </RadioGroup>
              {choices[index] === "custom" && (
                <Textarea
                  value={customAnswers[index] ?? ""}
                  onChange={(event) =>
                    setCustomAnswers((current) => ({
                      ...current,
                      [index]: event.target.value,
                    }))
                  }
                  aria-label={text}
                  placeholder={t("gap-answer-placeholder")}
                  data-testid="concept-note-gap-custom-answer"
                  maxLength={2000}
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
              maxLength={2000}
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
        <Button
          type="submit"
          bg="content.link"
          disabled={disabled || loading || !answered}
          data-testid="concept-note-gap-preview"
        >
          {t("gap-preview-change")}
        </Button>
        <Text fontSize="label.sm" color="content.tertiary" textAlign="center">
          {t(complete ? "gap-complete-hint" : "gap-acceptance-hint")}
        </Text>
      </VStack>
    </chakra.form>
  );
}
