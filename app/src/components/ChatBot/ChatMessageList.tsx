import React, { useEffect, useRef } from "react";
import { Box, HStack, Icon, IconButton, Spacer } from "@chakra-ui/react";
import { BsStars } from "react-icons/bs";
import { MdCheckCircle, MdContentCopy } from "react-icons/md";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createChatMarkdownComponents } from "@/components/shared/chat-markdown-components";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Message } from "@/utils/chatUtils";
import { PulsingAIIcon } from "./PulsingAIIcon";

const markdownComponents = createChatMarkdownComponents({
  paragraph: {
    fontSize: "16px",
    lineHeight: "24px",
    color: "inherit",
  },
  h1: {
    fontSize: "xl",
    lineHeight: "1.4",
    color: "inherit",
  },
  h2: {
    fontSize: "lg",
    lineHeight: "1.4",
    color: "inherit",
  },
  h3: {
    fontSize: "md",
    lineHeight: "1.4",
    color: "inherit",
  },
  list: {
    lineHeight: "24px",
    color: "inherit",
  },
  inlineColor: "inherit",
  code: {
    bg: "blackAlpha.100",
    fontSize: "sm",
    color: "inherit",
  },
  pre: {
    bg: "blackAlpha.100",
    borderRadius: "md",
    fontSize: "sm",
  },
  table: {
    fontSize: "sm",
    headBg: "blackAlpha.100",
    color: "inherit",
  },
  borderColor: "border.overlay",
});

interface ChatMessageListProps {
  messages: Message[];
  isGenerating?: boolean;
  assistantStartedResponding?: boolean;
}

export function ChatMessageList({
  messages,
  isGenerating,
  assistantStartedResponding,
}: ChatMessageListProps) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const showPulsingIcon = isGenerating && !assistantStartedResponding;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  return (
    <Box
      ref={scrollContainerRef}
      overflowY="auto"
      flex="1"
      minH={0}
      css={{
        scrollBehavior: "smooth",
      }}
    >
      {messages.map((m, i) => {
        const isUser = m.role === "user";
        const isEmptyAssistantMessage = !isUser && !m.text.trim();
        const shouldShowPulsing =
          isEmptyAssistantMessage &&
          showPulsingIcon &&
          i === messages.length - 1;

        return (
          <Box key={i} mb={4}>
            <HStack align="top" asChild>
              <Box>
                {shouldShowPulsing ? (
                  <PulsingAIIcon />
                ) : (
                  <Box
                    w={9}
                    h={9}
                    p={2}
                    borderRadius="full"
                    bg="interactive.tertiary"
                    visibility={isUser ? "hidden" : "visible"}
                  >
                    <Icon as={BsStars} boxSize={5} color="base.light" />
                  </Box>
                )}
                {/* Push the bubble right only for user messages; assistant
                    bubbles stay left next to the avatar. */}
                {isUser && <Spacer />}
                {!shouldShowPulsing && (
                  <Box
                    borderTopLeftRadius={isUser ? "2xl" : "0"}
                    borderBottomLeftRadius={isUser ? "2xl" : "0"}
                    borderTopRightRadius={isUser ? "0" : "2xl"}
                    borderBottomRightRadius={isUser ? "0" : "2xl"}
                    borderTopRadius="2xl"
                    px={6}
                    py={4}
                    bg={isUser ? "interactive.tertiary" : "base.light"}
                    whiteSpace={isUser ? "pre-wrap" : undefined}
                    color={isUser ? "base.light" : "content.tertiary"}
                    letterSpacing="0.5px"
                    lineHeight="24px"
                    fontSize="16px"
                    borderWidth="1px"
                    borderColor="border.overlay"
                  >
                    <>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={isUser ? undefined : markdownComponents}
                      >
                        {m.text}
                      </ReactMarkdown>
                      {!isUser &&
                        i === messages.length - 1 &&
                        messages.length > 1 && (
                          <>
                            <Box
                              divideX="2px"
                              borderColor="border.overlay"
                              my={3}
                            />
                            <HStack asChild>
                              <IconButton
                                onClick={() => copyToClipboard(m.text)}
                                variant="ghost"
                                aria-label="Copy text"
                                color={
                                  isCopied
                                    ? "sentiment.positiveDefault"
                                    : "content.tertiary"
                                }
                              >
                                <Icon
                                  as={isCopied ? MdCheckCircle : MdContentCopy}
                                  boxSize={5}
                                />
                              </IconButton>
                            </HStack>
                          </>
                        )}
                    </>
                  </Box>
                )}
                {/* Fill remaining space to the right of an assistant bubble. */}
                {!isUser && !shouldShowPulsing && <Spacer />}
              </Box>
            </HStack>
          </Box>
        );
      })}
    </Box>
  );
}
