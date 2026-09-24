"use client";

import { chakra, Icon } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuChevronDown, LuExternalLink } from "react-icons/lu";

import { Button } from "@/components/ui/button";

export interface ContextSourceAction {
  label: string;
  onClick?: () => void;
  // Links open in a new tab so the concept note stays open.
  href?: string;
  loading?: boolean;
  disabledReason?: string;
}

/**
 * A choice shown as a chip beside the status badge, sized to match it, e.g.
 * the inventory year that opens the inventory picker.
 */
export function ContextSourceChip({
  action,
  reasonId,
  title,
}: {
  action: ContextSourceAction;
  reasonId?: string;
  title?: string;
}) {
  const disabled = Boolean(action.disabledReason) || Boolean(action.loading);
  return (
    <chakra.button
      type="button"
      display="inline-flex"
      alignItems="center"
      gap={1}
      px={2}
      py={0.5}
      border="1px solid"
      borderColor="background.overlay"
      borderRadius="pill"
      bg="background.neutral"
      color="content.link"
      fontSize="10px"
      lineHeight="16px"
      fontWeight="semibold"
      cursor={disabled ? "not-allowed" : "pointer"}
      opacity={disabled ? 0.6 : 1}
      _hover={disabled ? undefined : { borderColor: "content.link" }}
      title={title}
      aria-haspopup="dialog"
      aria-describedby={action.disabledReason ? reasonId : undefined}
      disabled={disabled}
      onClick={action.onClick}
    >
      {action.label}
      <Icon as={LuChevronDown} boxSize={3} />
    </chakra.button>
  );
}

/** Next-step control shared by the note-list tiles and the Context tab cards. */
export function ContextSourceActionButton({
  action,
  reasonId,
}: {
  action: ContextSourceAction;
  reasonId?: string;
}) {
  const disabled = Boolean(action.disabledReason);
  if (action.href && !disabled) {
    return (
      <Button
        asChild
        size="xs"
        variant="outline"
        flexShrink={0}
        textTransform="none"
        letterSpacing="normal"
      >
        <NextLink href={action.href} target="_blank" rel="noopener noreferrer">
          {action.label}
          <Icon as={LuExternalLink} />
        </NextLink>
      </Button>
    );
  }
  return (
    <Button
      size="xs"
      variant="outline"
      flexShrink={0}
      textTransform="none"
      letterSpacing="normal"
      disabled={disabled}
      loading={action.loading}
      aria-describedby={disabled ? reasonId : undefined}
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  );
}
