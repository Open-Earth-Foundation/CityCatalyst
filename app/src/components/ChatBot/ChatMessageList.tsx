import React, { useEffect, useRef } from "react";
import { Box, HStack, Icon, IconButton, Spacer, Text } from "@chakra-ui/react";
import { BsStars } from "react-icons/bs";
import { MdCheckCircle, MdContentCopy } from "react-icons/md";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Message } from "@/utils/chatUtils";
import { PulsingAIIcon } from "./PulsingAIIcon";

const markdownComponents: Components = {
  p: ({ children }) => (
    <Text
      mb={3}
      lineHeight="24px"
      fontSize="16px"
      color="inherit"
      _last={{ mb: 0 }}
    >
      {children}
    </Text>
  ),
  h1: ({ children }) => (
    <Text
      as="h1"
      fontWeight="bold"
      fontSize="xl"
      mb={3}
      mt={2}
      lineHeight="1.4"
      color="inherit"
    >
      {children}
    </Text>
  ),
  h2: ({ children }) => (
    <Text
      as="h2"
      fontWeight="bold"
      fontSize="lg"
      mb={3}
      mt={2}
      lineHeight="1.4"
      color="inherit"
    >
      {children}
    </Text>
  ),
  h3: ({ children }) => (
    <Text
      as="h3"
      fontWeight="semibold"
      fontSize="md"
      mb={2}
      mt={2}
      lineHeight="1.4"
      color="inherit"
    >
      {children}
    </Text>
  ),
  ul: ({ children }) => (
    <Box as="ul" pl={5} mb={3} color="inherit" css={{ listStyleType: "disc" }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box
      as="ol"
      pl={5}
      mb={3}
      color="inherit"
      css={{ listStyleType: "decimal" }}
    >
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Box as="li" lineHeight="24px" mb={1} color="inherit">
      {children}
    </Box>
  ),
  strong: ({ children }) => (
    <Text as="strong" fontWeight="bold" display="inline" color="inherit">
      {children}
    </Text>
  ),
  em: ({ children }) => (
    <Text as="em" fontStyle="italic" display="inline" color="inherit">
      {children}
    </Text>
  ),
  code: ({ children }) => (
    <Text
      as="code"
      fontFamily="mono"
      bg="blackAlpha.100"
      px={1}
      borderRadius="sm"
      fontSize="sm"
      color="inherit"
    >
      {children}
    </Text>
  ),
  pre: ({ children }) => (
    <Box
      as="pre"
      bg="blackAlpha.100"
      p={3}
      borderRadius="md"
      mb={3}
      overflowX="auto"
      fontSize="sm"
    >
      {children}
    </Box>
  ),
  table: ({ children }) => (
    <Box overflowX="auto" mb={3}>
      <Box
        as="table"
        w="full"
        fontSize="sm"
        css={{ borderCollapse: "collapse" }}
        color="inherit"
      >
        {children}
      </Box>
    </Box>
  ),
  thead: ({ children }) => (
    <Box as="thead" bg="blackAlpha.100">
      {children}
    </Box>
  ),
  tbody: ({ children }) => <Box as="tbody">{children}</Box>,
  tr: ({ children }) => (
    <Box
      as="tr"
      css={{ borderBottom: "1px solid" }}
      borderColor="border.overlay"
    >
      {children}
    </Box>
  ),
  th: ({ children }) => (
    <Box
      as="th"
      px={3}
      py={2}
      fontWeight="semibold"
      textAlign="left"
      color="inherit"
      css={{ border: "1px solid" }}
      borderColor="border.overlay"
    >
      {children}
    </Box>
  ),
  td: ({ children }) => (
    <Box
      as="td"
      px={3}
      py={2}
      color="inherit"
      css={{ border: "1px solid" }}
      borderColor="border.overlay"
    >
      {children}
    </Box>
  ),
};

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
      maxH="35vh"
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
                <Spacer />
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
              </Box>
            </HStack>
          </Box>
        );
      })}
    </Box>
  );
}
