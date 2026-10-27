"use client";

import { useRef, useState } from "react";
import { chakra, Flex, Icon, Input, Text, VStack } from "@chakra-ui/react";
import { LuArrowRight, LuCheck } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";

/** Suggested and custom replies stay inside the message that asked the question. */
export function ChatChoices({
  choices,
  disabled,
  answered,
  lng,
  onReply,
}: {
  choices: string[];
  disabled: boolean;
  answered: boolean;
  lng: string;
  onReply: (answer: string) => Promise<void>;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [sending, setSending] = useState(false);
  const submitting = useRef(false);
  const locked = disabled || answered || sending;
  const answer = custom.trim();

  async function submit(reply: string) {
    if (locked || !reply || submitting.current) return;
    submitting.current = true;
    setSending(true);
    try {
      await onReply(reply);
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  return (
    <VStack
      align="stretch"
      gap={1}
      mt={3}
      data-testid="concept-note-chat-choices"
    >
      <VStack
        align="stretch"
        gap={0}
        role="group"
        aria-label={t("chat-choices-label")}
      >
        {choices.map((choice, index) => (
          <chakra.button
            key={choice}
            type="button"
            disabled={locked}
            aria-pressed={selected === choice}
            onClick={() => {
              setSelected(choice);
              void submit(choice);
            }}
            display="flex"
            alignItems="center"
            gap={2.5}
            minH="42px"
            py={1}
            pr={2}
            textAlign="left"
            fontSize="body.sm"
            bg={selected === choice ? "content.link/6" : "transparent"}
            border={0}
            color={selected === choice ? "content.link" : "content.primary"}
            fontWeight={selected === choice ? "semibold" : "normal"}
            cursor={locked ? "default" : "pointer"}
            borderRadius="sm"
            _hover={
              locked ? {} : { color: "content.link", bg: "content.link/6" }
            }
            _focusVisible={{
              outline: "2px solid",
              outlineColor: "content.link",
              outlineOffset: "2px",
            }}
          >
            <Text
              as="span"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
              boxSize="24px"
              borderRadius="sm"
              bg={selected === choice ? "content.link/12" : "content.link/8"}
              fontSize="body.sm"
              fontWeight="medium"
              aria-hidden="true"
            >
              {String.fromCharCode(65 + index)}
            </Text>
            <Text as="span" overflowWrap="anywhere">
              {choice}
            </Text>
            {selected === choice && (
              <Icon as={LuCheck} boxSize={3.5} flexShrink={0} />
            )}
          </chakra.button>
        ))}
      </VStack>
      {!answered && (
        <>
          <Text fontSize="body.sm" mt={2}>
            {t("chat-choices-or")}
          </Text>
          <Flex gap={2} align="center">
            <Input
              unstyled
              aria-label={t("chat-choices-custom")}
              placeholder={t("chat-choices-custom")}
              value={custom}
              disabled={locked}
              onFocus={() => setSelected(null)}
              onChange={(event) => {
                setCustom(event.target.value);
                setSelected(null);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void submit(answer);
                }
              }}
              border={0}
              borderRadius="sm"
              bg="transparent"
              px={0}
              py={1}
              minH="36px"
              fontSize="body.sm"
              flex={1}
              minW={0}
              _focusVisible={{
                outline: "2px solid",
                outlineColor: "content.link",
                outlineOffset: "2px",
              }}
            />
            <chakra.button
              type="button"
              aria-label={t("chat-choices-send")}
              disabled={locked || !answer}
              onClick={() => void submit(answer)}
              minW="40px"
              minH="40px"
              color="content.link"
              bg="transparent"
              display="flex"
              alignItems="center"
              justifyContent="center"
              borderRadius="sm"
              _disabled={{ opacity: 0.4 }}
              _focusVisible={{
                outline: "2px solid",
                outlineColor: "content.link",
              }}
            >
              <Icon as={LuArrowRight} boxSize={5} />
            </chakra.button>
          </Flex>
        </>
      )}
    </VStack>
  );
}
