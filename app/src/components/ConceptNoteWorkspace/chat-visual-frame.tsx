"use client";

import { Box, chakra, HStack, Icon, Text } from "@chakra-ui/react";
import { type ReactNode, type Ref, useMemo, useRef } from "react";
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
import {
  addHostStyles,
  applyExpandedLayout,
  syncHostTheme,
} from "./chat-visual-layout";
import { useVisualFrameHeight } from "./use-visual-frame-height";
import { hasBodyContent } from "./chat-visual-content";

// Static HTML/SVG only. Without scripts the frame cannot navigate itself, and with
// links stripped a click cannot either, so note context cannot leave in a URL.
const VISUAL_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

// DOMPurify already drops scripts, meta, link, base, embedded frames, SVG
// <set>/<animate> and event handlers; links and forms go too. <use> is allowed
// back for repeated icons, but only with a same-document href (see below).
const SANITIZE_OPTIONS = {
  WHOLE_DOCUMENT: true,
  ADD_TAGS: ["use"],
  // SMIL animation leaves a chart frozen at its start state; the backend
  // rejects it too, this covers older history.
  FORBID_TAGS: [
    "a",
    "area",
    "form",
    "animate",
    "animatemotion",
    "animatetransform",
    "set",
  ],
  FORBID_ATTR: ["href", "xlink:href"],
};

// SVG elements that may point at another element of the same document:
// <use href="#icon">, <textPath href="#arc">, a gradient or pattern inheriting
// another's stops. Anything else, or any href that is not "#id", is dropped.
const LOCAL_REFERENCE_TAGS = new Set([
  "use",
  "textpath",
  "lineargradient",
  "radialgradient",
  "pattern",
]);
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const LOCAL_REFERENCE = /^#[A-Za-z_][\w.:-]*$/;

/**
 * Keeps `href` / `xlink:href` on the SVG elements above when it names an
 * element of the same document. Such a reference loads nothing and cannot
 * navigate: the frame has no scripts, and the CSP blocks every other URL.
 */
function keepLocalReference(
  node: Element,
  data: { attrName: string; attrValue: string; forceKeepAttr?: boolean },
) {
  if (
    (data.attrName === "href" || data.attrName === "xlink:href") &&
    node.namespaceURI === SVG_NAMESPACE &&
    LOCAL_REFERENCE_TAGS.has(node.nodeName.toLowerCase()) &&
    LOCAL_REFERENCE.test(data.attrValue)
  ) {
    data.forceKeepAttr = true;
  }
}

// A purifier of our own, so the hook never applies to other DOMPurify users.
let visualPurifier: ReturnType<typeof DOMPurify> | null = null;
function purifier() {
  if (!visualPurifier) {
    visualPurifier = DOMPurify(window);
    visualPurifier.addHook("uponSanitizeAttribute", keepLocalReference);
  }
  return visualPurifier;
}

// Same rule as the Climate Advisor tool (visual_html.py), which also covers
// visuals saved before it: a <use> of a <use> copies it again, and a few
// nested levels freeze the tab, on every reopen of the note.
const MAX_USE_REFERENCES = 300;

/**
 * Whether the document has at most 300 SVG <use> elements, each pointing only
 * at exactly one SVG element that neither is nor contains a <use>.
 */
function hasSafeUseReferences(doc: Document): boolean {
  const uses = doc.getElementsByTagNameNS(SVG_NAMESPACE, "use");
  if (uses.length > MAX_USE_REFERENCES) return false;
  const ids = new Map<string, Element[]>();
  for (const element of doc.querySelectorAll("[id]")) {
    const id = element.getAttribute("id") ?? "";
    ids.set(id, [...(ids.get(id) ?? []), element]);
  }
  return Array.from(uses).every((use) => {
    const refs = ["href", "xlink:href"].flatMap(
      (name) => use.getAttribute(name)?.trim() ?? [],
    );
    return (
      refs.length > 0 &&
      refs.every((ref) => {
        const targets = LOCAL_REFERENCE.test(ref) ? ids.get(ref.slice(1)) : [];
        const target = targets?.length === 1 ? targets[0] : null;
        return (
          target?.namespaceURI === SVG_NAMESPACE &&
          target.localName !== "use" &&
          target.getElementsByTagNameNS(SVG_NAMESPACE, "use").length === 0
        );
      })
    );
  });
}

export interface SandboxedVisual {
  /** The iframe `srcDoc`, or "" where it cannot be built safely. */
  srcDoc: string;
  /** Whether the sanitized document has any text or drawing to show. */
  hasContent: boolean;
  /** Set when the whole visual is refused (unsafe <use>); nothing is shown. */
  rejected?: boolean;
}

/**
 * Sanitizes model HTML once into a DOM, adds the host styles there, checks it
 * for visible content and serializes it with our CSP before any of it.
 */
export function prepareVisualDocument(html: string): SandboxedVisual {
  const failed = { srcDoc: "", hasContent: false };
  // Fail closed where DOMPurify has no DOM (server rendering).
  if (!DOMPurify.isSupported) return failed;
  // WHOLE_DOCUMENT + RETURN_DOM gives the sanitized <html> element.
  const root = purifier().sanitize(html, {
    ...SANITIZE_OPTIONS,
    RETURN_DOM: true,
  }) as Element | null;
  if (root?.tagName !== "HTML") return failed;
  const doc = root.ownerDocument;
  // Judged on the tree the frame renders. The whole visual is refused:
  // dropping single elements could change what the chart says.
  if (!hasSafeUseReferences(doc)) return { ...failed, rejected: true };
  // Host markup added after sanitizing is ours: plain text and fixed CSS only.
  addHostStyles(doc);
  const clean = root.outerHTML;
  const head = /^<html[^>]*><head>/.exec(clean)?.[0];
  if (!head) return failed;
  return {
    srcDoc: `<!doctype html>${head}<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${VISUAL_CSP}">${clean.slice(head.length)}`,
    hasContent: hasBodyContent(doc.body),
  };
}

/** The sandboxed document only, see `prepareVisualDocument`. */
export function buildSandboxedVisualDocument(html: string): string {
  return prepareVisualDocument(html).srcDoc;
}

function VisualIframe({
  srcDoc,
  title,
  height,
  onLoad,
  onFrameLoad,
  ref,
}: {
  /** From `prepareVisualDocument`. */
  srcDoc: string;
  title: string;
  height: string;
  onLoad?: () => void;
  /** Gets the loaded frame, e.g. to apply the Expand layout. */
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
        // First, so measurements below see the organization theme's colours.
        syncHostTheme(event.currentTarget);
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

/** Shown instead of a frame whose visual would be blank (e.g. script-only) or was refused. */
function VisualEmptyNote({
  lng,
  rejected,
}: {
  lng: string;
  rejected?: boolean;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  return (
    <HStack
      gap={2}
      px={3}
      py={4}
      data-testid={
        rejected
          ? "concept-note-chat-visual-rejected"
          : "concept-note-chat-visual-empty"
      }
    >
      <Icon as={LuImageOff} boxSize={4} color="content.tertiary" aria-hidden />
      <Text fontSize="body.sm" color="content.secondary">
        {t(rejected ? "chat-visual-rejected" : "chat-visual-empty")}
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
 * The Expand button and its large dialog. `children` fill the dialog body.
 * The dialog returns focus to the button on close.
 */
function VisualExpandDialog({
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
        // Phones: the dialog uses the screen, not the card's narrower width.
        positionerProps={{ p: { base: 2, md: 10 } }}
        w={{ base: "full", md: "calc(100vw - 32px)" }}
        maxW="1200px"
        h={{
          base: "calc(100dvh - 16px)",
          md: "min(900px, calc(100dvh - 32px))",
        }}
        overflow="hidden"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="12dp"
      >
        <DialogHeader flexShrink={0} pe={14}>
          <DialogTitle
            fontFamily="heading"
            color="content.primary"
            lineClamp={2}
            fontSize={{ base: "md", md: "lg" }}
          >
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

interface ChatVisualFrameProps {
  html: string;
  lng: string;
  onHeightChange?: () => void;
  title: string;
}

/** An AI-generated static HTML visual, sanitized into a script-free sandboxed iframe. */
export function ChatVisualFrame({
  html,
  lng,
  onHeightChange,
  title,
}: ChatVisualFrameProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Follows the content, e.g. a <details> opening, up to the card's max height.
  const { height, onLoad: measureOnLoad } = useVisualFrameHeight(
    frameRef,
    onHeightChange,
  );
  // A visual left with nothing to show after sanitizing (e.g. script-only)
  // gets a note instead of a blank card. On the server DOMPurify is
  // unavailable, so nothing is judged blank there.
  const visual = useMemo(() => prepareVisualDocument(html), [html]);
  const blank = DOMPurify.isSupported && !visual.hasContent;
  // A refused visual never reaches an iframe, here or in the Expand dialog.
  const rejected = visual.rejected === true;

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
        <VisualExpandDialog
          lng={lng}
          title={title}
          // Nothing to enlarge when the visual is blank or refused.
          hidden={blank || rejected}
        >
          <VisualIframe
            srcDoc={visual.srcDoc}
            title={title}
            height="100%"
            onFrameLoad={(frame) => {
              if (frame.contentDocument) {
                applyExpandedLayout(frame.contentDocument);
              }
            }}
          />
        </VisualExpandDialog>
      </HStack>
      {blank || rejected ? (
        <VisualEmptyNote lng={lng} rejected={rejected} />
      ) : (
        <VisualIframe
          ref={frameRef}
          srcDoc={visual.srcDoc}
          title={title}
          height={`${height}px`}
          onLoad={measureOnLoad}
        />
      )}
    </Box>
  );
}
