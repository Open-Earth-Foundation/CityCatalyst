"use client";
import { HStack, Icon } from "@chakra-ui/react";
import { LuCircleAlert, LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import type { MeedGate } from "../meedGate";
import { MEED_WIZARD_STEPS } from "../steps";

const TONE = {
  negative: {
    icon: LuCircleAlert,
    color: "sentiment.negativeDefault",
    bg: "sentiment.negativeOverlay",
  },
  warning: {
    icon: LuTriangleAlert,
    color: "sentiment.warningDefault",
    bg: "sentiment.warningOverlay",
  },
  positive: {
    icon: LuCircleCheck,
    color: "interactive.tertiary",
    bg: "sentiment.positiveOverlay",
  },
} as const;

export interface MeedGateNoticeProps {
  gate: MeedGate;
  t: TFunction;
  /** Ties the notice to the button it explains, for screen readers. */
  id?: string;
}

/**
 * The one sentence that says whether a ranking can be generated, and if not,
 * what is missing.
 *
 * Always rendered next to the button it governs rather than hidden in a
 * tooltip — a disabled button whose only explanation is a `title` attribute is
 * invisible to keyboard and touch users.
 */
export function MeedGateNotice({ gate, t, id }: MeedGateNoticeProps) {
  const tone = TONE[gate.tone];

  return (
    <HStack
      id={id}
      gap="s"
      px="m"
      py="s"
      borderRadius="rounded"
      bg={tone.bg}
      alignItems="flex-start"
    >
      <Icon as={tone.icon} boxSize="16px" color={tone.color} mt="xs" />
      <BodyMedium color={tone.color}>
        {t(gate.reasonKey, {
          ...gate.reasonValues,
          // Name the outstanding sections. A bare count leaves the user to
          // work out which of six cards it meant.
          sections: gate.missing
            .map((key) => {
              const step = MEED_WIZARD_STEPS.find((s) => s.key === key);
              return step ? t(step.labelKey) : null;
            })
            .filter(Boolean)
            .join(", "),
        })}
      </BodyMedium>
    </HStack>
  );
}
