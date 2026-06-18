"use client";

import {
  Box,
  Badge,
  Flex,
  HStack,
  Icon,
  Input,
  Text,
  VStack,
  chakra,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdArrowBack,
  MdArrowForward,
  MdCheckCircle,
  MdChevronLeft,
  MdChevronRight,
  MdExpandMore,
  MdSend,
} from "react-icons/md";

import { HiapContextPanel } from "@/components/HIAPAgentic/HiapContextPanel";
import {
  type HiapRerankDecisionMessage,
  useHiapChat,
} from "@/components/HIAPAgentic/use-hiap-chat";
import { AskAiIcon } from "@/components/icons";
import { useTranslation } from "@/i18n/client";
import ProgressLoader from "@/components/ProgressLoader";
import { api } from "@/services/api";
import { getParamValueRequired } from "@/util/helpers";
import { Button } from "@/components/ui/button";
import {
  CHAT_SURFACE_MAX_W,
  FLOW_BUTTON_RADIUS,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-constants";
import {
  AgentBubble,
  UserBubble,
} from "@/components/StationaryEnergyDraft/stationary-energy-chat-primitives";

const SUGGESTION_KEYS = [
  "chat-suggestion-prioritize",
  "chat-suggestion-compare-evidence",
  "chat-suggestion-check-plan",
];

type HiapChatController = ReturnType<typeof useHiapChat>;

function HiapRerankDecisionCard({
  message,
  t,
}: {
  message: HiapRerankDecisionMessage;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <Box w="full" maxW={CHAT_SURFACE_MAX_W} alignSelf="center">
      <Box
        borderWidth="1px"
        borderColor="border.overlay"
        borderRadius="rounded-xl"
        bg="base.light"
        overflow="hidden"
      >
        <HStack
          align="start"
          gap={3}
          px={4}
          py={3}
          borderLeftWidth="5px"
          borderColor="interactive.tertiary"
        >
          <Box
            flexShrink={0}
            w="32px"
            h="32px"
            display="grid"
            placeItems="center"
            borderRadius="full"
            bg="sentiment.positiveOverlay"
            color="interactive.tertiary"
          >
            <MdCheckCircle size={20} />
          </Box>
          <Box minW={0} flex="1">
            <HStack gap={2} flexWrap="wrap" mb={1}>
              <Text
                fontFamily="heading"
                fontSize="label.md"
                fontWeight="bold"
                color="content.primary"
              >
                {t("chat-rerank-widget-title")}
              </Text>
              <Badge colorPalette="blue">
                {t(`action-type-${message.actionType}`)}
              </Badge>
            </HStack>
            <Text
              color="content.primary"
              fontSize="body.md"
              fontWeight="semibold"
              overflowWrap="anywhere"
            >
              {message.actionName}
            </Text>
          </Box>
        </HStack>

        <HStack
          px={4}
          py={3}
          bg="background.neutral"
          borderTopWidth="1px"
          borderColor="border.overlay"
          justify="space-between"
        >
          <Box>
            <Text
              color="content.tertiary"
              fontSize="label.sm"
              fontWeight="semibold"
              textTransform="uppercase"
            >
              {t("chat-rerank-widget-previous-rank")}
            </Text>
            <Text
              color="content.primary"
              fontFamily="heading"
              fontWeight="bold"
            >
              #{message.previousRank}
            </Text>
          </Box>
          <Icon as={MdArrowForward} color="content.tertiary" boxSize={5} />
          <Box textAlign="right">
            <Text
              color="content.tertiary"
              fontSize="label.sm"
              fontWeight="semibold"
              textTransform="uppercase"
            >
              {t("chat-rerank-widget-new-rank")}
            </Text>
            <Text
              color="interactive.secondary"
              fontFamily="heading"
              fontWeight="bold"
            >
              #{message.newRank}
            </Text>
          </Box>
        </HStack>
      </Box>
    </Box>
  );
}

function HiapChatPanel({
  chat,
  t,
}: {
  chat: HiapChatController;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const shouldFollowChatRef = useRef(true);
  const lastMessage = chat.messages[chat.messages.length - 1];
  const lastMessageText = lastMessage?.text ?? "";
  const lastMessageIsDecisionWidget =
    lastMessage &&
    "kind" in lastMessage &&
    lastMessage.kind === "hiap_rerank_decision";
  const showSuggestions =
    !chat.inputDisabled &&
    !lastMessageIsDecisionWidget &&
    SUGGESTION_KEYS.length > 0;

  const handleChatScroll = useCallback(() => {
    const scrollRegion = scrollRegionRef.current;
    if (!scrollRegion) {
      return;
    }

    const distanceFromBottom =
      scrollRegion.scrollHeight -
      scrollRegion.scrollTop -
      scrollRegion.clientHeight;
    shouldFollowChatRef.current = distanceFromBottom < 140;
  }, []);

  useEffect(() => {
    const scrollRegion = scrollRegionRef.current;
    if (!scrollRegion) {
      return;
    }

    const shouldFollow =
      shouldFollowChatRef.current ||
      chat.isGenerating ||
      lastMessage?.role === "assistant";
    if (!shouldFollow) {
      return;
    }

    const scrollToBottom = () => {
      scrollRegion.scrollTo({
        top: scrollRegion.scrollHeight,
        behavior: chat.isGenerating ? "auto" : "smooth",
      });
    };

    const animationFrame = window.requestAnimationFrame(scrollToBottom);
    const timeout = window.setTimeout(scrollToBottom, 80);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [
    chat.isGenerating,
    chat.messages.length,
    lastMessage?.role,
    lastMessageText,
  ]);

  return (
    <Box
      position="relative"
      bg="transparent"
      overflow="hidden"
      h={{ base: "min(78dvh, 820px)", xl: "full" }}
      maxH={{ base: "78dvh", xl: "none" }}
      minH={0}
      display="flex"
      flexDir="column"
    >
      <VStack
        ref={scrollRegionRef}
        align="center"
        gap={4}
        flex="1"
        minH={0}
        overflowY="auto"
        px={{ base: 3, md: 6 }}
        py={{ base: 4, md: 6 }}
        bg="background.backgroundGreyFlat"
        data-testid="hiap-chat-scroll-region"
        onScroll={handleChatScroll}
      >
        {chat.messages.map((message, index) => {
          if ("kind" in message && message.kind === "hiap_rerank_decision") {
            return (
              <HiapRerankDecisionCard
                key={message.id}
                message={message}
                t={t}
              />
            );
          }

          if (message.role === "user") {
            return <UserBubble key={index} text={message.text} />;
          }

          const isActiveThinkingMessage =
            chat.isGenerating && index === chat.messages.length - 1;
          if (!message.text.trim() && !isActiveThinkingMessage) {
            return null;
          }

          return (
            <AgentBubble
              key={index}
              text={
                message.text ||
                (isActiveThinkingMessage ? t("chat-panel-thinking") : "")
              }
            />
          );
        })}
      </VStack>

      {showSuggestions ? (
        <Box
          position="absolute"
          left={0}
          right={0}
          bottom="52px"
          zIndex={2}
          px={{ base: 3, md: 6 }}
          py={2}
          bg="transparent"
          pointerEvents="none"
        >
          <Box
            w="full"
            maxW={CHAT_SURFACE_MAX_W}
            mx="auto"
            pointerEvents="auto"
          >
            <Flex gap={2} flexWrap="wrap">
              {SUGGESTION_KEYS.map((key) => {
                const label = t(key);
                return (
                  <chakra.button
                    type="button"
                    key={key}
                    onClick={() => chat.askSuggestion(label)}
                    textAlign="left"
                    maxW="100%"
                    px={3}
                    py="6px"
                    borderWidth="1px"
                    borderColor="border.overlay"
                    borderRadius="rounded"
                    bg="rgba(255, 255, 255, 0.72)"
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
                    {label}
                  </chakra.button>
                );
              })}
            </Flex>
          </Box>
        </Box>
      ) : null}

      <Box
        data-testid="hiap-chat-composer"
        px={{ base: 3, md: 6 }}
        py={3}
        bg="background.backgroundGreyFlat"
      >
        <form
          onSubmit={chat.submitChat}
          style={{ width: "100%", maxWidth: "900px", margin: "0 auto" }}
        >
          <HStack gap={2}>
            <Input
              ref={chatInputRef}
              value={chat.chatInput}
              onChange={(event) => chat.setChatInput(event.target.value)}
              placeholder={t("chat-panel-placeholder")}
              borderRadius="rounded"
              bg="background.backgroundGreyFlat"
              borderColor="border.overlay"
              disabled={chat.inputDisabled}
            />
            {chat.isGenerating ? (
              <Button
                variant="outline"
                borderRadius={FLOW_BUTTON_RADIUS}
                onClick={chat.stopChat}
              >
                {t("chat-panel-stop")}
              </Button>
            ) : (
              <Button type="submit" borderRadius={FLOW_BUTTON_RADIUS} px={4}>
                <MdSend />
              </Button>
            )}
          </HStack>
        </form>
      </Box>
    </Box>
  );
}

export function HiapChatPage() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const params = useParams();
  const lng = getParamValueRequired(params.lng);
  const cityId = getParamValueRequired(params.cityId);
  const inventoryId = getParamValueRequired(params.inventory);
  const backHref = `/${lng}/cities/${cityId}/HIAP/${inventoryId}`;
  const { t } = useTranslation(lng, "hiap");
  const [desktopViewportHeight, setDesktopViewportHeight] = useState<
    number | null
  >(null);
  const [contextPanelOpen, setContextPanelOpen] = useState(true);

  const { data: inventory, isLoading: inventoryLoading } =
    api.useGetInventoryQuery(inventoryId, { skip: !inventoryId });
  const { data: city, isLoading: cityLoading } = api.useGetCityQuery(cityId, {
    skip: !cityId,
  });
  const {
    data: hiapData,
    isLoading: hiapLoading,
    refetch: refetchHiapData,
  } = api.useGetCityHIAPDashboardQuery(
    { cityId, inventoryId, lng },
    { skip: !cityId || !inventoryId },
  );

  const chat = useHiapChat({
    cityId,
    inventoryId,
    lng,
    onHiapContextChanged: () => {
      void refetchHiapData();
    },
  });

  useEffect(() => {
    const updateDesktopViewportHeight = () => {
      if (window.innerWidth < 1280) {
        setDesktopViewportHeight(null);
        return;
      }

      const surface = surfaceRef.current;
      if (!surface) {
        return;
      }

      const { top } = surface.getBoundingClientRect();
      setDesktopViewportHeight(Math.max(window.innerHeight - top, 480));
    };

    updateDesktopViewportHeight();
    window.addEventListener("resize", updateDesktopViewportHeight);

    return () => {
      window.removeEventListener("resize", updateDesktopViewportHeight);
    };
  }, []);

  if (inventoryLoading || cityLoading || hiapLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box
      ref={surfaceRef}
      bg="background.neutral"
      position="relative"
      minH={{
        base: "100dvh",
        xl: desktopViewportHeight
          ? `${desktopViewportHeight}px`
          : "calc(100dvh - 88px)",
      }}
      h={{
        base: "auto",
        xl: desktopViewportHeight
          ? `${desktopViewportHeight}px`
          : "calc(100dvh - 88px)",
      }}
      overflow={{ base: "visible", xl: "hidden" }}
    >
      <Flex
        align="center"
        justify="space-between"
        gap={4}
        h="56px"
        px={{ base: 3, md: 6 }}
        bg="base.light"
        borderBottomWidth="1px"
        borderColor="border.neutral"
        flexShrink={0}
      >
        <HStack gap={4} minW={0}>
          <HStack gap={2} minW={0}>
            <Box
              w="28px"
              h="28px"
              display="grid"
              placeItems="center"
              borderRadius="full"
              bg="interactive.tertiary"
              color="base.light"
              flexShrink={0}
            >
              <Icon as={AskAiIcon} h={18} w={18} />
            </Box>
            <Text
              fontFamily="heading"
              fontSize="title.sm"
              fontWeight="semibold"
              color="content.primary"
            >
              {t("hiap-clima-ai")}
            </Text>
          </HStack>
          <chakra.button
            type="button"
            display={{ base: "none", sm: "inline-flex" }}
            alignItems="center"
            gap={2}
            minH="36px"
            px={3}
            borderWidth="1px"
            borderColor="border.overlay"
            borderRadius="rounded"
            bg="base.light"
            color="content.primary"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
          >
            {t("hiap-label")}
            <Icon as={MdExpandMore} boxSize={4} color="content.secondary" />
          </chakra.button>
        </HStack>

        <HStack gap={{ base: 2, md: 4 }} flexShrink={0}>
          <Text
            display={{ base: "none", md: "block" }}
            color="content.secondary"
            fontSize="label.md"
            fontWeight="semibold"
          >
            {t("chat-page-inventory-label", {
              year: inventory?.year ?? "-",
            })}
          </Text>
          <NextLink href={backHref} style={{ textDecoration: "none" }}>
            <Flex
              align="center"
              gap={2}
              w="fit-content"
              color="interactive.secondary"
              _hover={{ color: "interactive.primary" }}
            >
              <Icon as={MdArrowBack} boxSize={5} />
              <Text
                display={{ base: "none", sm: "block" }}
                textTransform="uppercase"
                fontFamily="heading"
                fontSize="button.sm"
                fontWeight="bold"
              >
                {t("back-to-actions")}
              </Text>
            </Flex>
          </NextLink>
        </HStack>
      </Flex>

      <Box
        h={{ base: "auto", xl: "calc(100% - 56px)" }}
        minH={0}
        position="relative"
        overflow={{ base: "visible", xl: "hidden" }}
      >
        <Box
          h={{ base: "auto", xl: "full" }}
          minH={0}
          position="relative"
          overflow={{ base: "visible", xl: "hidden" }}
          display={{ base: "block", xl: "flex" }}
          alignItems="stretch"
        >
          <Box
            h={{ base: "auto", xl: "full" }}
            minH={0}
            minW={0}
            flex={{ base: undefined, xl: "1 1 0%" }}
            overflow={{ base: "visible", xl: "hidden" }}
          >
            <HiapChatPanel chat={chat} t={t} />
          </Box>

          <Box
            display={{ base: "none", xl: "block" }}
            position="relative"
            flex={{
              base: undefined,
              xl: contextPanelOpen ? "0 0 520px" : "0 0 0px",
            }}
            w={{
              base: undefined,
              xl: contextPanelOpen ? "520px" : "0px",
            }}
            h="full"
            minH={0}
            pt={0}
            pb={0}
            pr={0}
            overflow="visible"
            transition="flex-basis 220ms ease, width 220ms ease"
            zIndex={4}
          >
            <Flex
              position="absolute"
              left="-44px"
              top="50%"
              transform="translateY(-50%)"
              flexDir="column"
              align="stretch"
              gap={2}
              zIndex={5}
            >
              <chakra.button
                type="button"
                aria-label={
                  contextPanelOpen
                    ? t("artifact-panel-collapse")
                    : t("artifact-panel-expand")
                }
                display="flex"
                alignItems="center"
                justifyContent="center"
                w="44px"
                h="56px"
                borderWidth="1px"
                borderColor="border.neutral"
                borderRightWidth={0}
                borderLeftRadius="rounded-xl"
                bg="base.light"
                color="content.primary"
                onClick={() => setContextPanelOpen((open) => !open)}
              >
                <Icon
                  as={contextPanelOpen ? MdChevronRight : MdChevronLeft}
                  boxSize={7}
                />
              </chakra.button>
            </Flex>
            <Box
              h="full"
              minH={0}
              pointerEvents={contextPanelOpen ? "auto" : "none"}
              aria-hidden={!contextPanelOpen}
            >
              <HiapContextPanel
                city={city}
                inventory={inventory}
                hiapData={hiapData}
                t={t}
              />
            </Box>
          </Box>

          <Box display={{ base: "block", xl: "none" }} px={3} pb={4}>
            <chakra.button
              type="button"
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              w="full"
              px={4}
              py={3}
              borderWidth="1px"
              borderColor="border.neutral"
              borderRadius="rounded-xl"
              bg="base.light"
              color="content.primary"
              fontFamily="heading"
              fontWeight="semibold"
              onClick={() => setContextPanelOpen((open) => !open)}
            >
              {t("artifact-panel-expand")}
              <Text
                color="interactive.tertiary"
                fontSize="label.md"
                fontWeight="semibold"
              >
                {t("hiap-summary")}
              </Text>
            </chakra.button>
            {contextPanelOpen ? (
              <Box mt={3}>
                <HiapContextPanel
                  city={city}
                  inventory={inventory}
                  hiapData={hiapData}
                  t={t}
                />
              </Box>
            ) : null}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
