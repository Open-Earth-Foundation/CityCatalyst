"use client";
import { Checkbox, HStack } from "@chakra-ui/react";
import { FOCUS_RING } from "../focusRing";

export interface MeedChipOption {
  value: string;
  label: string;
}

export interface MeedChipGroupProps {
  options: MeedChipOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Red tinting for "exclude these" groups. */
  tone?: "default" | "negative";
  /** Accessible name for the group. */
  ariaLabel: string;
}

/**
 * Multi-select pills.
 *
 * Backed by a real checkbox input, so selection is announced to screen readers,
 * the control is keyboard-operable and it gets a focus ring — none of which the
 * previous hand-rolled `<div role=button>` version had. The visible tick is
 * omitted because the filled pill already carries the state.
 *
 * Uses Chakra's `Checkbox.Root` directly rather than the `ui/checkbox` wrapper,
 * per that component's own guidance for checkboxes rendered from a mapped array.
 * Chakra's SegmentGroup is deliberately not used: these groups are multi-select.
 */
export function MeedChipGroup({
  options,
  selected,
  onChange,
  tone = "default",
  ariaLabel,
}: MeedChipGroupProps) {
  const activeBg =
    tone === "negative" ? "sentiment.negativeOverlay" : "content.link";
  const activeColor =
    tone === "negative" ? "sentiment.negativeDefault" : "base.light";
  const activeBorder =
    tone === "negative" ? "sentiment.negativeDefault" : "content.link";

  const toggle = (value: string, checked: boolean) => {
    onChange(
      checked ? [...selected, value] : selected.filter((v) => v !== value),
    );
  };

  return (
    <HStack gap="s" flexWrap="wrap" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const isSelected = selected.includes(option.value);
        return (
          <Checkbox.Root
            key={option.value}
            checked={isSelected}
            onCheckedChange={(details) =>
              toggle(option.value, !!details.checked)
            }
            px="m"
            py="s"
            borderRadius="pill"
            borderWidth="1px"
            cursor="pointer"
            bg={isSelected ? activeBg : "base.light"}
            borderColor={isSelected ? activeBorder : "border.neutral"}
            color={isSelected ? activeColor : "content.secondary"}
            _hover={{ borderColor: activeBorder }}
            _focusWithin={FOCUS_RING}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Label
              fontSize="label.md"
              fontFamily="heading"
              fontWeight="medium"
              color="inherit"
              cursor="pointer"
            >
              {option.label}
            </Checkbox.Label>
          </Checkbox.Root>
        );
      })}
    </HStack>
  );
}
