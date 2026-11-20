"use client";

import { Box, HStack, Tabs, Text } from "@chakra-ui/react";
import {
  type ReactNode,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import { useTranslation } from "@/i18n/client";

import type { ConceptNoteChatVisualPanel } from "./chat-utils";
import { hasRenderedVisualContent } from "./chat-visual-content";
import { applyExpandedLayout, watchTableScroll } from "./chat-visual-layout";
import {
  ChatVisualFrame,
  hasSanitizedVisualContent,
  VisualEmptyNote,
  VisualExpandDialog,
  useSandboxedVisual,
  VisualIframe,
} from "./chat-visual-frame";
import { useVisualViewState } from "./use-visual-view-state";

interface ChatVisualPanelsProps {
  lng: string;
  onHeightChange?: () => void;
  panels: ConceptNoteChatVisualPanel[];
  title: string;
}

/**
 * Switchable cards from `concept_note_render_panels`. The app draws the tabs,
 * so they work with mouse, touch and keyboard (arrows, Home, End) and expose
 * tab/tabpanel roles; each body is model HTML in the usual sandboxed frame.
 *
 * The inline card and its single Expand dialog show the same tabs. Both read
 * one selected panel and one view state (open sections etc.) held here, so a
 * choice made in either place is shown in the other, also after reopening.
 */
export function ChatVisualPanels({
  lng,
  onHeightChange,
  panels,
  title,
}: ChatVisualPanelsProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const headingId = useId();
  const [selected, setSelected] = useState("0");
  // One host state for all panel bodies, inline and expanded; keyed per body.
  const viewState = useVisualViewState();

  // Older history can hold panels that are all blank after sanitizing (e.g.
  // script-only); each tab then shows its note and Expand has nothing to show.
  const allBlank = useMemo(
    () => panels.every((panel) => !hasSanitizedVisualContent(panel.html)),
    [panels],
  );

  // A revisited panel keeps its measured height, so re-pin the chat on switch.
  useLayoutEffect(() => onHeightChange?.(), [selected, onHeightChange]);

  /** The tab strip and bodies; `body` renders one panel for its location. */
  const renderTabs = (
    body: (panel: ConceptNoteChatVisualPanel, label: string) => ReactNode,
    expanded: boolean,
  ) => (
    // lazyMount without unmountOnExit: a visited panel keeps its frame.
    <Tabs.Root
      value={selected}
      onValueChange={(details) => setSelected(details.value)}
      lazyMount
      variant="line"
      size="sm"
      // In the dialog the active body fills the space under the tabs.
      {...(expanded && { display: "flex", flexDirection: "column", h: "full" })}
    >
      <Tabs.List
        aria-labelledby={expanded ? undefined : headingId}
        aria-label={expanded ? title : undefined}
        // Wraps onto more lines, so every tab stays visible without scrolling.
        flexWrap="wrap"
        flexShrink={0}
        px={expanded ? 4 : 0}
      >
        {panels.map((panel, index) => (
          <Tabs.Trigger
            key={index}
            value={String(index)}
            flexShrink={0}
            maxW="full"
            h="auto"
            minH="8"
            py={1.5}
            whiteSpace="normal"
            textAlign="start"
          >
            {panel.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {panels.map((panel, index) => (
        <Tabs.Content
          key={index}
          value={String(index)}
          pt={expanded ? 0 : 2}
          pb={0}
          {...(expanded && { flex: 1, minH: 0 })}
        >
          {body(panel, `${title}: ${panel.label}`)}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );

  return (
    <Box
      // The chat column is a flex container; without this the card shrinks.
      flexShrink={0}
      data-testid="concept-note-chat-panels"
      data-selected-panel={panels[Number(selected)]?.label}
    >
      <HStack gap={3} mb={1}>
        <Box flex={1} minW={0}>
          <Text
            id={headingId}
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {title}
          </Text>
          <Text fontSize="label.sm" color="content.tertiary">
            {t("chat-visual-label")}
          </Text>
        </Box>
        {/* One Expand for the whole card, with the same tabs inside. */}
        <VisualExpandDialog lng={lng} title={title} hidden={allBlank}>
          {renderTabs(
            (panel, label) => (
              <ExpandedPanelFrame
                html={panel.html}
                lng={lng}
                title={label}
                onFrameLoad={viewState.connect}
              />
            ),
            true,
          )}
        </VisualExpandDialog>
      </HStack>
      {renderTabs(
        (panel, label) => (
          <ChatVisualFrame
            bare
            html={panel.html}
            lng={lng}
            onHeightChange={onHeightChange}
            title={label}
            viewState={viewState}
          />
        ),
        false,
      )}
    </Box>
  );
}

/**
 * One panel body in the Expand dialog, sanitized when the dialog opens. A body
 * that is blank, statically or once laid out (e.g. hidden by CSS), gets the
 * same note as the inline card instead of an empty frame.
 */
function ExpandedPanelFrame({
  html,
  lng,
  onFrameLoad,
  title,
}: {
  html: string;
  lng: string;
  onFrameLoad: (frame: HTMLIFrameElement) => void;
  title: string;
}) {
  const { srcDoc, hasContent } = useSandboxedVisual(html, lng);
  const [renderedBlank, setRenderedBlank] = useState(false);
  // The dialog mounts only on click, so this always runs with DOMPurify.
  if (!hasContent || renderedBlank) {
    return <VisualEmptyNote lng={lng} />;
  }
  return (
    <VisualIframe
      srcDoc={srcDoc}
      title={title}
      height="100%"
      onFrameLoad={(frame) => {
        onFrameLoad(frame);
        if (frame.contentDocument) {
          applyExpandedLayout(frame.contentDocument);
          watchTableScroll(frame.contentDocument);
        }
        // null means not laid out yet; only a definite false is blank.
        if (hasRenderedVisualContent(frame.contentDocument) === false) {
          setRenderedBlank(true);
        }
      }}
    />
  );
}
