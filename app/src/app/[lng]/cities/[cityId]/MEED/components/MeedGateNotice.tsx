"use client";
import { HStack, Icon, Link, VStack, Wrap } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuCircleAlert, LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import { BodyMedium } from "@/components/package/Texts/Body";
import type { MeedGate } from "../meedGate";
import { MEED_WIZARD_STEPS } from "../steps";
import { stepHref, type MeedReturnTarget } from "../navigation";
import { FOCUS_RING } from "../focusRing";

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
  lng: string;
  cityId: string;
  inventoryId: string;
  /** Where the named steps should return to once the user has filled them in. */
  from: MeedReturnTarget;
  /** Ties the notice to the button it explains, for screen readers. */
  id?: string;
}

/**
 * The one sentence that says whether a ranking can be generated, and if not,
 * exactly what is missing — as links to the screens that fix it.
 *
 * Always rendered next to the button it governs rather than hidden in a
 * tooltip: a disabled button whose only explanation is a `title` attribute is
 * invisible to keyboard and touch users.
 *
 * The copy comes from the `meed` namespace, read here rather than taken from
 * the host screen's `t`. Passing one in is how pre-flight ended up resolving
 * these keys from a duplicate set in `meed-preflight` that had drifted to a
 * bare count — so the screen that most needed the detail was the one that
 * lost it.
 */
export function MeedGateNotice({
  gate,
  lng,
  cityId,
  inventoryId,
  from,
  id,
}: MeedGateNoticeProps) {
  const { t } = useTranslation(lng, "meed");
  const tone = TONE[gate.tone];

  const missingSteps = gate.missing
    .map((key) => MEED_WIZARD_STEPS.find((s) => s.key === key))
    .filter((s): s is (typeof MEED_WIZARD_STEPS)[number] => Boolean(s));

  return (
    <VStack
      id={id}
      alignItems="stretch"
      gap="s"
      px="m"
      py="s"
      borderRadius="rounded"
      bg={tone.bg}
    >
      <HStack gap="s" alignItems="flex-start">
        <Icon as={tone.icon} boxSize="16px" color={tone.color} mt="xs" />
        <BodyMedium color={tone.color}>
          {t(gate.reasonKey, gate.reasonValues)}
        </BodyMedium>
      </HStack>

      {/*
        Naming what is missing is the minimum; linking it is the point. The
        user is standing at a disabled button — telling them "one more section"
        leaves them to hunt for which, and telling them its name still leaves
        them to find it.
      */}
      {missingSteps.length > 0 && (
        <Wrap gap="m" pl="l">
          {missingSteps.map((step) => (
            <Link
              key={step.key}
              asChild
              color={tone.color}
              fontFamily="heading"
              fontSize="label.md"
              fontWeight="semibold"
              textDecoration="underline"
              _focusVisible={FOCUS_RING}
            >
              <NextLink
                href={stepHref(lng, cityId, inventoryId, step.segment, from)}
              >
                {t(step.labelKey)}
              </NextLink>
            </Link>
          ))}
        </Wrap>
      )}
    </VStack>
  );
}
