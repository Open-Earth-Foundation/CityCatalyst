import React, { useEffect, useRef } from "react";
import {
  Box,
  HStack,
  Icon,
  IconButton,
  Spacer,
} from "@chakra-ui/react";
import { BsStars } from "react-icons/bs";
import { MdCheckCircle, MdContentCopy } from "react-icons/md";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Message } from "@/utils/chatUtils";
import { PulsingAIIcon } from "./PulsingAIIcon";

interface ChatMessageListProps {
  messages: Message[];
  isGenerating?: boolean;
  assistantStartedResponding?: boolean;
}

export function ChatMessageList({ messages, isGenerating, assistantStartedResponding }: ChatMessageListProps) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const showPulsingIcon = isGenerating && !assistantStartedResponding;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  return (
    <Box 
      ref={scrollContainerRef}
      overflowY="auto" 
      maxH="35vh"
      css={{
        scrollBehavior: 'smooth'
      }}
    >
      {messages.map((m, i) => {
        const isUser = m.role === "user";
        const isEmptyAssistantMessage = !isUser && !m.text.trim();
        const shouldShowPulsing = isEmptyAssistantMessage && showPulsingIcon && i === messages.length - 1;
        
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
                  bg="content.alternative"
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
                  bg={isUser ? "content.link" : "base.light"}
                  whiteSpace="pre-wrap"
                  color={isUser ? "base.light" : "content.tertiary"}
                  letterSpacing="0.5px"
                  lineHeight="24px"
                  fontSize="16px"
                >
                <>
                  <ReactMarkdown rehypePlugins={[remarkGfm]}>
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