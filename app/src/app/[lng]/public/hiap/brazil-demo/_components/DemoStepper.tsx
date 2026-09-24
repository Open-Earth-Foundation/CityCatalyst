"use client";
import { Box, Icon, Steps } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { useRouter } from "next/navigation";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { trackHref } from "../_lib/hrefs";
import type { DemoTrack } from "../_lib/types";
import { useDemoT } from "../_lib/useDemoT";

export const WIZARD_STEPS = ["preferences", "preflight"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * The module's two-step wizard strip (preferences → pre-flight), in the same
 * `Steps` markup as `MeedStepper`: blue for "you are here", a check for done,
 * a plain number otherwise.
 */
export function DemoStepper({
  lng,
  city,
  track,
  active,
  done,
}: {
  lng: string;
  city: string;
  track: DemoTrack;
  active: WizardStep;
  done: Partial<Record<WizardStep, boolean>>;
}) {
  const { t } = useDemoT(lng);
  const router = useRouter();
  const activeIndex = WIZARD_STEPS.indexOf(active);
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
          count={WIZARD_STEPS.length}
          size="sm"
          onStepChange={(details) => {
            const next = WIZARD_STEPS[details.step];
            if (next) router.push(trackHref(lng, city, track, next));
          }}
        >
          <Steps.List gap="0">
            {WIZARD_STEPS.map((step, index) => {
              const isActive = index === activeIndex;
              const isComplete = Boolean(done[step]) && !isActive;
              return (
                <Steps.Item key={step} index={index} flex="1" minW="0">
                  <Steps.Trigger
                    aria-current={isActive ? "step" : undefined}
                    style={{ width: "100%" }}
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
                      cursor="pointer"
                      _hover={{ bg: "background.neutral" }}
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
                        fontSize="label.md"
                        fontWeight="semibold"
                        fontFamily="heading"
                        bg={
                          isActive
                            ? "content.link"
                            : isComplete
                              ? "interactive.tertiary"
                              : "base.light"
                        }
                        borderColor={
                          isActive
                            ? "content.link"
                            : isComplete
                              ? "interactive.tertiary"
                              : "border.neutral"
                        }
                        color={
                          isActive || isComplete
                            ? "base.light"
                            : "content.tertiary"
                        }
                      >
                        {isComplete ? (
                          <Icon as={LuCheck} boxSize="14px" />
                        ) : (
                          index + 1
                        )}
                      </Box>
                      <Box
                        as="span"
                        fontFamily="heading"
                        fontSize="label.md"
                        fontWeight={isActive ? "semibold" : "medium"}
                        color={isActive ? "content.link" : "content.secondary"}
                        textAlign="center"
                      >
                        {t(`step-${step}`)}
                      </Box>
                    </Box>
                  </Steps.Trigger>
                  {index < WIZARD_STEPS.length - 1 && <Steps.Separator />}
                </Steps.Item>
              );
            })}
          </Steps.List>
        </Steps.Root>
      </Box>
    </Box>
  );
}
