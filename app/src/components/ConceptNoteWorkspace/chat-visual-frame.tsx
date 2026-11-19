"use client";

import { Box, chakra, HStack, Icon, Text } from "@chakra-ui/react";
import { type ReactNode, type Ref, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { LuImageOff, LuMaximize2 } from "react-icons/lu";

import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/client";

import { ReviewButton as Button } from "./review-button";
import { useVisualViewState } from "./use-visual-view-state";
import {
  adaptVisualLayout,
  type VisualLayoutLabels,
} from "./chat-visual-layout";
import { useVisualFrameHeight } from "./use-visual-frame-height";
import {
  hasBodyContent,
  hasRenderedVisualContent,
} from "./chat-visual-content";

// Static HTML/SVG only. Without scripts the frame cannot navigate itself, and with
// links stripped a click cannot either, so note context cannot leave in a URL.
const VISUAL_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

// DOMPurify already drops scripts, meta, link, base, embedded frames, SVG
// <set>/<animate> and event handlers; links and forms go too.
const SANITIZE_OPTIONS = {
  WHOLE_DOCUMENT: true,
  FORBID_TAGS: ["a", "area", "form"],
  FORBID_ATTR: ["href", "xlink:href"],
};

// Used where no locale is at hand, e.g. tests; the chat passes its own labels.
const ENGLISH_LAYOUT_LABELS: VisualLayoutLabels = {
  showAll: (count) => `Show all ${count} entries`,
  showFirst: (count) => `Show first ${count} entries`,
};

export interface SandboxedVisual {
  /** The iframe `srcDoc`, or "" where it cannot be built safely. */
  srcDoc: string;
  /** Whether the sanitized document has any text or drawing to show. */
  hasContent: boolean;
}

/**
 * Sanitizes model HTML once into a DOM, adapts its layout there, checks it for
 * visible content and serializes it with our CSP before any of it.
 */
export function prepareVisualDocument(
  html: string,
  labels: VisualLayoutLabels = ENGLISH_LAYOUT_LABELS,
): SandboxedVisual {
  const failed = { srcDoc: "", hasContent: false };
  // Fail closed where DOMPurify has no DOM (server rendering).
  if (!DOMPurify.isSupported) return failed;
  // WHOLE_DOCUMENT + RETURN_DOM gives the sanitized <html> element.
  const root = DOMPurify.sanitize(html, {
    ...SANITIZE_OPTIONS,
    RETURN_DOM: true,
  }) as Element | null;
  if (root?.tagName !== "HTML") return failed;
  const doc = root.ownerDocument;
  // Host markup added after sanitizing is ours: plain text and fixed CSS only.
  adaptVisualLayout(doc, labels);
  const clean = root.outerHTML;
  const head = /^<html[^>]*><head>/.exec(clean)?.[0];
  if (!head) return failed;
  return {
    srcDoc: `<!doctype html>${head}<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${VISUAL_CSP}">${clean.slice(head.length)}`,
    hasContent: hasBodyContent(doc.body),
  };
}

/**
 * Whether sanitized `html` keeps any text or drawing, without the layout work
 * of `prepareVisualDocument`. Where DOMPurify has no DOM (server rendering)
 * nothing is judged blank, as in `ChatVisualFrame`.
 */
export function hasSanitizedVisualContent(html: string): boolean {
  if (!DOMPurify.isSupported) return true;
  const root = DOMPurify.sanitize(html, {
    ...SANITIZE_OPTIONS,
    RETURN_DOM: true,
  }) as Element | null;
  return root?.tagName === "HTML" && hasBodyContent(root.ownerDocument.body);
}

/** The sandboxed document only, see `prepareVisualDocument`. */
export function buildSandboxedVisualDocument(
  html: string,
  labels?: VisualLayoutLabels,
): string {
  return prepareVisualDocument(html, labels).srcDoc;
}

/** `prepareVisualDocument` with toggle labels in the app's locale, memoized. */
export function useSandboxedVisual(html: string, lng: string): SandboxedVisual {
  const { t } = useTranslation(lng, "concept-notes");
  return useMemo(
    () =>
      prepareVisualDocument(html, {
        // Set as textContent, so i18next escaping would only show &amp; etc.
        showAll: (count) =>
          t("chat-visual-show-all", {
            count,
            interpolation: { escapeValue: false },
          }),
        showFirst: (count) =>
          t("chat-visual-show-first", {
            count,
            interpolation: { escapeValue: false },
          }),
      }),
    [html, t],
  );
}

export function VisualIframe({
  srcDoc,
  title,
  height,
  onLoad,
  onFrameLoad,
  ref,
}: {
  /** From `prepareVisualDocument` / `useSandboxedVisual`. */
  srcDoc: string;
  title: string;
  height: string;
  onLoad?: () => void;
  /** Gets the loaded frame, e.g. to sync its native view state. */
  onFrameLoad?: (frame: HTMLIFrameElement) => void;
  ref?: Ref<HTMLIFrameElement>;
}) {
  return (
    <chakra.iframe
      ref={ref}
      // Same origin only so the card can measure the content; never add
      // allow-scripts too, or model code would run as the app.
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      onLoad={(event) => {
        onLoad?.();
        onFrameLoad?.(event.currentTarget);
      }}
      title={title}
      referrerPolicy="no-referrer"
      loading="lazy"
      display="block"
      w="full"
      style={{ height }}
      border={0}
      bg="base.light"
    />
  );
}

/** Shown instead of a frame whose visual would be blank (e.g. script-only). */
export function VisualEmptyNote({ lng }: { lng: string }) {
  const { t } = useTranslation(lng, "concept-notes");
  return (
    <HStack gap={2} px={3} py={4} data-testid="concept-note-chat-visual-empty">
      <Icon as={LuImageOff} boxSize={4} color="content.tertiary" aria-hidden />
      <Text fontSize="body.sm" color="content.secondary">
        {t("chat-visual-empty")}
      </Text>
    </HStack>
  );
}

interface VisualExpandDialogProps {
  children: ReactNode;
  hidden?: boolean;
  lng: string;
  title: string;
}

/**
 * The Expand button and its large dialog. `children` fill the dialog body,
 * e.g. one frame or the tabs of a panel card. The dialog returns focus to
 * the button on close; the body unmounts, so callers keep state outside it.
 */
export function VisualExpandDialog({
  children,
  hidden,
  lng,
  title,
}: VisualExpandDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");
  return (
    <DialogRoot lazyMount unmountOnExit size="cover" placement="center">
      <DialogTrigger asChild>
        <Button
          size="xs"
          variant="outline"
          flexShrink={0}
          hidden={hidden}
          // React escapes attributes; i18next escaping would leak &amp; etc. into the label.
          aria-label={t("chat-visual-expand-label", {
            title,
            interpolation: { escapeValue: false },
          })}
        >
          <Icon as={LuMaximize2} boxSize={3.5} />
          {t("chat-visual-expand")}
        </Button>
      </DialogTrigger>
      <DialogContent
        w="calc(100vw - 32px)"
        maxW="1200px"
        h="min(900px, calc(100dvh - 32px))"
        overflow="hidden"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="12dp"
      >
        <DialogHeader flexShrink={0} pe={14}>
          <DialogTitle fontFamily="heading" color="content.primary">
            {title}
          </DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger aria-label={t("close")} />
        <DialogBody flex={1} minH={0} p={0}>
          {children}
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}

export type VisualViewStateHandle = ReturnType<typeof useVisualViewState>;

interface ChatVisualFrameProps {
  /** False when a parent draws one Expand for several frames (panel cards). */
  expandable?: boolean;
  html: string;
  lng: string;
  onHeightChange?: () => void;
  title: string;
  /** A parent's view state to share, e.g. with its own Expand dialog. */
  viewState?: VisualViewStateHandle;
}

/** An AI-generated static HTML visual, sanitized into a script-free sandboxed iframe. */
export function ChatVisualFrame({
  expandable = true,
  html,
  lng,
  onHeightChange,
  title,
  viewState: sharedViewState,
}: ChatVisualFrameProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Selected tab and open sections, shared by the card and its Expand dialog.
  const ownViewState = useVisualViewState();
  const viewState = sharedViewState ?? ownViewState;
  // Follows the content, e.g. a <details> opening, up to the card's max height.
  const { height, onLoad: measureOnLoad } = useVisualFrameHeight(
    frameRef,
    onHeightChange,
  );
  // A visual left with nothing to show after sanitizing (e.g. script-only)
  // gets a note instead of a blank card. The static check runs on the
  // sanitized document; the load check catches content hidden by CSS. On the
  // server DOMPurify is unavailable, so nothing is judged blank there.
  const visual = useSandboxedVisual(html, lng);
  const staticBlank = DOMPurify.isSupported && !visual.hasContent;
  const [renderedBlankHtml, setRenderedBlankHtml] = useState<string | null>(
    null,
  );
  const blank = staticBlank || renderedBlankHtml === html;
  const onInlineFrameLoad = (frame: HTMLIFrameElement) => {
    viewState.connect(frame);
    // null means not laid out yet (offscreen); only a definite false hides it.
    if (hasRenderedVisualContent(frame.contentDocument) === false) {
      setRenderedBlankHtml(html);
    }
  };

  return (
    <Box
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      overflow="hidden"
      // The chat column is a flex container; without this the card shrinks to its border.
      flexShrink={0}
      data-testid="concept-note-chat-visual"
      data-active-panel={viewState.activePanel ?? undefined}
    >
      <HStack
        gap={3}
        borderBottom="1px solid"
        borderColor="border.neutral"
        px={3}
        py={2}
      >
        <Box flex={1} minW={0}>
          <Text
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
            truncate
          >
            {title}
          </Text>
          <Text fontSize="label.sm" color="content.tertiary">
            {t("chat-visual-label")}
          </Text>
        </Box>
        {expandable && (
          <VisualExpandDialog
            lng={lng}
            title={title}
            // Nothing to enlarge when the visual is blank.
            hidden={blank}
          >
            <VisualIframe
              srcDoc={visual.srcDoc}
              title={title}
              height="100%"
              onFrameLoad={viewState.connect}
            />
          </VisualExpandDialog>
        )}
      </HStack>
      {blank ? (
        <VisualEmptyNote lng={lng} />
      ) : (
        <VisualIframe
          ref={frameRef}
          srcDoc={visual.srcDoc}
          title={title}
          height={`${height}px`}
          onLoad={measureOnLoad}
          onFrameLoad={onInlineFrameLoad}
        />
      )}
    </Box>
  );
}
