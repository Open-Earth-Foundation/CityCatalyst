"use client";

import { Box, chakra, HStack, Icon, Text } from "@chakra-ui/react";
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

// Inline code and the jsDelivr chart libraries only; nothing may call out.
const VISUAL_CSP =
  "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://cdn.jsdelivr.net; img-src data: blob:; font-src data: https://cdn.jsdelivr.net; connect-src 'none'; form-action 'none'; base-uri 'none'";

/** Wraps model HTML so our CSP meta is parsed before any model content. */
export function buildSandboxedVisualDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${VISUAL_CSP}">${html.replace(/^\s*<!doctype[^>]*>/i, "")}`;
}

function VisualIframe({
  html,
  title,
  h,
}: {
  html: string;
  title: string;
  h: string;
}) {
  return (
    <chakra.iframe
      // Never add allow-same-origin: with allow-scripts it lets model code run as the app.
      sandbox="allow-scripts"
      srcDoc={buildSandboxedVisualDocument(html)}
      title={title}
      referrerPolicy="no-referrer"
      loading="lazy"
      display="block"
      w="full"
      h={h}
      border={0}
      bg="base.light"
    />
  );
}

interface ChatVisualFrameProps {
  html: string;
  lng: string;
  title: string;
}

/** An AI-generated HTML visual, isolated in a script-only sandboxed iframe. */
export function ChatVisualFrame({ html, lng, title }: ChatVisualFrameProps) {
  const { t } = useTranslation(lng, "concept-notes");
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
              <VisualIframe html={html} title={title} h="full" />
            </DialogBody>
          </DialogContent>
        </DialogRoot>
      </HStack>
      <VisualIframe html={html} title={title} h="420px" />
    </Box>
  );
}
