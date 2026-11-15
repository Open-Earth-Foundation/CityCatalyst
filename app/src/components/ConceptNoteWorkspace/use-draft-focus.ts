import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ConceptNoteChapterValidationFinding,
  ConceptNoteDraftChapter,
} from "@/util/types";

import { chapterValidationFindingKey } from "./chapter-validation";

export interface FocusedDraftFinding {
  chapterId: string;
  finding: ConceptNoteChapterValidationFinding;
}

export interface DraftFocusController {
  chapterElements: React.MutableRefObject<
    Record<string, HTMLDivElement | null>
  >;
  registerChapter: (chapterId: string, element: HTMLDivElement | null) => void;
  focusedFinding: FocusedDraftFinding | null;
  focusedFindingElement: React.MutableRefObject<HTMLDivElement | null>;
  isChapterPanelOpen: boolean;
  usesSharedScroll: boolean;
  previewElement: React.MutableRefObject<HTMLDivElement | null>;
  selectedChapterId: string | undefined;
  selectChapter: (chapterId: string) => void;
  toggleChapterPanel: () => void;
}

export function useDraftFocus(
  chapters: ConceptNoteDraftChapter[],
  currentChapterId: string | null | undefined,
  focusChapterId: string | null,
  focusFindingKey: string | null,
  scrollContainerRef?: React.MutableRefObject<HTMLDivElement | null>,
): DraftFocusController {
  const chapterElements = useRef<Record<string, HTMLDivElement | null>>({});
  const focusedFindingElement = useRef<HTMLDivElement | null>(null);
  const ownPreviewElement = useRef<HTMLDivElement | null>(null);
  const previewElement = scrollContainerRef ?? ownPreviewElement;
  const [focusedChapterId, setFocusedChapterId] = useState<string | null>(null);
  const [isChapterPanelOpen, setIsChapterPanelOpen] = useState(true);
  const focusedFinding = useMemo(() => {
    if (!focusChapterId || !focusFindingKey) return null;

    const chapter = chapters.find(
      ({ chapter_id }) => chapter_id === focusChapterId,
    );
    const finding = chapter?.validation?.findings.find(
      (candidate) =>
        chapterValidationFindingKey(chapter.chapter_id, candidate) ===
        focusFindingKey,
    );
    return chapter && finding
      ? { chapterId: chapter.chapter_id, finding }
      : null;
  }, [chapters, focusChapterId, focusFindingKey]);

  const scrollToChapter = useCallback(
    (chapterId: string, findingElement?: HTMLDivElement | null) => {
      const preview = previewElement.current;
      const chapterElement = chapterElements.current[chapterId];
      if (!preview || !chapterElement) return;

      const targetElement = findingElement ?? chapterElement;
      const targetTop =
        targetElement.getBoundingClientRect().top -
        preview.getBoundingClientRect().top +
        preview.scrollTop -
        48;
      preview.scrollTo({ behavior: "smooth", top: Math.max(0, targetTop) });
    },
    [previewElement],
  );

  const selectChapter = useCallback(
    (chapterId: string) => {
      setFocusedChapterId(chapterId);
      scrollToChapter(chapterId);
    },
    [scrollToChapter],
  );

  useEffect(() => {
    if (
      !focusChapterId ||
      !chapters.some(({ chapter_id }) => chapter_id === focusChapterId)
    ) {
      return;
    }

    let focusFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      setFocusedChapterId(focusChapterId);
      const findingElement =
        focusedFinding?.chapterId === focusChapterId
          ? focusedFindingElement.current
          : null;
      scrollToChapter(focusChapterId, findingElement);
      if (findingElement) {
        focusFrame = requestAnimationFrame(() =>
          findingElement.focus({ preventScroll: true }),
        );
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
    };
  }, [chapters, focusChapterId, focusedFinding, scrollToChapter]);

  return {
    chapterElements,
    registerChapter: (chapterId, element) => {
      chapterElements.current[chapterId] = element;
    },
    focusedFinding,
    focusedFindingElement,
    isChapterPanelOpen,
    usesSharedScroll: Boolean(scrollContainerRef),
    previewElement,
    selectedChapterId:
      focusedChapterId ?? currentChapterId ?? chapters[0]?.chapter_id,
    selectChapter,
    toggleChapterPanel: () => setIsChapterPanelOpen((isOpen) => !isOpen),
  };
}
