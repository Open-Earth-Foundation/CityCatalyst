"use client";

import { Box, Icon, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { LuCheck, LuX } from "react-icons/lu";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { useTranslation } from "@/i18n/client";
import type { EditChange } from "@/util/concept-note-edit-types";
import {
  inlineReviewPlugin,
  locateEdits,
  type InlineReviewDecision,
} from "./inline-review";
import { remarkMissingInformation } from "./draft-markdown";
import {
  missingInformationComponents,
  MissingInformationText,
} from "./missing-information";
import { ReviewButton as Button } from "./review-button";

const noInlineDecisions: Record<string, InlineReviewDecision> = {};

function InlineDecisionControl({
  action,
  disabled,
  label,
  selected,
  onClick,
}: {
  action: "accept" | "reject";
  disabled: boolean;
  label: string;
  selected: boolean;
  onClick?: () => void;
}) {
  const rejecting = action === "reject";
  const icon = rejecting ? LuX : LuCheck;
  const foreground = rejecting ? "red.fg" : "green.fg";
  const overlay = rejecting
    ? "sentiment.negativeOverlay"
    : "sentiment.positiveOverlay";
  const selectedBackground = rejecting
    ? "sentiment.negativeDefault"
    : "sentiment.positiveDefault";
  if (!onClick)
    return (
      <Icon
        as={icon}
        aria-hidden="true"
        display="inline-block"
        verticalAlign="middle"
        boxSize="16px"
        mx={1}
        borderRadius="full"
        bg={overlay}
        color={foreground}
      />
    );
  return (
    <Button
      type="button"
      display="inline-flex"
      verticalAlign="middle"
      w="22px"
      h="22px"
      minW="22px"
      minH="22px"
      p={0}
      mx={0.5}
      borderRadius="full"
      variant="outline"
      borderColor={foreground}
      bg={selected ? selectedBackground : overlay}
      color={selected ? "base.light" : foreground}
      _hover={{ bg: selectedBackground, color: "base.light" }}
      aria-label={label}
      aria-pressed={selected}
      data-testid={`concept-note-inline-${action}`}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      <Icon as={icon} aria-hidden="true" boxSize="12px" />
    </Button>
  );
}

export function EditDiff({
  change,
  lng,
  inline = false,
  components,
  decision,
  disabled = false,
  onAccept,
  onReject,
}: {
  change: Pick<EditChange, "before" | "after" | "chapter_title">;
  lng: string;
  inline?: boolean;
  components?: Components;
  decision?: InlineReviewDecision;
  disabled?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const markerComponents = useMemo(
    () => missingInformationComponents(components ?? {}),
    [components],
  );
  return (
    <Box
      as={inline ? "span" : "div"}
      data-testid="concept-note-edit-diff"
      role="group"
      aria-label={t("edit-diff-label", { chapter: change.chapter_title })}
    >
      {inline ? (
        <Box
          as="span"
          display="inline-grid"
          gap={1}
          w="100%"
          my={1}
          verticalAlign="top"
        >
          {change.before && (
            <Box
              as="span"
              display="flex"
              alignItems="flex-start"
              gap={1}
              px={2}
              py={1}
              borderInlineStart="2px solid"
              borderColor="red.fg"
              borderRadius="sm"
              bg="sentiment.negativeOverlay"
            >
              <Box
                as="del"
                flex="1"
                minW={0}
                whiteSpace="pre-wrap"
                overflowWrap="anywhere"
                color="red.fg"
                textDecoration="line-through"
                data-testid="concept-note-edit-previous-text"
                aria-label={t("edit-previous")}
              >
                <MissingInformationText text={change.before} />
              </Box>
              <InlineDecisionControl
                action="reject"
                disabled={disabled}
                label={t("edit-reject-change")}
                selected={decision === "rejected"}
                onClick={onReject}
              />
              {!change.after && (
                <InlineDecisionControl
                  action="accept"
                  disabled={disabled}
                  label={t("edit-accept-change")}
                  selected={decision === "accepted"}
                  onClick={onAccept}
                />
              )}
            </Box>
          )}
          {change.before && change.after ? " " : null}
          {change.after && (
            <Box
              as="span"
              display="flex"
              alignItems="flex-start"
              gap={1}
              px={2}
              py={1}
              borderInlineStart="2px solid"
              borderColor="green.fg"
              borderRadius="sm"
              bg="sentiment.positiveOverlay"
            >
              <Box
                as="ins"
                flex="1"
                minW={0}
                whiteSpace="pre-wrap"
                overflowWrap="anywhere"
                color="green.fg"
                textDecoration="none"
                data-testid="concept-note-edit-proposed-text"
                aria-label={t("edit-proposed")}
              >
                <MissingInformationText text={change.after} />
              </Box>
              {!change.before && (
                <InlineDecisionControl
                  action="reject"
                  disabled={disabled}
                  label={t("edit-reject-change")}
                  selected={decision === "rejected"}
                  onClick={onReject}
                />
              )}
              <InlineDecisionControl
                action="accept"
                disabled={disabled}
                label={t("edit-accept-change")}
                selected={decision === "accepted"}
                onClick={onAccept}
              />
            </Box>
          )}
        </Box>
      ) : (
        <>
          <Box
            as="del"
            display="block"
            bg="sentiment.negativeOverlay"
            px={3}
            py={2}
            textDecoration="line-through"
            whiteSpace="pre-wrap"
            overflowWrap="anywhere"
            color="content.primary"
            data-testid="concept-note-edit-previous-text"
            aria-label={t("edit-previous")}
          >
            <ReactMarkdown
              components={markerComponents}
              remarkPlugins={[remarkGfm, remarkMissingInformation]}
            >
              {change.before}
            </ReactMarkdown>
          </Box>{" "}
          <Box
            as="ins"
            display="block"
            bg="sentiment.positiveOverlay"
            px={3}
            py={2}
            textDecoration="underline"
            whiteSpace="pre-wrap"
            overflowWrap="anywhere"
            color="content.primary"
            data-testid="concept-note-edit-proposed-text"
            aria-label={t("edit-proposed")}
          >
            <ReactMarkdown
              components={markerComponents}
              remarkPlugins={[remarkGfm, remarkMissingInformation]}
            >
              {change.after || t("edit-deleted")}
            </ReactMarkdown>
          </Box>
          {(onReject || onAccept) && (
            <Box display="flex" justifyContent="flex-end" mt={1}>
              <InlineDecisionControl
                action="reject"
                disabled={disabled}
                label={t("edit-reject-change")}
                selected={decision === "rejected"}
                onClick={onReject}
              />
              <InlineDecisionControl
                action="accept"
                disabled={disabled}
                label={t("edit-accept-change")}
                selected={decision === "accepted"}
                onClick={onAccept}
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export function InlineDocumentDiff({
  markdown,
  changes,
  lng,
  components,
  activeChangeId,
  decisions = noInlineDecisions,
  disabled = false,
  onAcceptChange,
  onRejectChange,
}: {
  markdown: string;
  changes: EditChange[];
  lng: string;
  components: Components;
  activeChangeId?: string;
  decisions?: Record<string, InlineReviewDecision>;
  disabled?: boolean;
  onAcceptChange?: (changeIds: string[]) => void;
  onRejectChange?: (changeIds: string[]) => void;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const located = useMemo(
    () => locateEdits(markdown, changes),
    [markdown, changes],
  );
  const plugin = useMemo(
    () => inlineReviewPlugin(markdown, located ?? []),
    [markdown, located],
  );
  const chapterTitle = changes[0]?.chapter_title ?? "";
  const reviewComponents = useMemo(
    () =>
      ({
        ...missingInformationComponents(components),
        "cnb-edit": ({
          changeIds,
          before,
          after,
          block,
        }: {
          changeIds: string;
          before: string;
          after: string;
          block: string;
        }) => {
          const ids = changeIds.split(" ");
          const active = ids.includes(activeChangeId ?? "");
          const decision = ids.every((id) => decisions[id] === "accepted")
            ? "accepted"
            : ids.every((id) => decisions[id] === "rejected")
              ? "rejected"
              : undefined;
          return (
            <Box
              as={block === "true" ? "div" : "span"}
              data-testid="concept-note-inline-change"
              data-change-id={ids[0]}
              data-change-ids={changeIds}
              data-active-change={String(active)}
              data-review-decoration="true"
              tabIndex={-1}
              borderInlineStart={active ? "2px solid" : undefined}
              borderColor="content.link"
              ps={active ? 1 : undefined}
              _focusVisible={{
                outline: "2px solid",
                outlineColor: "content.link",
                outlineOffset: "3px",
              }}
              my={block === "true" ? 3 : undefined}
            >
              <EditDiff
                lng={lng}
                inline={block !== "true"}
                components={components}
                change={{ before, after, chapter_title: chapterTitle }}
                decision={decision}
                disabled={disabled}
                onAccept={
                  onAcceptChange ? () => onAcceptChange(ids) : undefined
                }
                onReject={
                  onRejectChange ? () => onRejectChange(ids) : undefined
                }
              />
            </Box>
          );
        },
      }) as Components,
    [
      components,
      activeChangeId,
      lng,
      chapterTitle,
      decisions,
      disabled,
      onAcceptChange,
      onRejectChange,
    ],
  );
  return (
    <Box
      data-review-decoration="true"
      data-testid="concept-note-inline-document"
    >
      {!located && <Text role="alert">{t("edit-inline-stale")}</Text>}
      <ReactMarkdown
        components={reviewComponents}
        remarkPlugins={[remarkGfm, plugin, remarkMissingInformation]}
      >
        {markdown}
      </ReactMarkdown>
    </Box>
  );
}
