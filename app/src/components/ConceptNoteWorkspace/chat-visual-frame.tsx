"use client";

import { Box, chakra, HStack, Icon, Text } from "@chakra-ui/react";
import {
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import DOMPurify from "dompurify";
import { LuMaximize2 } from "react-icons/lu";

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

const INLINE_DEFAULT_HEIGHT = 420;
const INLINE_MIN_HEIGHT = 120;
const INLINE_MAX_HEIGHT = 720;

/** Sanitizes model HTML and puts our CSP before any of it. */
export function buildSandboxedVisualDocument(html: string): string {
  // Fail closed where DOMPurify has no DOM (server rendering).
  if (!DOMPurify.isSupported) return "";
  const clean = DOMPurify.sanitize(html, SANITIZE_OPTIONS);
  const head = /^<html[^>]*><head>/.exec(clean)?.[0];
  if (!head) return "";
  return `<!doctype html>${head}<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${VISUAL_CSP}">${clean.slice(head.length)}`;
}

function VisualIframe({
  html,
  title,
  height,
  onLoad,
  ref,
}: {
  html: string;
  title: string;
  height: string;
  onLoad?: () => void;
  ref?: Ref<HTMLIFrameElement>;
}) {
  return (
    <chakra.iframe
      ref={ref}
      // Same origin only so the card can measure the content; never add
      // allow-scripts too, or model code would run as the app.
      sandbox="allow-same-origin"
      srcDoc={buildSandboxedVisualDocument(html)}
      onLoad={onLoad}
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
  const [height, setHeight] = useState(INLINE_DEFAULT_HEIGHT);

  // After the resize is laid out, so a following chat can re-pin to the bottom.
  useLayoutEffect(() => onHeightChange?.(), [height, onHeightChange]);

  // Takes max() for html/body pinned to 100% and adds any horizontal scrollbar.
  const measure = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame?.contentWindow || !doc?.body) return;
    const root = doc.documentElement;
    const reported =
      Math.max(root.getBoundingClientRect().height, doc.body.scrollHeight) +
      frame.contentWindow.innerHeight -
      root.clientHeight;
    // Throttled offscreen frames report 0; keep the current height then.
    if (reported > 0) {
      setHeight(
        Math.min(
          INLINE_MAX_HEIGHT,
          Math.max(INLINE_MIN_HEIGHT, Math.ceil(reported)),
        ),
      );
    }
  }, []);

  // Static content only reflows when the chat column changes width.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [measure]);

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
        <DialogRoot lazyMount unmountOnExit size="cover" placement="center">
          <DialogTrigger asChild>
            <Button
              size="xs"
              variant="outline"
              flexShrink={0}
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
              <VisualIframe html={html} title={title} height="100%" />
            </DialogBody>
          </DialogContent>
        </DialogRoot>
      </HStack>
      <VisualIframe
        ref={frameRef}
        html={html}
        title={title}
        height={`${height}px`}
        onLoad={measure}
      />
    </Box>
  );
}
