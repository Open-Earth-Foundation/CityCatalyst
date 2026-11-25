"use client";
import React from "react";
import { HStack, Icon, Link, chakra } from "@chakra-ui/react";
import NextLink from "next/link";
import type { IconType } from "react-icons";
import { LuArrowRight } from "react-icons/lu";
import { FOCUS_RING } from "../focusRing";

/**
 * The one inline text action of the MEED screens: sentence case, link
 * colour, an optional trailing icon. A link when it navigates, a button when
 * it acts. Uppercase stays reserved for real buttons.
 */
export function MeedTextLink({
  children,
  href,
  onClick,
  icon = LuArrowRight,
  disabled = false,
  muted = false,
  external = false,
  ...rest
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /** Trailing icon; pass `null` for none. */
  icon?: IconType | null;
  disabled?: boolean;
  /** Secondary colour for less important actions. */
  muted?: boolean;
  /** Opens in a new tab (documents outside the app). */
  external?: boolean;
  alignSelf?: string;
  flexShrink?: number;
}) {
  const color = disabled
    ? "content.tertiary"
    : muted
      ? "content.secondary"
      : "content.link";
  const body = (
    <HStack gap="xs" as="span" alignItems="center">
      <span>{children}</span>
      {icon && <Icon as={icon} boxSize="14px" />}
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
        {...rest}
      >
        <NextLink
          href={href}
          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        >
          {body}
        </NextLink>
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
      {...rest}
    >
      {body}
    </chakra.button>
  );
}
