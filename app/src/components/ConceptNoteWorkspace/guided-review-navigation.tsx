import { Box, HStack, Text, VStack } from "@chakra-ui/react";

import { useTranslation } from "@/i18n/client";

import type { ReviewStage } from "./use-guided-review";

const reviewSteps = [
  ["missing_information", "review-step-missing-information"],
  ["conflicts_logic", "review-step-conflicts-logic"],
  ["decision", "review-step-decision"],
] as const;

export function stageIndex(stage: ReviewStage): number {
  if (stage === "running") return -1;
  if (stage === "export") return reviewSteps.length - 1;
  return reviewSteps.findIndex(([key]) => key === stage);
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
      gap={2}
      borderRight="1px solid"
      borderColor="border.neutral"
      bg="background.neutral"
      p={6}
    >
      <Text fontSize="overline" color="content.tertiary">
        {t("guided-review-steps")}
      </Text>
      {reviewSteps.map(([key, labelKey], index) => {
        const active = currentStepIndex === index;
        return (
          <HStack
            key={key}
            aria-current={active ? "step" : undefined}
            borderRadius="rounded"
            bg={active ? "base.light" : "transparent"}
            color={
              index <= currentStepIndex ? "content.primary" : "content.tertiary"
            }
            p={3}
          >
            <Text fontSize="label.sm">{index + 1}.</Text>
            <Text
              fontSize="body.sm"
              fontWeight={active ? "semibold" : "normal"}
            >
              {t(labelKey)}
            </Text>
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
      <Text as="h2" mt={1} fontSize="title.lg" fontWeight="semibold">
        {title}
      </Text>
      <Text mt={2} maxW="640px" fontSize="body.sm" color="content.secondary">
        {description}
      </Text>
    </Box>
  );
}
