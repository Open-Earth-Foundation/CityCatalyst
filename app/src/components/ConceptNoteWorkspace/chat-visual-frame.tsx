"use client";

import { Box, chakra, HStack, Icon, Text } from "@chakra-ui/react";
import {
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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

// Inline code and the jsDelivr chart libraries only; fetches, images and forms can't call out.
// Self-navigation still can: only serving visuals from a separate origin closes that.
const VISUAL_CSP =
  "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://cdn.jsdelivr.net; img-src data: blob:; font-src data: https://cdn.jsdelivr.net; connect-src 'none'; form-action 'none'; base-uri 'none'";

const VISUAL_HEIGHT_MESSAGE = "cnb-visual-height";
const INLINE_DEFAULT_HEIGHT = 420;
const INLINE_MIN_HEIGHT = 120;
const INLINE_MAX_HEIGHT = 720;

// Posts the content height so the inline card fits it. Starts after parsing so a
// half-built page never shrinks the card, skips 0 from throttled offscreen frames,
// takes max() for html/body pinned to 100%, and adds any horizontal scrollbar.
const HEIGHT_REPORTER = `<script>(()=>{const p=parent;addEventListener("DOMContentLoaded",()=>{const d=document.documentElement,b=document.body,post=()=>{const h=Math.max(d.getBoundingClientRect().height,b.scrollHeight);if(h>0)p.postMessage({type:"${VISUAL_HEIGHT_MESSAGE}",height:h+innerHeight-d.clientHeight},"*")},o=new ResizeObserver(post);o.observe(d);o.observe(b);addEventListener("load",post)})})()</script>`;

/** Wraps model HTML so our CSP meta and height reporter run before any model content. */
export function buildSandboxedVisualDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${VISUAL_CSP}">${HEIGHT_REPORTER}${html.replace(/^\s*<!doctype[^>]*>/i, "")}`;
}

function VisualIframe({
  html,
  title,
  height,
  ref,
}: {
  html: string;
  title: string;
  height: string;
  ref?: Ref<HTMLIFrameElement>;
}) {
  return (
    <chakra.iframe
      ref={ref}
      // Never add allow-same-origin: with allow-scripts it lets model code run as the app.
      sandbox="allow-scripts"
      srcDoc={buildSandboxedVisualDocument(html)}
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

/** An AI-generated HTML visual, isolated in a script-only sandboxed iframe. */
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

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Sandboxed frames have a null origin, so accept only this card's own frame.
      const frameWindow = frameRef.current?.contentWindow;
      if (
        !frameWindow ||
        event.source !== frameWindow ||
        event.data?.type !== VISUAL_HEIGHT_MESSAGE
      ) {
        return;
      }
      const reported = Number(event.data.height);
      if (reported > 0) {
        setHeight(
          Math.min(
            INLINE_MAX_HEIGHT,
            Math.max(INLINE_MIN_HEIGHT, Math.ceil(reported)),
          ),
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

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
      />
    </Box>
  );
}
