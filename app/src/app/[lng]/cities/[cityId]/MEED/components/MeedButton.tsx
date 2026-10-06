"use client";
import React, { forwardRef } from "react";
import {
  CCTerraButton,
  type CCTerraButtonProps,
  type CCTerraButtonVariant,
} from "@/components/package/Button/CCTerraButton";

/**
 * `CCTerraButton` with a disabled state you can actually see.
 *
 * The shared button styles every variant's default, hover and active state but
 * defines no `_disabled` at all, so a disabled button renders at full brand
 * blue with `opacity: 1` — visually identical to a working one. The only cue is
 * `cursor: not-allowed`, which needs a mouse and a hover, so on touch there is
 * no cue whatsoever. Half this module's primary actions are gated, which made
 * that the single most misleading thing on screen.
 *
 * Fixed here rather than in `CCTerraButton` deliberately: that component is
 * used across the whole product, so correcting it belongs in its own change
 * with wider review. This wrapper keeps the fix inside MEED in the meantime.
 *
 * Colour is used rather than opacity: fading white-on-blue produces a washed
 * mid-blue that still reads as a button, whereas dropping to the neutral
 * surface with tertiary text reads as unavailable at a glance and keeps text
 * contrast predictable.
 */
type DisabledStyles = NonNullable<CCTerraButtonProps["_disabled"]>;

const DISABLED_BY_VARIANT: Record<CCTerraButtonVariant, DisabledStyles> = {
  filled: {
    bg: "background.neutral",
    color: "content.tertiary",
    border: "none",
    boxShadow: "none",
  },
  outlined: {
    bg: "transparent",
    color: "content.tertiary",
    border: "2px solid",
    borderColor: "border.neutral",
    boxShadow: "none",
  },
  text: {
    bg: "transparent",
    color: "content.tertiary",
    border: "none",
    textDecoration: "none",
  },
};

export const MeedButton = forwardRef<HTMLButtonElement, CCTerraButtonProps>(
  ({ variant = "filled", ...rest }, ref) => {
    const disabledStyles = DISABLED_BY_VARIANT[variant];
    return (
      <CCTerraButton
        ref={ref}
        variant={variant}
        _disabled={{
          ...disabledStyles,
          cursor: "not-allowed",
          opacity: 1,
          // Without these the base variant's hover still fires on a disabled
          // control, which reads as "this responds to me".
          _hover: disabledStyles,
          _active: disabledStyles,
        }}
        {...rest}
      />
    );
  },
);

MeedButton.displayName = "MeedButton";
