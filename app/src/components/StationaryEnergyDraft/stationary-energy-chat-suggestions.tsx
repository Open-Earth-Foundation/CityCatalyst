"use client";

import type {
  DecisionReviewContext,
  DraftStage,
} from "@/components/StationaryEnergyDraft/flow";
import { Box, Flex, chakra } from "@chakra-ui/react";
import type { TFunction } from "i18next";

type SuggestedQuestion = { id: string; label: string; message: string };

function buildSuggestedQuestions(
  t: TFunction,
  stage: DraftStage,
  focused: DecisionReviewContext | null,
): SuggestedQuestion[] {
  const plain = (key: string): SuggestedQuestion => {
    const text = t(key);
    return { id: key, label: text, message: text };
  };

  if (stage === "start") {
    return [
      plain("chat-suggestion-start-sources"),
      plain("chat-suggestion-start-missing"),
      plain("chat-suggestion-start-method"),
    ];
  }

  if (stage === "drafting") {
    return [
      plain("chat-suggestion-drafting-progress"),
      plain("chat-suggestion-drafting-sources"),
    ];
  }

  if (stage === "decision") {
    if (focused) {
      const label = focused.label;
      const questions: SuggestedQuestion[] = [
        {
          id: "focused-why",
          label: t("chat-suggestion-decision-focused-why-short"),
          message: t("chat-suggestion-decision-focused-why", { label }),
        },
      ];
      if (focused.kind === "multi_source") {
        questions.push({
          id: "focused-diff",
          label: t("chat-suggestion-decision-focused-diff-short"),
          message: t("chat-suggestion-decision-focused-diff", { label }),
        });
      }
      questions.push({
        id: "focused-empty",
        label: t("chat-suggestion-decision-focused-empty-short"),
        message: t("chat-suggestion-decision-focused-empty", { label }),
      });
      return questions;
    }
    return [
      plain("chat-suggestion-decision-remaining"),
      plain("chat-suggestion-decision-gaps"),
      plain("chat-suggestion-decision-notation"),
    ];
  }

  return [
    plain("chat-suggestion-review-check"),
    plain("chat-suggestion-review-gaps"),
    plain("chat-suggestion-review-notation"),
  ];
}

export function StationaryEnergySuggestedQuestions(props: {
  t: TFunction;
  stage: DraftStage;
  focused: DecisionReviewContext | null;
  onAsk: (message: string) => void;
}) {
  const questions = buildSuggestedQuestions(
    props.t,
    props.stage,
    props.focused,
  );
  if (questions.length === 0) {
    return null;
  }
  return (
    <Box
      w="full"
      px={{ base: 3, md: 6 }}
      pt={2}
      bg="background.backgroundGreyFlat"
    >
      <Box w="full" maxW="900px" mx="auto">
        <Flex gap={2} flexWrap="wrap">
          {questions.map((question) => (
            <chakra.button
              type="button"
              key={question.id}
              onClick={() => props.onAsk(question.message)}
              textAlign="left"
              maxW="100%"
              px={3}
              py="6px"
              borderWidth="1px"
              borderColor="border.overlay"
              borderRadius="rounded"
              bg="background.transparentGrey"
              color="content.secondary"
              fontSize="label.md"
              lineHeight="18px"
              lineClamp={2}
              whiteSpace="normal"
              wordBreak="break-word"
              appearance="none"
              cursor="pointer"
              transition="background 140ms ease, border-color 140ms ease"
              _hover={{
                bg: "background.neutral",
                borderColor: "interactive.primary",
                color: "interactive.primary",
              }}
            >
              {question.label}
            </chakra.button>
          ))}
        </Flex>
      </Box>
    </Box>
  );
}
