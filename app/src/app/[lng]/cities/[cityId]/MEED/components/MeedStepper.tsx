"use client";
import { Box, Icon, Steps } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { useRouter } from "next/navigation";
import type { TFunction } from "i18next";
import { MEED_WIZARD_STEPS } from "../steps";
import { stepHref, type MeedReturnTarget } from "../navigation";
import type { MeedSectionStates, MeedSectionStatus } from "../meedStatus";

const INDICATOR: Record<
  MeedSectionStatus,
  { bg: string; color: string; borderColor: string }
> = {
  complete: {
    bg: "interactive.tertiary",
    color: "base.light",
    borderColor: "interactive.tertiary",
  },
  "needs-review": {
    bg: "base.light",
    color: "content.link",
    borderColor: "content.link",
  },
  "in-progress": {
    bg: "base.light",
    color: "sentiment.warningDefault",
    borderColor: "sentiment.warningDefault",
  },
  "not-started": {
    bg: "base.light",
    color: "content.tertiary",
    borderColor: "border.neutral",
  },
};

export interface MeedStepperProps {
  /** Index into MEED_WIZARD_STEPS, or -1 when on a non-step screen. */
  activeIndex: number;
  states: MeedSectionStates;
  lng: string;
  cityId: string;
  inventoryId: string;
  t: TFunction;
  /** Carried into each step link so the step knows where to return to. */
  from?: MeedReturnTarget;
  /** Read-only while the ranking is being generated. */
  disabled?: boolean;
}

/**
 * Horizontal stepper across the top of every wizard screen.
 *
 * Two things it does that the previous version did not: every step is always
 * reachable (the flow is a graph, not a line), and each step's indicator
 * reflects *stored progress* rather than its position relative to the current
 * step — so a step you skipped reads as not started even if you are past it.
 *
 * Built on Chakra's Steps so each trigger is a real button with keyboard
 * support; the indicator content is supplied per step instead of using
 * `Steps.Status`, which derives from the index.
 */
export function MeedStepper({
  activeIndex,
  states,
  lng,
  cityId,
  inventoryId,
  t,
  from,
  disabled = false,
}: MeedStepperProps) {
  const router = useRouter();

  return (
    <Box
      w="full"
      bg="base.light"
      borderBottomWidth="1px"
      borderColor="border.overlay"
    >
      <Box mx="auto" w="full" maxW="1090px" px="24px" py="14px">
        <Steps.Root
          step={activeIndex}
          count={MEED_WIZARD_STEPS.length}
          size="sm"
          onStepChange={(details) => {
            if (disabled) return;
            const next = MEED_WIZARD_STEPS[details.step];
            if (next) {
              router.push(
                stepHref(lng, cityId, inventoryId, next.segment, from),
              );
            }
          }}
        >
          <Steps.List gap="0">
            {MEED_WIZARD_STEPS.map((step, index) => {
              const status = states[step.key]?.status ?? "not-started";
              const isActive = index === activeIndex;
              const style = INDICATOR[status];

              return (
                <Steps.Item key={step.key} index={index} flex="1" minW="0">
                  <Steps.Trigger
                    disabled={disabled}
                    aria-current={isActive ? "step" : undefined}
                    style={{ width: "100%" }}
                  >
                    <Box
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      gap="6px"
                      w="full"
                      px="4px"
                      py="4px"
                      borderRadius="rounded"
                      cursor={disabled ? "default" : "pointer"}
                      _hover={disabled ? undefined : { bg: "background.neutral" }}
                      _focusVisible={{
                        outline: "2px solid",
                        outlineColor: "content.link",
                        outlineOffset: "2px",
                      }}
                    >
                      <Box
                        w="28px"
                        h="28px"
                        borderRadius="full"
                        borderWidth={isActive ? "2px" : "1px"}
                        bg={style.bg}
                        color={style.color}
                        borderColor={
                          isActive ? "content.link" : style.borderColor
                        }
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        fontSize="label.md"
                        fontWeight="semibold"
                        fontFamily="heading"
                        flexShrink={0}
                      >
                        {status === "complete" ? (
                          <Icon as={LuCheck} boxSize="16px" />
                        ) : (
                          index + 1
                        )}
                      </Box>
                      <Box
                        as="span"
                        fontSize="label.sm"
                        fontFamily="heading"
                        lineHeight="16px"
                        textAlign="center"
                        // Weight is constant so the row never reflows on navigation.
                        fontWeight="medium"
                        color={
                          isActive
                            ? "content.link"
                            : status === "not-started"
                              ? "content.tertiary"
                              : "content.secondary"
                        }
                      >
                        {t(step.labelKey)}
                      </Box>
                    </Box>
                  </Steps.Trigger>
                </Steps.Item>
              );
            })}
          </Steps.List>
        </Steps.Root>
      </Box>
    </Box>
  );
}
