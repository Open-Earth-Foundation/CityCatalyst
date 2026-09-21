"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Flex,
  HStack,
  Icon,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import {
  LuArrowDown,
  LuArrowUp,
  LuGripVertical,
  LuPlus,
  LuTrash2,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/hooks";
import { useTranslation } from "@/i18n/client";
import { structureApi } from "@/services/concept-note-structure-api";
import { editErrorCode } from "@/services/concept-note-edit-api";
import {
  structureSaveSchema,
  type StructureState,
  type StructureChapter,
} from "@/util/concept-note-structure";
import type {
  ConceptNoteApplicationContext,
  ConceptNoteDraftState,
} from "@/util/types";

import { getChapterDisplayStatus } from "./chapter-validation";

interface StructureTabProps {
  applicationContext: ConceptNoteApplicationContext | null;
  draft: ConceptNoteDraftState | null;
  lng: string;
  runId: string;
}

export function StructureTab({
  applicationContext,
  draft,
  lng,
  runId,
}: StructureTabProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const dispatch = useAppDispatch();
  const query = structureApi.useGetConceptNoteStructureQuery(runId, {
    refetchOnMountOrArgChange: true,
  });
  const [save, saving] = structureApi.useSaveConceptNoteStructureMutation();
  const [pending, setPending] = useState<StructureState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dragged = useRef<string | null>(null);
  const state = pending ?? query.currentData;
  const chapters = state?.chapters ?? [];
  const disabled = saving.isLoading || draft?.status === "running";

  useEffect(() => {
    if (!pending) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [pending]);

  function update(next: StructureChapter[]): void {
    if (!state || disabled) return;
    setPending({ ...state, chapters: next });
    setError(null);
  }
  function move(id: string, target: number): void {
    const from = chapters.findIndex((chapter) => chapter.chapter_id === id);
    if (from < 0 || target < 0 || target >= chapters.length || from === target)
      return;
    const next = [...chapters];
    const [chapter] = next.splice(from, 1);
    next.splice(target, 0, chapter);
    update(next);
    setAnnouncement(
      t("structure-moved", { chapter: chapter.title, position: target + 1 }),
    );
  }
  function field(
    id: string,
    key: "title" | "description",
    value: string,
  ): void {
    update(
      chapters.map((chapter) =>
        chapter.chapter_id === id ? { ...chapter, [key]: value } : chapter,
      ),
    );
  }
  async function persist(): Promise<void> {
    if (!pending || disabled) return;
    const parsed = structureSaveSchema.safeParse({
      expected_fingerprint: pending.fingerprint,
      chapters,
    });
    if (!parsed.success) {
      setError("structure-invalid");
      return;
    }
    try {
      const saved = await save({ runId, ...parsed.data }).unwrap();
      dispatch(
        structureApi.util.updateQueryData(
          "getConceptNoteStructure",
          runId,
          () => saved,
        ),
      );
      setPending(null);
      setError(null);
      setAnnouncement(t("structure-saved"));
    } catch (failure) {
      setError(
        editErrorCode(failure) === "stale_structure"
          ? "structure-stale"
          : "structure-save-error",
      );
    }
  }

  return (
    <VStack align="stretch" gap={4} p={{ base: 4, md: 6 }}>
      <Text fontFamily="heading" fontSize="title.md" fontWeight="semibold">
        {t("structure-title")}
      </Text>
      <Text fontSize="body.sm">{t("structure-edit-note")}</Text>
      {!applicationContext?.template && !chapters.length && (
        <Text>{t("structure-backend-note")}</Text>
      )}
      {query.isLoading && <Text role="status">{t("structure-loading")}</Text>}
      {query.isError && (
        <Box role="alert">
          <Text>{t("structure-load-error")}</Text>
          <Button onClick={() => void query.refetch()}>
            {t("structure-retry")}
          </Button>
        </Box>
      )}
      {draft?.status === "running" && (
        <Text role="status">{t("structure-draft-running")}</Text>
      )}
      <Text role="status" aria-live="polite">
        {announcement}
      </Text>
      {chapters.map((chapter, index) => {
        const runtime = draft?.chapters.find(
          (item) => item.chapter_id === chapter.chapter_id,
        );
        const status = runtime ? getChapterDisplayStatus(runtime) : "empty";
        const statusKey = {
          empty: "not-started",
          deleted: "not-started",
          draft: "chapter-status-draft",
          needs_review: "chapter-status-needs-review",
          ready: "chapter-status-ready",
          incomplete: "chapter-status-validation-incomplete",
          stale: "chapter-status-validation-stale",
        }[status];
        return (
          <Flex
            key={chapter.chapter_id}
            data-testid="structure-chapter"
            data-chapter-id={chapter.chapter_id}
            align="start"
            gap={3}
            border="1px solid"
            borderColor="border.neutral"
            borderRadius="rounded"
            p={3}
            onDragOver={(event) => {
              if (!disabled) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged.current) move(dragged.current, index);
              dragged.current = null;
            }}
          >
            <Button
              size="xs"
              variant="ghost"
              color="content.link"
              draggable={!disabled}
              disabled={disabled}
              aria-label={t("structure-drag", { chapter: chapter.title })}
              title={t("structure-keyboard-help")}
              onDragStart={(event) => {
                dragged.current = chapter.chapter_id;
                event.dataTransfer.setData("text/plain", chapter.chapter_id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                dragged.current = null;
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  move(
                    chapter.chapter_id,
                    index + (event.key === "ArrowUp" ? -1 : 1),
                  );
                }
              }}
            >
              <Icon as={LuGripVertical} />
            </Button>
            <VStack flex={1} minW={0} align="stretch" gap={2}>
              <Text fontSize="label.sm">
                {t("structure-position", { position: index + 1 })}
                {chapter.required ? ` · ${t("required")}` : ""}
              </Text>
              <HStack
                flexWrap="wrap"
                color="content.tertiary"
                fontSize="label.sm"
              >
                <Text>{t(statusKey)}</Text>
                {runtime && runtime.open_gap_count > 0 && (
                  <Text>
                    {t("chapter-open-gaps", { count: runtime.open_gap_count })}
                  </Text>
                )}
                {runtime && runtime.caveat_count > 0 && (
                  <Text>
                    {t("chapter-caveats", { count: runtime.caveat_count })}
                  </Text>
                )}
              </HStack>
              <Box as="label">
                <Text fontSize="label.sm">{t("structure-chapter-title")}</Text>
                <Input
                  aria-label={t("structure-title-for", { position: index + 1 })}
                  value={chapter.title}
                  maxLength={255}
                  disabled={disabled}
                  onChange={(event) =>
                    field(chapter.chapter_id, "title", event.target.value)
                  }
                />
              </Box>
              <Box as="label">
                <Text fontSize="label.sm">
                  {t("structure-chapter-description")}
                </Text>
                <Textarea
                  aria-label={t("structure-description-for", {
                    position: index + 1,
                  })}
                  value={chapter.description}
                  maxLength={4000}
                  disabled={disabled}
                  onChange={(event) =>
                    field(chapter.chapter_id, "description", event.target.value)
                  }
                />
              </Box>
              <HStack flexWrap="wrap">
                <Button
                  size="xs"
                  variant="ghost"
                  color="content.link"
                  disabled={disabled || index === 0}
                  aria-label={t("move-chapter-up", { chapter: chapter.title })}
                  onClick={() => move(chapter.chapter_id, index - 1)}
                >
                  <Icon as={LuArrowUp} />
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  color="content.link"
                  disabled={disabled || index === chapters.length - 1}
                  aria-label={t("move-chapter-down", {
                    chapter: chapter.title,
                  })}
                  onClick={() => move(chapter.chapter_id, index + 1)}
                >
                  <Icon as={LuArrowDown} />
                </Button>
                {!chapter.required && chapter.template_section_id === null && (
                  <Button
                    size="xs"
                    variant="ghost"
                    color="content.link"
                    disabled={disabled || chapters.length === 1}
                    aria-label={t("structure-remove", {
                      chapter: chapter.title,
                    })}
                    onClick={() =>
                      update(
                        chapters.filter(
                          (item) => item.chapter_id !== chapter.chapter_id,
                        ),
                      )
                    }
                  >
                    <Icon as={LuTrash2} />
                  </Button>
                )}
              </HStack>
            </VStack>
          </Flex>
        );
      })}
      {error && (
        <Text role="alert" color="sentiment.negativeDefault">
          {t(error)}
        </Text>
      )}
      <HStack flexWrap="wrap">
        <Button
          variant="outline"
          disabled={disabled || !chapters.length || chapters.length >= 100}
          onClick={() =>
            update([
              ...chapters,
              {
                chapter_id: crypto.randomUUID(),
                template_section_id: null,
                required: false,
                title: t("custom-chapter", { number: chapters.length + 1 }),
                description: "",
              },
            ])
          }
        >
          <Icon as={LuPlus} />
          {t("add-custom-chapter")}
        </Button>
        <Button
          disabled={disabled || !pending}
          loading={saving.isLoading}
          onClick={() => void persist()}
        >
          {t("structure-save")}
        </Button>
        {pending && (
          <Button
            variant="ghost"
            color="content.link"
            disabled={saving.isLoading}
            onClick={() => {
              setPending(null);
              setError(null);
              void query.refetch();
            }}
          >
            {t("structure-discard")}
          </Button>
        )}
      </HStack>
      {pending && <Text role="status">{t("structure-unsaved")}</Text>}
    </VStack>
  );
}
