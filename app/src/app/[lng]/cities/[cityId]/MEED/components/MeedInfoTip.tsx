"use client";
import { Icon, IconButton } from "@chakra-ui/react";
import { LuInfo } from "react-icons/lu";
import { Tooltip } from "@/components/ui/tooltip";
import { FOCUS_RING } from "../focusRing";

export interface MeedInfoTipProps {
  /** Plain-language explanation. Already localized. */
  content: string;
  /** Accessible name for the trigger, e.g. "About the impact score". */
  ariaLabel: string;
}

/**
 * The "what does this mean?" affordance used next to scores, weights and
 * jargon. A focusable button rather than a hover-only icon, so the explanation
 * is reachable by keyboard and on touch.
 */
export function MeedInfoTip({ content, ariaLabel }: MeedInfoTipProps) {
  return (
    <Tooltip content={content} showArrow openDelay={100}>
      <IconButton
        aria-label={ariaLabel}
        variant="ghost"
        size="2xs"
        color="content.tertiary"
        _hover={{ color: "content.link", bg: "background.neutral" }}
        _focusVisible={FOCUS_RING}
      >
        <Icon as={LuInfo} boxSize="14px" />
      </IconButton>
    </Tooltip>
  );
}
