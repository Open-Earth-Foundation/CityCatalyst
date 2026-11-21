"use client";

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Box,
  Checkbox,
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
import type { ConceptNoteUploadResponse } from "@/util/types";
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
  /** Shown next to Preview while `disabled` is true, e.g. "Clima is replying". */
  disabledReason?: string;
  /** Characters the combined answer may use within the edit request limit. */
  answerLimit: number;
  /**
   * complete is true when every question has a substantive answer. Returns
   * false when the request is too long to send. Sent answers are also saved on
   * the gap version, so a failed or rejected turn loses nothing.
   */
  onAnswer: (answer: string, complete: boolean) => boolean;
  /**
   * The gap's saved answers changed: non-empty after "Save answers so far"
   * (the form is done), empty after "Start over without them".
   */
  onSaved: (answers: string) => void;
  /** Reloads the workspace without touching the form, after a conflict. */
  onRefreshDraft?: () => void;
  onClose: () => void;
  onAddSource: () => void;
  uploads?: ConceptNoteUploadResponse[];
}

/** A save either lands, is rejected as stale (409), or fails outright. */
type SaveResult = "saved" | "conflict" | "failed";

/** Validated by Climate Advisor's GapQuestionOutput before it reaches the browser. */
interface GapQuestion {
  why_asking: string;
  questions: {
    question: string;
    options: string[];
    where_to_find?: string;
    /** Confirms a source value; a "changed" answer must carry the new value. */
    confirms?: boolean;
    /** Several options can apply together, so each is a checkbox. */
    multiple?: boolean;
  }[];
}

/** Unsent answers kept for the browser session ("Save for later"). */
interface GapDraft {
  question: GapQuestion | null;
  choices: Record<number, string>;
  customAnswers: Record<string, string>;
  details: string;
  /** Sent answers an older form kept here; read once, then dropped on the next write. */
  sent?: string;
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

/**
 * Answers typed under "custom" that the user chose to send, as paragraphs for
 * "Additional details". Keys are `index:question`; a generated question is
 * kept as the paragraph's first line so the moved answer still says what it
 * answers. The fallback question is the gap itself, so it is left out there.
 */
function typedAnswers(
  choices: Record<number, string>,
  customAnswers: Record<string, string>,
  labelled: boolean,
): string[] {
  return Object.entries(customAnswers).flatMap(([key, text]) => {
    const chosen = (choices[parseInt(key, 10)] ?? "").split(",");
    if (!chosen.includes("custom") || !text.trim()) return [];
    const question = key.slice(key.indexOf(":") + 1);
    return [labelled ? `${question}\n${text.trim()}` : text.trim()];
  });
}

/** Adds moved answers to the details the user already wrote. */
function joinDetails(details: string, moved: string[]): string {
  return [details.trim(), ...moved].filter(Boolean).join("\n\n");
}

/**
 * A readable name for a source ref, with the file type of the run upload it
 * names. Without a matching upload the ref itself is shown, minus underscores.
 */
function sourceDocument(
  ref: string,
  uploads: ConceptNoteUploadResponse[],
): { name: string; type?: string } {
  const stem = (filename = "") => filename.replace(/\.[^.]+$/, "");
  const upload = uploads.find(
    ({ filename, sourceLabel }) =>
      ref === sourceLabel || ref === filename || ref === stem(filename),
  );
  return {
    name: (stem(upload?.filename) || ref).replace(/[_\s]+/g, " ").trim() || ref,
    type: /\.([a-z0-9]+)$/i.exec(upload?.filename ?? "")?.[1].toUpperCase(),
  };
}

/** Ask about each missing part; choices are user answers, not inferred project facts. */
export function GapAnswerForm({
  runId,
  request,
  lng,
  disabled,
  disabledReason,
  answerLimit,
  onAnswer,
  onSaved,
  onRefreshDraft,
  onClose,
  onAddSource,
  uploads = [],
}: GapAnswerFormProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const id = useId();
  // A new gap version starts fresh, since earlier answers may no longer fit it.
  const draftKey = `cnb-gap-draft:${runId}:${request.chapterId}:${request.row.gap?.gap_id ?? request.row.question}:${request.row.gap?.version}`;
  const [draft] = useState(() => readDraft(draftKey));
  // Answers saved on this gap version, by anyone, are sent again with new ones;
  // the server asks only for what they miss.
  const savedAnswers = request.row.gap?.answered_so_far ?? "";
  // A draft from before saves moved sent answers into the browser; they stay
  // here for review when the server has none, and are never sent to the model.
  const legacySent = typeof draft?.sent === "string" ? draft.sent.trim() : "";
  const fallbackAnswers =
    draft && !draft.question
      ? typedAnswers(draft.choices, draft.customAnswers, false)
      : [];
  const movedAnswers = [
    ...fallbackAnswers,
    ...(legacySent && !savedAnswers ? [legacySent] : []),
  ];
  const [earlier, setEarlier] = useState(savedAnswers);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [question, setQuestion] = useState<GapQuestion | null>(
    draft?.question ?? null,
  );
  const [loading, setLoading] = useState(!draft?.question);
  // 409: the gap was answered or closed; 404: its chapter or marker is gone.
  const [closed, setClosed] = useState<"closed" | "missing" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [choices, setChoices] = useState<Record<number, string>>(
    draft?.choices ?? {},
  );
  // Keyed by question text so a retry that changes the questions cannot
  // attach earlier text to a different question.
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>(
    fallbackAnswers.length ? {} : (draft?.customAnswers ?? {}),
  );
  const [details, setDetails] = useState(
    movedAnswers.length
      ? joinDetails(draft?.details ?? "", movedAnswers)
      : (draft?.details ?? ""),
  );
  // Tells the user why their answer now sits in the details field. It stays
  // until the form closes: autoresize re-fires input events on programmatic
  // changes, so "the user edited it" cannot be told apart reliably.
  const [moved, setMoved] = useState(movedAnswers.length > 0);
  // The field whose last paste or keystroke went past its length limit.
  const [cutField, setCutField] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const headingRef = useRef<HTMLParagraphElement>(null);
  const detailsRef = useRef<HTMLTextAreaElement>(null);
  // The saved answers this form last saw or saved; a save must still match them.
  // Only a confirmed write moves it, so a failed save never retries newer text.
  const savedBaseline = useRef(savedAnswers || null);
  // Cleared with the form's binding, so a late save result never acts on
  // another gap.
  const bound = useRef(false);
  useEffect(() => {
    bound.current = true;
    return () => {
      bound.current = false;
    };
  }, [draftKey]);
  // The latest send, so a save that finishes later uses the current chat state.
  const answerRef = useRef(onAnswer);
  useEffect(() => {
    answerRef.current = onAnswer;
  }, [onAnswer]);
  const whyAsking = question?.why_asking ?? request.row.whyAsking;
  // Earlier answers can cover every part, leaving nothing new to ask.
  const coveredEarlier = Boolean(earlier) && question?.questions.length === 0;
  // Without generated questions, the original gap is one free-text question.
  // A confirmation gets one fixed choice; "changed" is the free-text answer,
  // so it always carries the new value.
  const questions: GapQuestion["questions"] = (
    coveredEarlier
      ? []
      : question?.questions.length
        ? question.questions
        : [{ question: request.row.question, options: [] }]
  ).map((item) =>
    item.confirms ? { ...item, options: [t("gap-confirm-yes")] } : item,
  );
  const answerKey = (index: number) => `${index}:${questions[index].question}`;
  // A choice is one option index, "custom" or "unknown"; a multiple-answer
  // question keeps every selected value, comma-separated.
  const picked = (index: number) =>
    (choices[index] ?? "").split(",").filter(Boolean);
  const answers = questions.map(({ options, multiple }, index) => {
    const custom = customAnswers[answerKey(index)]?.trim();
    // Choosing to write an answer counts only once it is written; other
    // selected options of a multiple-answer question still count.
    if (picked(index).includes("custom") && !custom && !multiple)
      return undefined;
    const values = picked(index).flatMap((choice) =>
      choice === "custom"
        ? [custom]
        : choice === "unknown"
          ? []
          : [options[Number(choice)]],
    );
    return values.filter(Boolean).join("; ") || undefined;
  });
  // "Not decided yet" excludes every other selection.
  const toggleChoice = (index: number, value: string, checked: boolean) =>
    setChoices((current) => {
      const kept = (current[index] ?? "")
        .split(",")
        .filter((choice) => choice && choice !== "unknown" && choice !== value);
      const next = value === "unknown" ? [] : kept;
      if (checked) next.push(value);
      return { ...current, [index]: next.join(",") };
    });
  // Edit validation only lets a marker be replaced for a recorded open gap, so
  // legacy inline markers (no gap record) are answered without replacing them.
  // The unavailable fallback asks the original gap itself, so its answer covers it.
  const complete = request.row.gap !== null && answers.every(Boolean);
  // A partial answer to a recorded gap is saved on it instead of sent to chat:
  // the planner may not change a marker for part of its question.
  const saveOnly = request.row.gap !== null && !complete;
  // Source text the user added counts as an answer, so it can be sent alone.
  const answered =
    answers.some(Boolean) || Boolean(details.trim()) || coveredEarlier;
  const sourceSuggestions = request.row.gap?.suggestions ?? [];
  // A skipped question is sent apart from an explicit "Not decided yet", so
  // neither reads as the other.
  const missing = (index: number) =>
    t(
      picked(index).includes("unknown")
        ? "gap-not-decided"
        : "gap-not-answered",
    );
  const answerText = [
    earlier,
    ...questions.map(
      ({ question: text }, index) =>
        `${index + 1}. ${text}\n${answers[index] ?? missing(index)}`,
    ),
    details.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
  const charsLeft = answerLimit - answerText.length;
  // The longest value a field may hold within the shared limit. Filling an
  // empty field also costs (a "\n\n" or "; " separator) or frees (the
  // "Not decided yet" sent in its place) a few characters.
  const fieldMax = (value: string, emptyCost: number) =>
    Math.min(
      2000,
      value.length + Math.max(0, charsLeft - (value.trim() ? 0 : emptyCost)),
    );
  const detailsMax = fieldMax(details, 2);
  const customMax = (index: number) =>
    fieldMax(
      customAnswers[answerKey(index)] ?? "",
      answers[index] ? 2 : -missing(index).length,
    );
  // A textarea's maxLength drops extra text silently, so remember a paste or
  // keystroke that did not fit and say so under that field.
  const limitProps = (field: string, max: number) => ({
    maxLength: max,
    onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const { value, selectionStart, selectionEnd } = event.currentTarget;
      const pasted = event.clipboardData
        .getData("text")
        .replace(/\r\n?/g, "\n");
      if (value.length - (selectionEnd - selectionStart) + pasted.length > max)
        setCutField(field);
    },
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const { value, selectionStart, selectionEnd } = event.currentTarget;
      const typesText =
        (event.key.length === 1 || event.key === "Enter") &&
        !event.ctrlKey &&
        !event.metaKey;
      if (typesText && selectionStart === selectionEnd && value.length >= max)
        setCutField(field);
    },
    // Making room ends the notice; text that fits exactly is not a cut.
    onInput: (event: FormEvent<HTMLTextAreaElement>) => {
      if (event.currentTarget.value.length < max)
        setCutField((current) => (current === field ? null : current));
    },
  });
  // Shown while the field stays full.
  const cutNotice = (field: string, value: string, max: number) =>
    cutField === field &&
    value.length >= max && (
      <Text
        role="alert"
        fontSize="label.sm"
        color="content.secondary"
        data-testid="concept-note-gap-text-cut"
      >
        {t("gap-text-cut")}
      </Text>
    );
  // New questions replace the current ones: typed answers move to the details
  // first, so nothing the user wrote disappears.
  const keepTypedAnswers = () => {
    const typed = typedAnswers(choices, customAnswers, Boolean(question));
    setCustomAnswers({});
    if (!typed.length) return;
    setDetails((current) => joinDetails(current, typed));
    setMoved(true);
  };
  // "Not decided yet" everywhere sends nothing new, so Preview says why it waits.
  const undecided =
    questions.length > 0 &&
    questions.every((_, index) => choices[index] === "unknown");
  const previewReason =
    disabled && !saveOnly
      ? disabledReason
      : !loading && !answered && undecided
        ? t("gap-preview-needs-answer")
        : undefined;

  /** Save every answer given so far on the gap version, against the text last seen. */
  async function saveAnswers(answers: string): Promise<SaveResult> {
    const { gap } = request.row;
    if (!gap) return "failed";
    try {
      const response = await fetch(
        `/api/v1/concept-notes/${runId}/gaps/${gap.gap_id}/answers/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gap_version: gap.version,
            answers,
            expected_previous: savedBaseline.current,
          }),
        },
      );
      if (response.status === 409) return "conflict";
      if (!response.ok) return "failed";
    } catch {
      return "failed";
    }
    // Only a confirmed write becomes the text the next save must match.
    savedBaseline.current = answers.trim() || null;
    return "saved";
  }

  useEffect(() => {
    // Reopening an unsent draft keeps its questions, so its answers still match.
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
        // The gap cannot be answered any more; free text would only fail later.
        if (response.status === 409 || response.status === 404) {
          setClosed(response.status === 409 ? "closed" : "missing");
          return;
        }
        if (!response.ok) throw new Error("Question unavailable");
        const result: GapQuestion = await response.json();
        if (controller.signal.aborted) return;
        setQuestion(result);
        setChoices(
          Object.fromEntries(
            result.questions.length || earlier
              ? result.questions.flatMap(({ options, confirms }, index) =>
                  options.length || confirms ? [] : [[index, "custom"]],
                )
              : [[0, "custom"]],
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
    earlier,
  ]);

  // Saved while loading too: text typed before the questions arrive must
  // survive "Save for later".
  useEffect(() => {
    saveDraft(
      draftKey,
      answered || details.trim()
        ? { question, choices, customAnswers, details }
        : null,
    );
  }, [draftKey, answered, question, choices, customAnswers, details]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.closest("form")?.scrollIntoView({ block: "start" });
  }, []);

  // Shared by the submit handler and the button, so both refuse the same states.
  const submitBlocked =
    (disabled && !saveOnly) ||
    loading ||
    closed ||
    saving ||
    !answered ||
    charsLeft < 0;

  return (
    <chakra.form
      data-testid="concept-note-gap-answer-form"
      onKeyDown={(event) => {
        // Enter on an option only selects it; the browser's implicit submit
        // would send half-finished answers. Preview is the only way to send.
        if (event.key === "Enter" && event.target instanceof HTMLInputElement)
          event.preventDefault();
        // Escape leaves like "Back to conversation"; the draft is already saved.
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing
        )
          onClose();
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitBlocked) return;
        setSaving(true);
        // A row without a gap has no version to save on; it is sent as before.
        const result = request.row.gap
          ? await saveAnswers(answerText)
          : "saved";
        // The gap changed or closed while the save was pending.
        if (!bound.current) return;
        setSaving(false);
        setSaveResult(result);
        if (result !== "saved") {
          // Nothing was sent; the form keeps its input for copying.
          if (result === "conflict") onRefreshDraft?.();
          return;
        }
        if (saveOnly) {
          // The chapter changes once every part is answered; until then the
          // answers wait on the gap, visible to everyone working on the note.
          saveDraft(draftKey, null);
          onSaved(answerText);
          return;
        }
        // The answers are on the gap now, so the draft shows them even when
        // chat refuses the send below.
        if (request.row.gap) onRefreshDraft?.();
        const accepted = answerRef.current(answerText, complete);
        setTooLong(!accepted);
        if (!accepted) return;
        // The draft is cleared here, not by the effect: sending closes the form.
        saveDraft(draftKey, null);
        setQuestion(null);
        setChoices({});
        setCustomAnswers({});
        setDetails("");
      }}
    >
      <VStack align="stretch" gap={3}>
        {!closed && (
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
        )}
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
              {closed === "closed"
                ? t("gap-closed-heading")
                : closed === "missing"
                  ? t("gap-missing-heading")
                  : loading
                    ? t("gap-loading-question")
                    : coveredEarlier
                      ? t("gap-earlier-answers-cover")
                      : t("gap-questions-heading", {
                          count: questions.length,
                        })}
            </Text>
            {!loading && !closed && questions.length > 1 && (
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
        {closed && (
          <VStack align="stretch" gap={3} data-testid="concept-note-gap-closed">
            <Text role="alert" fontSize="body.sm">
              {t(
                closed === "closed"
                  ? "gap-closed-message"
                  : "gap-missing-message",
              )}
            </Text>
            {/* Nothing typed is dropped silently, even when it cannot be sent here. */}
            {details.trim() && (
              <Box
                p={3}
                border="1px solid"
                borderColor="border.neutral"
                borderRadius="rounded"
                data-testid="concept-note-gap-unsent-text"
              >
                <Text fontSize="body.sm" fontWeight="semibold">
                  {t("gap-unsent-text")}
                </Text>
                <Text
                  fontSize="body.sm"
                  color="content.secondary"
                  whiteSpace="pre-wrap"
                  overflowWrap="anywhere"
                >
                  {details.trim()}
                </Text>
              </Box>
            )}
            <Button
              type="button"
              alignSelf="start"
              bg="content.link"
              onClick={onClose}
            >
              <Icon as={LuArrowLeft} />
              {t("gap-back-to-chat")}
            </Button>
          </VStack>
        )}
        {earlier && !closed && (
          <Box
            p={3}
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="rounded"
            data-testid="concept-note-gap-earlier-answers"
          >
            <Text fontSize="body.sm" fontWeight="semibold">
              {t("gap-earlier-answers")}
            </Text>
            <Text
              fontSize="body.sm"
              color="content.secondary"
              whiteSpace="pre-wrap"
              overflowWrap="anywhere"
            >
              {earlier}
            </Text>
            {/* Without this, earlier answers near the length limit block every send. */}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={saving}
              onClick={async () => {
                // Clearing applies to everyone, since the answers are on the gap.
                setSaving(true);
                const cleared = await saveAnswers("");
                if (!bound.current) return;
                setSaving(false);
                setSaveResult(cleared);
                if (cleared !== "saved") {
                  if (cleared === "conflict") onRefreshDraft?.();
                  return;
                }
                onSaved("");
                keepTypedAnswers();
                setEarlier("");
                setQuestion(null);
                setChoices({});
                setLoading(true);
                setAttempt((value) => value + 1);
              }}
            >
              {t("gap-earlier-answers-clear")}
            </Button>
          </Box>
        )}
        {sourceSuggestions.length > 0 && !closed && (
          <VStack
            align="stretch"
            gap={2}
            p={3}
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="rounded"
            data-testid="concept-note-gap-source-suggestions"
          >
            <Box>
              <Text fontSize="body.sm" fontWeight="semibold">
                {t("gap-source-suggestions")}
              </Text>
              <Text fontSize="label.sm" color="content.tertiary">
                {t("gap-source-suggestions-hint")}
              </Text>
            </Box>
            {sourceSuggestions.map(({ value, source_refs }) => {
              const added = details.includes(value);
              return (
                <HStack key={value} align="start" justify="space-between">
                  {/* minW 0 lets an unbroken URL or file name wrap in the card. */}
                  <Box flex="1" minW={0}>
                    <Text fontSize="body.sm" overflowWrap="anywhere">
                      {value}
                    </Text>
                    <Text
                      fontSize="label.sm"
                      color="content.tertiary"
                      overflowWrap="anywhere"
                    >
                      {t("gap-source-label")}{" "}
                      {source_refs.map((ref, index) => {
                        const { name, type } = sourceDocument(ref, uploads);
                        return (
                          <Fragment key={ref}>
                            {index > 0 && ", "}
                            {name}
                            {type && (
                              <>
                                {" · "}
                                <chakra.span
                                  px={1}
                                  borderRadius="sm"
                                  bg="background.neutral"
                                  fontWeight="semibold"
                                  whiteSpace="nowrap"
                                >
                                  {type}
                                </chakra.span>
                              </>
                            )}
                          </Fragment>
                        );
                      })}
                    </Text>
                  </Box>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    flexShrink={0}
                    disabled={
                      added || detailsMax - details.length <= value.length
                    }
                    onClick={() => {
                      setDetails((current) =>
                        [current.trim(), value].filter(Boolean).join("\n"),
                      );
                      // The button disables itself; focus follows the value.
                      detailsRef.current?.focus();
                    }}
                  >
                    {t(
                      added
                        ? "gap-source-suggestion-added"
                        : "gap-use-source-suggestion",
                    )}
                  </Button>
                </HStack>
              );
            })}
          </VStack>
        )}
        {loading && (
          <Box role="status">
            <Text fontSize="body.sm">{t("gap-loading-options")}</Text>
            <Text fontSize="body.sm" color="content.secondary">
              {t("gap-loading-write-now")}
            </Text>
          </Box>
        )}
        {!loading && !closed && !question && (
          <Box role="alert">
            <Text fontSize="body.sm">{t("gap-question-unavailable")}</Text>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                keepTypedAnswers();
                setLoading(true);
                setAttempt((value) => value + 1);
              }}
            >
              {t("gap-retry-question")}
            </Button>
          </Box>
        )}
        {!loading &&
          !closed &&
          questions.map(
            (
              { question: text, options, where_to_find, confirms, multiple },
              index,
            ) => (
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
                      bg={
                        answers[index] ? "content.link" : "background.neutral"
                      }
                      color={
                        answers[index] ? "base.light" : "content.secondary"
                      }
                      fontSize="11px"
                      fontWeight="semibold"
                      lineHeight="20px"
                      textAlign="center"
                    >
                      {index + 1}
                    </Box>
                  )}
                  <Box>
                    <Text fontSize="body.sm" fontWeight="semibold">
                      {text}
                    </Text>
                    {where_to_find && (
                      <Text
                        fontSize="label.sm"
                        color="content.tertiary"
                        data-testid="concept-note-gap-where-to-find"
                      >
                        {t("gap-where-to-find", {
                          hint: where_to_find,
                          interpolation: { escapeValue: false },
                        })}
                      </Text>
                    )}
                  </Box>
                </HStack>
                {multiple ? (
                  <VStack
                    align="stretch"
                    gap={2}
                    role="group"
                    aria-label={text}
                  >
                    {[
                      ...options.map((option, optionIndex) => [
                        String(optionIndex),
                        option,
                      ]),
                      ["custom", t("gap-other")],
                      ["unknown", t("gap-not-decided")],
                    ].map(([value, label]) => (
                      <Checkbox.Root
                        key={value}
                        value={value}
                        alignItems="start"
                        checked={picked(index).includes(value)}
                        onCheckedChange={({ checked }) =>
                          toggleChoice(index, value, checked === true)
                        }
                      >
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                        <Checkbox.Label>
                          <Text fontSize="body.sm">{label}</Text>
                        </Checkbox.Label>
                      </Checkbox.Root>
                    ))}
                  </VStack>
                ) : (
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
                          {t(
                            confirms
                              ? "gap-confirm-changed"
                              : options.length
                                ? "gap-other"
                                : "gap-your-answer",
                          )}
                        </Text>
                      </Radio>
                      <Radio value="unknown">
                        <Text fontSize="body.sm">{t("gap-not-decided")}</Text>
                      </Radio>
                    </VStack>
                  </RadioGroup>
                )}
                {picked(index).includes("custom") && (
                  <>
                    <Textarea
                      value={customAnswers[answerKey(index)] ?? ""}
                      onChange={(event) =>
                        setCustomAnswers((current) => ({
                          ...current,
                          [answerKey(index)]: event.target.value,
                        }))
                      }
                      aria-label={text}
                      aria-describedby={
                        options.length > 0 && !answers[index]
                          ? `${id}-other-${index}`
                          : undefined
                      }
                      placeholder={t(
                        confirms
                          ? "gap-confirm-new-value"
                          : "gap-answer-placeholder",
                      )}
                      data-testid="concept-note-gap-custom-answer"
                      {...limitProps(answerKey(index), customMax(index))}
                      rows={2}
                      fontSize="body.sm"
                    />
                    {/* A chosen but empty "Other" is not sent as an answer. */}
                    {options.length > 0 && !answers[index] && (
                      <Text
                        id={`${id}-other-${index}`}
                        fontSize="label.sm"
                        color="content.secondary"
                        data-testid="concept-note-gap-other-empty"
                      >
                        {t("gap-other-empty")}
                      </Text>
                    )}
                    {cutNotice(
                      answerKey(index),
                      customAnswers[answerKey(index)] ?? "",
                      customMax(index),
                    )}
                  </>
                )}
              </VStack>
            ),
          )}
        {/* Shown while questions load too, so the user can start writing at once. */}
        {!closed && (
          <Field
            label={t("gap-additional-details")}
            helperText={moved ? t("gap-answer-moved") : undefined}
          >
            <Textarea
              ref={detailsRef}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={t("gap-details-placeholder")}
              data-testid="concept-note-gap-details"
              {...limitProps("details", detailsMax)}
              rows={2}
              autoresize
              fontSize="body.sm"
            />
            {cutNotice("details", details, detailsMax)}
          </Field>
        )}
        {!closed && (
          <HStack justify="space-between" flexWrap="wrap">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={onAddSource}
            >
              <Icon as={LuPaperclip} />
              {t("gap-add-source")}
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={onClose}>
              {t("gap-answer-later")}
            </Button>
          </HStack>
        )}
        {/* Stays in view while the questions scroll, as the form's only submit. */}
        {!closed && (
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
            {(tooLong || (saveResult && saveResult !== "saved")) && (
              <Text
                role="alert"
                fontSize="body.sm"
                color="sentiment.negativeDefault"
              >
                {t(
                  tooLong
                    ? "gap-answer-too-long"
                    : saveResult === "conflict"
                      ? "gap-save-conflict"
                      : "gap-save-failed",
                )}
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
                {/* Full is still sendable; only over the limit blocks Preview. */}
                {charsLeft > 0
                  ? t("gap-characters-left", {
                      left: charsLeft.toLocaleString(lng),
                    })
                  : charsLeft === 0
                    ? t("gap-characters-full")
                    : t("gap-answer-too-long")}
              </Text>
            )}
            <Button
              type="submit"
              bg="content.link"
              disabled={submitBlocked}
              aria-describedby={previewReason ? `${id}-reason` : undefined}
              data-testid="concept-note-gap-preview"
            >
              {t(saveOnly ? "gap-save-answers" : "gap-preview-change")}
            </Button>
            {previewReason && (
              <Text
                id={`${id}-reason`}
                fontSize="label.sm"
                color="content.secondary"
                textAlign="center"
                data-testid="concept-note-gap-preview-reason"
              >
                {previewReason}
              </Text>
            )}
            <Text
              fontSize="label.sm"
              color="content.tertiary"
              textAlign="center"
            >
              {t(
                complete
                  ? "gap-complete-hint"
                  : saveOnly
                    ? "gap-saved-hint"
                    : "gap-acceptance-hint",
              )}
            </Text>
          </VStack>
        )}
      </VStack>
    </chakra.form>
  );
}
