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
  onAnswer: (answer: string) => void;
  onClose: () => void;
  onAddSource: () => void;
}

const questionSchema = z
  .object({
    question: z.string().trim().min(1).max(160),
    why_asking: z.string().trim().min(1).max(240),
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

/** Ask a focused question; choices are user answers, not inferred project facts. */
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
  const [choice, setChoice] = useState<string | null>(null);
  const [customAnswer, setCustomAnswer] = useState("");
  const [details, setDetails] = useState("");
  const headingRef = useRef<HTMLParagraphElement>(null);
  const prompt = question?.question ?? request.row.question;
  const whyAsking = question?.why_asking ?? request.row.whyAsking;
  const options = question?.options ?? [];
  const answer =
    choice === "custom"
      ? customAnswer.trim()
      : choice === "unknown"
        ? t("gap-not-decided")
        : options.find((_, index) => choice === String(index));

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
        setChoice(result.options.length ? null : "custom");
      } catch {
        if (controller.signal.aborted) return;
        setQuestion(null);
        setChoice("custom");
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
        if (disabled || loading || !answer) return;
        onAnswer(
          [`${prompt}\n${answer}`, details.trim()].filter(Boolean).join("\n\n"),
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
            aria-live="polite"
          >
            {loading ? t("gap-loading-question") : prompt}
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
        {!loading && (
          <RadioGroup
            value={choice}
            onValueChange={({ value }) => setChoice(value)}
            aria-label={prompt}
          >
            <VStack align="stretch" gap={2}>
              {options.map((option, index) => (
                <Radio key={index} value={String(index)} alignItems="start">
                  <Text fontSize="body.sm">{option}</Text>
                </Radio>
              ))}
              <Radio value="custom">
                {t(options.length ? "gap-other" : "gap-your-answer")}
              </Radio>
              <Radio value="unknown">{t("gap-not-decided")}</Radio>
            </VStack>
          </RadioGroup>
        )}
        {!loading && choice === "custom" && (
          <Field label={t("gap-your-answer")} required>
            <Textarea
              value={customAnswer}
              onChange={(event) => setCustomAnswer(event.target.value)}
              placeholder={t("gap-answer-placeholder")}
              data-testid="concept-note-gap-custom-answer"
              maxLength={2000}
              rows={3}
              fontSize="body.sm"
            />
          </Field>
        )}
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
          disabled={disabled || loading || !answer}
          data-testid="concept-note-gap-preview"
        >
          {t("gap-preview-change")}
        </Button>
        <Text fontSize="label.sm" color="content.tertiary" textAlign="center">
          {t("gap-acceptance-hint")}
        </Text>
      </VStack>
    </chakra.form>
  );
}
