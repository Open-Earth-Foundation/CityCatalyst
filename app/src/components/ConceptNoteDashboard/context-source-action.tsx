"use client";

import { Icon } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuExternalLink } from "react-icons/lu";

import { Button } from "@/components/ui/button";

export interface ContextSourceAction {
  label: string;
  onClick?: () => void;
  // Links open in a new tab so the concept note stays open.
  href?: string;
  loading?: boolean;
  disabledReason?: string;
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
