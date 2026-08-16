"use client";

import { Box, Flex, HStack, Icon, Input, Text, VStack } from "@chakra-ui/react";
import {
  LuArrowRight,
  LuBot,
  LuCircleAlert,
  LuDatabase,
  LuFilePlus2,
  LuSend,
} from "react-icons/lu";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/client";

interface ConceptNoteChatPanelProps {
  bundleStatus: string | null;
  lng: string;
  onOpenContext: () => void;
}

export function ConceptNoteChatPanel({
  bundleStatus,
  lng,
  onOpenContext,
}: ConceptNoteChatPanelProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const contextReady = bundleStatus === "ready";

  return (
    <VStack
      align="stretch"
      gap={0}
      h={{ base: "auto", xl: "calc(100vh - 184px)" }}
      minH={{ xl: "650px" }}
      overflow="hidden"
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="base.light"
      boxShadow="1dp"
    >
      <Flex
        align="center"
        gap={3}
        borderBottom="1px solid"
        borderColor="border.neutral"
        px={4}
        py={3}
      >
        <Flex
          boxSize="36px"
          align="center"
          justify="center"
          borderRadius="full"
          bg="sentiment.positiveDefault"
          color="base.light"
        >
          <Icon as={LuBot} boxSize={4.5} />
        </Flex>
        <Box flex={1}>
          <Text
            fontFamily="heading"
            fontSize="body.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {t("clima")}
          </Text>
          <Text fontSize="label.sm" color="content.tertiary">
            {t("concept-note-copilot")}
          </Text>
        </Box>
        <HStack gap={1.5} color="sentiment.warningDefault">
          <Box
            boxSize="7px"
            borderRadius="full"
            bg="sentiment.warningDefault"
          />
          <Text fontSize="label.sm">{t("not-connected")}</Text>
        </HStack>
      </Flex>

      <VStack
        align="stretch"
        gap={4}
        flex={1}
        overflowY={{ xl: "auto" }}
        bg="background.alternativeLight"
        p={4}
      >
        <Box
          alignSelf="start"
          maxW="92%"
          border="1px solid"
          borderColor="border.neutral"
          borderRadius="rounded"
          borderTopLeftRadius="minimal"
          bg="base.light"
          p={4}
          boxShadow="1dp"
        >
          <Text fontSize="body.sm" lineHeight="24px" color="content.secondary">
            {contextReady
              ? t("clima-context-ready-message")
              : t("clima-welcome-message")}
          </Text>
        </Box>

        <VStack
          align="stretch"
          gap={3}
          border="1px solid"
          borderColor={
            contextReady
              ? "sentiment.positiveDefault"
              : "sentiment.warningDefault"
          }
          borderRadius="rounded"
          bg={
            contextReady
              ? "sentiment.positiveOverlay"
              : "sentiment.warningOverlay"
          }
          p={4}
        >
          <HStack align="start" gap={2.5}>
            <Icon
              as={contextReady ? LuDatabase : LuCircleAlert}
              mt={0.5}
              color={
                contextReady
                  ? "sentiment.positiveDefault"
                  : "sentiment.warningDefault"
              }
            />
            <Box flex={1}>
              <Text
                fontFamily="heading"
                fontSize="body.sm"
                fontWeight="semibold"
                color="content.primary"
              >
                {contextReady ? t("context-is-ready") : t("setup-gap-title")}
              </Text>
              <Text
                mt={1}
                fontSize="label.sm"
                lineHeight="20px"
                color="content.secondary"
              >
                {contextReady
                  ? t("context-ready-description")
                  : t("setup-gap-description")}
              </Text>
            </Box>
          </HStack>
          <Button
            size="xs"
            variant="outline"
            alignSelf="start"
            onClick={onOpenContext}
          >
            <Icon as={contextReady ? LuArrowRight : LuFilePlus2} />
            {contextReady ? t("review-context") : t("add-source-pdf")}
          </Button>
        </VStack>

        <Box>
          <Text
            mb={2}
            fontFamily="heading"
            fontSize="overline"
            fontWeight="semibold"
            color="content.tertiary"
            textTransform="uppercase"
          >
            {t("suggested-next-steps")}
          </Text>
          <VStack align="stretch" gap={2}>
            {[
              "quick-add-source",
              "quick-review-context",
              "quick-choose-funder",
            ].map((key) => (
              <Button
                key={key}
                size="xs"
                variant="outline"
                justifyContent="start"
                onClick={onOpenContext}
              >
                {t(key)}
              </Button>
            ))}
          </VStack>
        </Box>
      </VStack>

      <Box borderTop="1px solid" borderColor="border.neutral" p={3}>
        <HStack gap={2}>
          <Input
            disabled
            placeholder={t("chat-coming-soon")}
            bg="background.neutral"
            borderColor="border.neutral"
          />
          <Button
            disabled
            size="sm"
            variant="solid"
            aria-label={t("send-message")}
          >
            <Icon as={LuSend} />
          </Button>
        </HStack>
        <Text mt={2} fontSize="label.sm" color="content.tertiary">
          {t("chat-backend-note")}
        </Text>
      </Box>
    </VStack>
  );
}
