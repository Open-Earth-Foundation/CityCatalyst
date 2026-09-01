import { Box, Flex, HStack, Icon, Text, VStack } from "@chakra-ui/react";
import {
  LuCheck,
  LuListChecks,
  LuSearchCheck,
  LuShieldCheck,
} from "react-icons/lu";

import { useTranslation } from "@/i18n/client";

import type { ReviewStage } from "./use-guided-review";

const reviewSteps: Array<{
  icon: typeof LuListChecks;
  key: Exclude<ReviewStage, "running" | "export">;
  labelKey: string;
}> = [
  {
    key: "missing_information",
    labelKey: "review-step-missing-information",
    icon: LuListChecks,
  },
  {
    key: "conflicts_logic",
    labelKey: "review-step-conflicts-logic",
    icon: LuSearchCheck,
  },
  {
    key: "decision",
    labelKey: "review-step-decision",
    icon: LuShieldCheck,
  },
];

export function stageIndex(stage: ReviewStage): number {
  if (stage === "running") return -1;
  if (stage === "export") return reviewSteps.length - 1;
  return reviewSteps.findIndex((step) => step.key === stage);
}

export function GuidedReviewStepper({
  currentStepIndex,
  lng,
}: {
  currentStepIndex: number;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");

  return (
    <VStack
      display={{ base: "none", md: "flex" }}
      w="230px"
      flexShrink={0}
      align="stretch"
      gap={1}
      borderRight="1px solid"
      borderColor="border.neutral"
      bg="background.neutral"
      px={4}
      py={6}
    >
      <Text
        mb={3}
        px={3}
        fontFamily="heading"
        fontSize="overline"
        fontWeight="semibold"
        letterSpacing="widest"
        color="content.tertiary"
        textTransform="uppercase"
      >
        {t("guided-review-steps")}
      </Text>
      {reviewSteps.map((step, index) => {
        const isActive = currentStepIndex === index;
        const isComplete = currentStepIndex > index;
        return (
          <HStack
            key={step.key}
            aria-current={isActive ? "step" : undefined}
            gap={3}
            borderRadius="rounded"
            bg={isActive ? "base.light" : "transparent"}
            color={
              isActive || isComplete ? "content.primary" : "content.tertiary"
            }
            px={3}
            py={3}
            boxShadow={isActive ? "1dp" : "none"}
          >
            <Flex
              boxSize="28px"
              align="center"
              justify="center"
              flexShrink={0}
              borderRadius="full"
              bg={
                isComplete
                  ? "sentiment.positiveDefault"
                  : isActive
                    ? "content.link"
                    : "background.alternativeLight"
              }
              color={isActive || isComplete ? "base.light" : "inherit"}
            >
              <Icon as={isComplete ? LuCheck : step.icon} boxSize={3.5} />
            </Flex>
            <Box>
              <Text fontSize="label.sm" color="content.tertiary">
                {t("review-step-number", { number: index + 1 })}
              </Text>
              <Text fontSize="body.sm" fontWeight="semibold">
                {t(step.labelKey)}
              </Text>
            </Box>
          </HStack>
        );
      })}
    </VStack>
  );
}

export function ReviewStageHeader({
  description,
  lng,
  step,
  title,
}: {
  description: string;
  lng: string;
  step: number;
  title: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  return (
    <Box>
      <Text fontSize="label.sm" fontWeight="semibold" color="content.link">
        {t("review-step-number", { number: step })}
      </Text>
      <Text
        as="h2"
        mt={1}
        fontFamily="heading"
        fontSize="title.lg"
        fontWeight="semibold"
        color="content.primary"
      >
        {title}
      </Text>
      <Text mt={2} maxW="640px" fontSize="body.sm" color="content.secondary">
        {description}
      </Text>
    </Box>
  );
}
