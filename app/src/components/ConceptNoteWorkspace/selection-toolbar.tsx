"use client";

import {
  Box,
  HStack,
  Icon,
  Portal,
  Text,
  Textarea,
  VStack,
  chakra,
} from "@chakra-ui/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { LuBold, LuItalic, LuSparkles, LuX } from "react-icons/lu";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/client";
import { editApi } from "@/services/concept-note-edit-api";
import {
  EDIT_INSTRUCTION_MAX_CHARS,
  type EditProposal,
  type EditProposalRequest,
} from "@/util/concept-note-edit-types";
import {
  captureDraftSelection,
  type DraftTextSelection,
} from "./draft-selection";
import { ReviewButton as Button } from "./review-button";

interface SelectableChapterProps {
  children: ReactNode;
  runId: string;
  chapterId: string;
  revision: number;
  markdown: string;
  lng: string;
  disabled: boolean;
  onProposed: (
    proposal: EditProposal,
    manualFormatting?: boolean,
  ) => Promise<void>;
}

export function SelectableChapter(props: SelectableChapterProps) {
  return props.runId ? (
    <ChapterSelection
      key={`${props.runId}:${props.chapterId}:${props.revision}:${props.disabled}:${props.markdown}`}
      {...props}
    />
  ) : (
    <>{props.children}</>
  );
}

function ChapterSelection({
  children,
  runId,
  chapterId,
  revision,
  markdown,
  lng,
  disabled,
  onProposed,
}: SelectableChapterProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const id = useId();
  const preview = useRef<HTMLDivElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<DraftTextSelection | null>(null);
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [create, request] = editApi.useCreateEditProposalMutation({
    fixedCacheKey: `selection:${runId}`,
  });
  const lastRequest = useRef<{ signature: string; key: string } | null>(null);
  const pending = useRef(false);
  const suppressCapture = useRef(false);
  const mounted = useRef(true);
  const busy = request.isLoading || disabled;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const hasSelection = Boolean(selection);
  useEffect(() => {
    const capture = () => {
      if (
        !preview.current ||
        disabled ||
        suppressCapture.current ||
        floating.current?.contains(document.activeElement)
      )
        return;
      const next = captureDraftSelection(
        preview.current,
        markdown,
        chapterId,
        revision,
        window.getSelection(),
      );
      setSelection((old) =>
        next && old && JSON.stringify(next.scope) === JSON.stringify(old.scope)
          ? old
          : next,
      );
      if (next) setError(false);
    };
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && !(event.altKey && event.key === "F10"))
        suppressCapture.current = false;
      if (event.altKey && event.key === "F10" && selectionRef.current) {
        event.preventDefault();
        bar.current?.querySelector<HTMLElement>("button, select")?.focus();
      }
      if (
        event.key === "Escape" &&
        selectionRef.current &&
        !request.isLoading
      ) {
        const savedRange = selectionRef.current.range;
        suppressCapture.current = true;
        setSelection(null);
        setAsking(false);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(savedRange);
        preview.current?.focus({ preventScroll: true });
      }
    };
    const outside = (event: PointerEvent) => {
      if (preview.current?.contains(event.target as Node))
        suppressCapture.current = false;
      if (
        !floating.current?.contains(event.target as Node) &&
        !preview.current?.contains(event.target as Node)
      ) {
        setSelection(null);
        setAsking(false);
      }
    };
    document.addEventListener("selectionchange", capture);
    document.addEventListener("keydown", shortcut);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("selectionchange", capture);
      document.removeEventListener("keydown", shortcut);
      document.removeEventListener("pointerdown", outside);
    };
  }, [markdown, chapterId, revision, disabled, request.isLoading]);

  useEffect(() => {
    if (!selection || !floating.current) return;
    const place = () => {
      const rect = selection.range.getBoundingClientRect();
      const size = floating.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(
          8,
          Math.min(rect.left, window.innerWidth - size.width - 8),
        ),
        top: Math.max(
          8,
          Math.min(
            rect.top > size.height + 12
              ? rect.top - size.height - 8
              : rect.bottom + 8,
            window.innerHeight - size.height - 8,
          ),
        ),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [selection, asking, error]);

  useEffect(() => {
    const element = bar.current;
    if (!element || "focusGroup" in HTMLElement.prototype) return;
    const controls = [
      ...element.querySelectorAll<HTMLElement>("button, select"),
    ];
    controls.forEach((control, index) => {
      control.tabIndex = index ? -1 : 0;
    });
    const focus = (event: FocusEvent) =>
      controls.forEach((control) => {
        control.tabIndex = control === event.target ? 0 : -1;
      });
    const navigate = (event: KeyboardEvent) => {
      const current = controls.indexOf(document.activeElement as HTMLElement);
      if (current < 0) return;
      const rtl = getComputedStyle(element).direction === "rtl";
      const direction =
        event.key === "ArrowRight"
          ? rtl
            ? -1
            : 1
          : event.key === "ArrowLeft"
            ? rtl
              ? 1
              : -1
            : 0;
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? controls.length - 1
            : direction
              ? (current + direction + controls.length) % controls.length
              : -1;
      if (next < 0) return;
      event.preventDefault();
      controls[next].focus();
    };
    element.addEventListener("focusin", focus);
    element.addEventListener("keydown", navigate);
    return () => {
      element.removeEventListener("focusin", focus);
      element.removeEventListener("keydown", navigate);
    };
  }, [hasSelection]);

  async function propose(formatting?: EditProposalRequest["formatting"]) {
    if (
      !selection ||
      busy ||
      pending.current ||
      selection.scope.base_revision !== revision
    )
      return;
    const body = {
      scope: selection.scope,
      instruction: formatting
        ? t("selection-format-instruction")
        : instruction.trim(),
      ...(formatting ? { formatting } : {}),
    };
    if (!body.instruction) return;
    pending.current = true;
    const signature = JSON.stringify(body);
    if (lastRequest.current?.signature !== signature)
      lastRequest.current = { signature, key: crypto.randomUUID() };
    setError(false);
    try {
      const proposal = await create({
        runId,
        body: { ...body, idempotency_key: lastRequest.current!.key },
      }).unwrap();
      if (!mounted.current) return;
      await onProposed(proposal, Boolean(formatting));
      if (!mounted.current) return;
      setSelection(null);
      setAsking(false);
      setInstruction("");
    } catch {
      setError(true);
    } finally {
      pending.current = false;
    }
  }

  return (
    <>
      <Box
        ref={preview}
        id={id}
        tabIndex={-1}
        data-testid="concept-note-selection-preview"
        aria-keyshortcuts="Alt+F10"
      >
        {children}
      </Box>
      {selection && !disabled && (
        <Portal>
          <VStack
            ref={floating}
            align="stretch"
            gap={0}
            position="fixed"
            zIndex="popover"
            top={`${position.top}px`}
            left={`${position.left}px`}
            maxW="calc(100vw - 16px)"
            bg="base.light"
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="8px"
            boxShadow="3dp"
            p={1.5}
          >
            <HStack
              ref={bar}
              role="toolbar"
              aria-label={t("selection-toolbar")}
              aria-controls={id}
              {...{ focusgroup: "toolbar wrap" }}
              data-testid="concept-note-selection-toolbar"
              gap={1}
              flexWrap="nowrap"
              overflowX="auto"
              maxW="100%"
              py={1}
              css={{
                scrollbarWidth: "none",
                "& button, & select": { minWidth: "32px", minHeight: "32px" },
                "@media (pointer: coarse)": {
                  "& button, & select": { minHeight: "44px" },
                },
              }}
            >
              <Button
                data-testid="concept-note-selection-ask"
                variant="ghost"
                size="sm"
                px={2}
                fontSize="13px"
                flexShrink={0}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) setAsking((open) => !open);
                }}
              >
                <Icon as={LuSparkles} aria-hidden="true" />
                {t("selection-ask")}
              </Button>
              <Box
                role="separator"
                aria-orientation="vertical"
                alignSelf="stretch"
                borderInlineStart="1px solid"
                borderColor="border.neutral"
                mx={1}
              />
              <HStack
                role="group"
                aria-label={t("selection-formatting")}
                gap={1}
                flexShrink={0}
              >
                <NativeSelectRoot size="sm" w="96px">
                  <NativeSelectField
                    aria-label={t("selection-font")}
                    aria-disabled={busy}
                    value={selection.font}
                    onChange={(event) => {
                      if (!busy)
                        void propose({
                          font: event.target.value as
                            "default" | "serif" | "mono",
                        });
                    }}
                  >
                    <option value="default">
                      {t("selection-font-default")}
                    </option>
                    <option value="serif">{t("selection-font-serif")}</option>
                    <option value="mono">{t("selection-font-mono")}</option>
                  </NativeSelectField>
                </NativeSelectRoot>
                <Button
                  size="sm"
                  w="32px"
                  px={0}
                  variant="ghost"
                  aria-label={t("selection-bold")}
                  title={t("selection-bold")}
                  aria-pressed={selection.bold}
                  aria-disabled={busy}
                  _pressed={{
                    bg: "background.neutral",
                    outline: "1px solid",
                    outlineColor: "content.secondary",
                  }}
                  onClick={() => {
                    if (!busy) void propose({ bold: !selection.bold });
                  }}
                >
                  <Icon as={LuBold} aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  w="32px"
                  px={0}
                  variant="ghost"
                  aria-label={t("selection-italic")}
                  title={t("selection-italic")}
                  aria-pressed={selection.italic}
                  aria-disabled={busy}
                  _pressed={{
                    bg: "background.neutral",
                    outline: "1px solid",
                    outlineColor: "content.secondary",
                  }}
                  onClick={() => {
                    if (!busy) void propose({ italic: !selection.italic });
                  }}
                >
                  <Icon as={LuItalic} aria-hidden="true" />
                </Button>
              </HStack>
              <Button
                variant="ghost"
                size="sm"
                w="32px"
                px={0}
                flexShrink={0}
                aria-label={t("close")}
                title={t("close")}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) {
                    suppressCapture.current = true;
                    setSelection(null);
                    setAsking(false);
                  }
                }}
              >
                <Icon as={LuX} aria-hidden="true" />
              </Button>
            </HStack>
            {asking && (
              <Box
                as="form"
                p={2}
                w="360px"
                maxW="100%"
                onSubmit={(event) => {
                  event.preventDefault();
                  void propose();
                }}
              >
                <Text
                  id={`${id}-hint`}
                  fontSize="label.sm"
                  color="content.secondary"
                  mb={2}
                >
                  {t("selection-scope-hint")}
                </Text>
                <chakra.label
                  htmlFor={`${id}-instruction`}
                  fontSize="label.sm"
                  fontWeight="medium"
                >
                  {t("selection-instruction")}
                </chakra.label>
                <Textarea
                  id={`${id}-instruction`}
                  aria-describedby={`${id}-hint`}
                  mt={1}
                  rows={3}
                  required
                  maxLength={EDIT_INSTRUCTION_MAX_CHARS}
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                />
                <Button
                  type="submit"
                  mt={2}
                  size="sm"
                  loading={request.isLoading}
                  disabled={busy || !instruction.trim()}
                >
                  {t("selection-propose")}
                </Button>
              </Box>
            )}
            {error && (
              <Text
                role="alert"
                px={2}
                py={1}
                maxW="360px"
                fontSize="label.sm"
                color="sentiment.negativeDefault"
              >
                {t("selection-request-error")}
              </Text>
            )}
            {request.isLoading && (
              <Text role="status" px={2} fontSize="label.sm">
                {t("selection-proposing")}
              </Text>
            )}
          </VStack>
        </Portal>
      )}
    </>
  );
}
