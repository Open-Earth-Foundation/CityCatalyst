"use client";
import React from "react";
import { HStack, Icon, Link, chakra } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowRight } from "react-icons/lu";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";

/**
 * The one inline text action of the proposal screens: sentence case, link
 * colour, optional arrow. Rendered as a link when it navigates and as a
 * button when it acts. Uppercase is reserved for real buttons.
 */
export function TextLink({
  children,
  href,
  onClick,
  arrow = true,
  disabled = false,
  muted = false,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  arrow?: boolean;
  disabled?: boolean;
  /** Secondary colour for less important actions (Clear, Reset). */
  muted?: boolean;
}) {
  const color = disabled
    ? "content.tertiary"
    : muted
      ? "content.secondary"
      : "content.link";
  const body = (
    <HStack gap="xs" as="span">
      <span>{children}</span>
      {arrow && <Icon as={LuArrowRight} boxSize="14px" />}
    </HStack>
  );
  if (href) {
    return (
      <Link
        asChild
        color={color}
        fontFamily="heading"
        fontSize="label.md"
        fontWeight="semibold"
        _focusVisible={FOCUS_RING}
      >
        <NextLink href={href}>{body}</NextLink>
      </Link>
    );
  }
  return (
    <chakra.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      color={color}
      fontFamily="heading"
      fontSize="label.md"
      fontWeight="semibold"
      cursor={disabled ? "not-allowed" : "pointer"}
      _hover={disabled ? undefined : { textDecoration: "underline" }}
      _focusVisible={FOCUS_RING}
    >
      {body}
    </chakra.button>
  );
}
