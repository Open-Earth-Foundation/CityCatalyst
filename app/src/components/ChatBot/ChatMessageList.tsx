import React from "react";
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

interface ChatMessageListProps {
  messages: Message[];
}

export function ChatMessageList({ messages }: ChatMessageListProps) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({});

  return (
    <Box overflowY="auto" maxH="35vh" spaceY={4}>
      {messages.map((m, i) => {
        const isUser = m.role === "user";
        return (
          <HStack key={i} align="top" asChild>
            <Box>
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
              <Spacer />
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
            </Box>
          </HStack>
        );
      })}
    </Box>
  );
}