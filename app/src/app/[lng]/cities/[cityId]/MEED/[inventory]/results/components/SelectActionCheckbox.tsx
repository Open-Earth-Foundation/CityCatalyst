"use client";
import React from "react";
import { Checkbox } from "@chakra-ui/react";
import { FOCUS_RING } from "../../../focusRing";

/**
 * The one selection control on this screen. Top-pick cards and ranking rows
 * both render it, and both feed the same selection state — so an action ticked
 * in the table is the same tick the user sees on its card.
 *
 * Built from Chakra's `Checkbox.Root` parts rather than the `ui/checkbox`
 * wrapper because these live inside mapped arrays (see the note in
 * components/ui/checkbox.tsx).
 */
export function SelectActionCheckbox({
  checked,
  onToggle,
  ariaLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  /** Names the action being selected, e.g. "Select Bus rapid transit…". */
  ariaLabel: string;
}) {
  return (
    <Checkbox.Root
      checked={checked}
      onCheckedChange={onToggle}
      cursor="pointer"
      flexShrink={0}
    >
      <Checkbox.HiddenInput aria-label={ariaLabel} />
      <Checkbox.Control
        borderWidth="1px"
        borderColor="border.neutral"
        bg="base.light"
        _checked={{
          bg: "content.link",
          borderColor: "content.link",
          color: "base.light",
        }}
        _focusVisible={FOCUS_RING}
      >
        <Checkbox.Indicator />
      </Checkbox.Control>
    </Checkbox.Root>
  );
}
