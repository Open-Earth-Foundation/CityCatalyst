"use client";
import { Box, Icon, Steps } from "@chakra-ui/react";
import { LuCheck, LuEye } from "react-icons/lu";
import { useRouter } from "next/navigation";
import type { TFunction } from "i18next";
import { MEED_WIZARD_STEPS } from "../steps";
import { stepHref, type MeedReturnTarget } from "../navigation";
import type { MeedSectionStates, MeedSectionStatus } from "../meedStatus";
import { FOCUS_RING } from "../focusRing";

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
 * Colour carries one meaning only — blue is "you are here". Everything else is
 * distinguished by *shape*: a check for finished, an eye for data that arrived
 * on its own and still wants a look, a plain number for everything else. An
 * earlier version painted four statuses in four colours, which read as noise in
 * a 28px strip with no legend; the full status vocabulary lives on the overview
 * cards and the pre-flight list, where each state is spelled out in words.
 *
 * Every step is always reachable — the flow is a graph, not a line — and status
 * comes from stored progress, not from position, so a step you skipped does not
 * masquerade as done.
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
      <Box mx="auto" w="full" maxW="1090px" px="l" py="m">
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
              const status: MeedSectionStatus =
                states[step.key]?.status ?? "not-started";
              const isActive = index === activeIndex;
              const isComplete = status === "complete";
              const needsReview = status === "needs-review";

              return (
                <Steps.Item key={step.key} index={index} flex="1" minW="0">
                  <Steps.Trigger
                    disabled={disabled}
                    aria-current={isActive ? "step" : undefined}
                    style={{ width: "100%" }}
                    // Chakra's stock steps recipe fills the current trigger with
                    // colorPalette.muted, which boxed the active step and broke
                    // the row's alignment. Own the background here instead.
                    bg="transparent"
                    _currentStep={{ bg: "transparent" }}
                    px="0"
                    py="0"
                  >
                    <Box
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      gap="s"
                      w="full"
                      px="xs"
                      py="xs"
                      borderRadius="rounded"
                      cursor={disabled ? "default" : "pointer"}
                      _hover={
                        disabled ? undefined : { bg: "background.neutral" }
                      }
                      _focusVisible={FOCUS_RING}
                    >
                      <Box
                        w="28px"
                        h="28px"
                        borderRadius="full"
                        borderWidth="1px"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        flexShrink={0}
                        fontSize="label.md"
                        fontWeight="semibold"
                        fontFamily="heading"
                        // Active: solid blue with a white number. Complete: solid
                        // green with a check. Everything else: quiet outline.
                        bg={
                          isActive
                            ? "content.link"
                            : isComplete
                              ? "interactive.tertiary"
                              : "base.light"
                        }
                        color={
                          isActive || isComplete
                            ? "base.light"
                            : "content.tertiary"
                        }
                        borderColor={
                          isActive
                            ? "content.link"
                            : isComplete
                              ? "interactive.tertiary"
                              : "border.neutral"
                        }
                      >
                        {isComplete ? (
                          <Icon as={LuCheck} boxSize="16px" />
                        ) : needsReview && !isActive ? (
                          <Icon
                            as={LuEye}
                            boxSize="14px"
                            color="content.secondary"
                            aria-label={t("status-needs-review")}
                          />
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
                        // Two lines are reserved for every label so the circles
                        // and the baselines line up whether the label wraps or not.
                        minH="32px"
                        display="flex"
                        alignItems="flex-start"
                        justifyContent="center"
                        // Weight is constant so the row never reflows on navigation.
                        fontWeight={isActive ? "semibold" : "medium"}
                        color={isActive ? "content.link" : "content.secondary"}
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
