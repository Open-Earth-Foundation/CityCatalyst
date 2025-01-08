"use client";

import React, { useEffect, useState } from "react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
  Box,
  Button,
  Divider,
  HStack,
  Icon,
  IconButton,
  Spacer,
  Text,
  Textarea,
  useToast,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { BsStars } from "react-icons/bs";
import {
  MdCheckCircle,
  MdContentCopy,
  MdOutlineSend,
  MdOutlineThumbDown,
  MdOutlineThumbUp,
  MdRefresh,
  MdStop,
} from "react-icons/md";
import { RefObject, useRef } from "react";
import { api, useCreateThreadIdMutation } from "@/services/api";
import { AssistantStream } from "openai/lib/AssistantStream";
// @ts-expect-error - no types for this yet
import { AssistantStreamEvent } from "openai/resources/beta/assistants/assistants";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
interface Message {
  role: "user" | "assistant" | "code";
  text: string;
}

const SUGGESTION_KEYS = ["gpc", "collect-data", "ipcc"];

function useEnterSubmit(): {
  formRef: RefObject<HTMLFormElement>;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
} {
  const formRef = useRef<HTMLFormElement>(null);
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      formRef.current?.requestSubmit();
      event.preventDefault();
    }
  };

  return { formRef, onKeyDown: handleKeyDown };
}

export default function ChatBot({
  inputRef,
  t,
  inventoryId,
}: {
  userName?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  t: TFunction;
  inventoryId: string;
}) {
  const threadIdRef = useRef("");
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [createThreadId] = useCreateThreadIdMutation();
  const [getAllDataSources] = api.useLazyGetAllDataSourcesQuery();
  const [getUserInventories] = api.useLazyGetUserInventoriesQuery();
  const [getInventory] = api.useLazyGetInventoryQuery();
  const toast = useToast();

  // AbortController reference
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isGenerating, setIsGenerating] = useState(false); // Track generation state

  const handleError = (error: any, errorMessage: string) => {
    // Display error to user
    toast({
      title: "An error occurred",
      description: errorMessage,
      status: "error",
      duration: 5000,
      isClosable: true,
    });
  };

  // Automatically scroll to bottom of chat
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeThread = async () => {
    try {
      // Create the thread ID via an API call
      const result = await createThreadId({
        inventoryId: inventoryId,
        content: t("initial-message"),
      }).unwrap();

      // Set the threadIdRef synchronously
      threadIdRef.current = result;

      // Attempt to save threadId in the database asynchronously
      fetch(`/api/v0/assistants/threads/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: threadIdRef.current,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to save thread to the database.");
          }
          return response.json();
        })
        .catch((error) => {
          handleError(
            error,
            "Thread initialized, but saving thread ID to the database failed. Please check later.",
          );
        });
    } catch (error) {
      // Handle errors related to thread initialization
      handleError(
        error,
        "Failed to initialize thread. Please try again to send a message.",
      );
    }
  };

  // TODO: Convert to Redux #ON-2137
  const sendMessage = async (text: string) => {
    // If no thread Id is set, create a thread.
    if (!threadIdRef.current) {
      await initializeThread();
    }

    // Abort previous request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController(); // New abort controller for current request
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`/api/v0/assistants/threads/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: threadIdRef.current,
          content: text,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const data = await response.text();
        console.error("HTTP response text", data);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (response.body == null) {
        console.error("HTTP response is null");
        throw new Error("HTTP response is null");
      }

      const stream = AssistantStream.fromReadableStream(response.body);
      handleReadableStream(stream);
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("Request was aborted");
      } else {
        handleError(error, "Failed to send message. Please try again.");
      }
      setInputDisabled(false);
    }
  };

  ////////////////////
  // Function calls //
  ////////////////////

  const functionCallHandler = async (call: any) => {
    try {
      // Handle function get all data sources
      if (call?.function?.name === "get_all_datasources") {
        const { data, error } = await getAllDataSources({
          inventoryId,
        });
        if (error) throw error;
        return JSON.stringify(data);

        // Handle function to get all user inventories
      } else if (call?.function?.name === "get_user_inventories") {
        const { data, error } = await getUserInventories();
        if (error) throw error;
        return JSON.stringify(data);

        // Handle function to get details of specific inventory
      } else if (call?.function?.name === "get_inventory") {
        // Parse the nested JSON string in the "arguments" field
        const argument = JSON.parse(call.function.arguments);
        const selectedInventoryId = argument.inventory_id;
        const { data, error } = await getInventory(selectedInventoryId);
        if (error) throw error;
        return JSON.stringify(data);
      }
      // Handle if no function call was identified
      else {
        throw new Error("No function identified to call");
      }
    } catch (error) {
      handleError(error, `Error in function call: ${call?.function?.name}`);
      return JSON.stringify({
        error: { error: error, message: "Error in function call" },
      });
    }
  };

  const submitActionResult = async (runId: string, toolCallOutputs: object) => {
    try {
      const response = await fetch(`/api/v0/assistants/threads/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId: threadIdRef.current,
          runId: runId,
          toolCallOutputs: toolCallOutputs,
        }),
      });

      if (!response.ok) {
        const data = await response.text();
        console.error("HTTP response text", data);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (response.body == null) {
        console.error("HTTP response is null");
        throw new Error("HTTP response is null");
      }

      const stream = AssistantStream.fromReadableStream(response.body);
      handleReadableStream(stream);
      console.log("Tool output submitted successfully");
    } catch (error: any) {
      if (
        error.name === "AbortError" ||
        error.name === "Request was aborted."
      ) {
        console.log("Fetch aborted by the user");
      } else {
        handleError(error, "Failed to submit tool output. Please try again.");
      }
    } finally {
      setInputDisabled(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    sendMessage(userInput);
    setMessages((prevMessages) => [
      ...prevMessages,
      { role: "user", text: userInput },
    ]);
    setUserInput("");
    setInputDisabled(true);
    scrollToBottom();
  };

  const handleSuggestionClick = (message: string) => {
    sendMessage(message);
    setMessages((prevMessages) => [
      ...prevMessages,
      { role: "user", text: message },
    ]);
    setInputDisabled(true);
  };

  ////////////////////////////
  // Stream Event Handlers //
  ///////////////////////////

  // Create new assistant message
  const handleTextCreated = () => {
    appendMessage("assistant", "");
    setIsGenerating(true);
  };

  // Append text to last assistant message
  const handleTextDelta = (delta: any) => {
    if (delta.value != null) {
      appendToLastMessage(delta.value);
    }
    // TODO: Currently not working properly
    // if (delta.annotations != null) {
    //   annotateLastMessage(delta.annotations);
    // }
  };

  // Re-enable the input form
  const handleRunCompleted = () => {
    setInputDisabled(false);
  };

  const handleRequiresAction = async (
    event: AssistantStreamEvent.ThreadRunRequiresAction,
  ) => {
    const runId = event.data.id;
    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;

    const timeoutDuration = 60000; // Adjust the timeout duration as needed

    const createFallbackOutputs = (toolCalls: any) => {
      return toolCalls.map((toolCall: any) => ({
        output: "Timeout: No response received",
        tool_call_id: toolCall.id,
      }));
    };

    let timeoutId: NodeJS.Timeout | null = null;

    // Create a timeout promise that resolves with a fallback object
    const timeoutPromise = new Promise(
      (resolve) =>
        (timeoutId = setTimeout(() => {
          handleError(
            "timeout",
            "Request has timed out. No input from tool calls received. Please try again.",
          );
          resolve(createFallbackOutputs(toolCalls));
        }, timeoutDuration)),
    );

    const toolCallOutputs = await Promise.race([
      Promise.all(
        toolCalls.map(async (toolCall: any) => {
          const result = await functionCallHandler(toolCall);
          return { output: result, tool_call_id: toolCall.id };
        }),
      ).then((results) => {
        // Clear the timeout if the tool calls finish first
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        return results;
      }),
      timeoutPromise,
    ]);

    submitActionResult(runId, toolCallOutputs);
  };

  // Here all the streaming events get processed
  const handleReadableStream = (stream: AssistantStream) => {
    // Messages
    try {
      stream.on("textCreated", handleTextCreated);
      stream.on("textDelta", handleTextDelta);

      // Events without helpers yet (e.g. requires_action and run.done)
      stream.on("event", (event) => {
        if (event.event === "thread.run.requires_action")
          handleRequiresAction(event);
        if (event.event === "thread.run.completed") handleRunCompleted();
      });
    } catch (error: any) {
      if (
        error.name === "APIUserAbortError" ||
        error.message === "Request was aborted."
      ) {
        console.log("Stream processing was aborted.");
      } else {
        console.error("An error occurred while processing the stream:", error);
      }
    }
  };

  // Setting the initial message to display for the user
  // This message will not be passed to the assistant api
  // It will be set additionally when creating the threadId
  // to pass to the assistant api
  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        text: t("initial-message"),
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false); // Reset generation state when stopped
      setInputDisabled(false);
    }
  };

  const { copyToClipboard, isCopied } = useCopyToClipboard({});
  const { formRef, onKeyDown } = useEnterSubmit();
  const messagesWrapperRef = useRef<HTMLDivElement>(null);

  const userStyles = "rounded-br-none";
  const botStyles = "rounded-bl-none";
  const suggestions = SUGGESTION_KEYS.map((name) => {
    return {
      preview: t(`chat-suggestion-${name}`),
      message: t(`chat-suggestion-${name}-message`),
    };
  });
  /////////////////////
  // Utility Helpers //
  /////////////////////

  const appendMessage = (role: Message["role"], text: string) => {
    setMessages((prevMessages) => [...prevMessages, { role, text }]);
  };

  const appendToLastMessage = (text: string) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      const updatedLastMessage = {
        ...lastMessage,
        text: lastMessage.text + text,
      };
      return [...prevMessages.slice(0, -1), updatedLastMessage];
    });
  };

  // TODO: Fix annotations ON-2114
  const annotateLastMessage = async (annotations: any) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      const updatedLastMessage = {
        ...lastMessage,
      };
      annotations.forEach(async (annotation: any) => {
        if (annotation.type === "file_citation") {
          const fileId = annotation.file_citation.file_id;

          try {
            const response = await fetch(`/api/v0/assistants/files/${fileId}`, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            });
            if (!response.ok) {
              const data = await response.text();
              console.error("HTTP response text", data);
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            if (response.body == null) {
              console.error("HTTP response is null");
              throw new Error("HTTP response is null");
            }

            const data = await response.json();

            updatedLastMessage.text = updatedLastMessage.text.replaceAll(
              annotation.text,
              `【${data.file.filename}】`,
            );
          } catch (error) {
            console.error("Error fetching file:", error);
          }
        }
      });
      return [...prevMessages.slice(0, -1), updatedLastMessage];
    });
  };

  return (
    <div className="flex flex-col w-full stretch">
      <div
        className="overflow-y-auto max-h-[35vh] space-y-4"
        ref={messagesWrapperRef}
      >
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <HStack key={i} align="top">
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
                className={`rounded-2xl border-r-t px-6 py-4 ${isUser ? userStyles : botStyles}`}
                bg={isUser ? "content.link" : "base.light"}
              >
                <Text
                  className="whitespace-pre-wrap"
                  color={isUser ? "base.light" : "content.tertiary"}
                  letterSpacing="0.5px"
                  lineHeight="24px"
                  fontSize="16px"
                >
                  <ReactMarkdown rehypePlugins={[remarkGfm]}>
                    {m.text}
                  </ReactMarkdown>
                </Text>
                {!isUser &&
                  i === messages.length - 1 &&
                  messages.length > 1 && (
                    <>
                      <Divider borderColor="border.overlay" my={3} />
                      <HStack>
                        {/* <IconButton
                          variant="ghost"
                          icon={<Icon as={MdOutlineThumbUp} boxSize={5} />}
                          aria-label="Vote good"
                          color="content.tertiary"
                        />
                        <IconButton
                          variant="ghost"
                          icon={<Icon as={MdOutlineThumbDown} boxSize={5} />}
                          aria-label="Vote bad"
                          color="content.tertiary"
                        /> */}
                        <IconButton
                          onClick={() => copyToClipboard(m.text)}
                          variant="ghost"
                          icon={
                            <Icon
                              as={isCopied ? MdCheckCircle : MdContentCopy}
                              boxSize={5}
                            />
                          }
                          aria-label="Copy text"
                          color={
                            isCopied
                              ? "sentiment.positiveDefault"
                              : "content.tertiary"
                          }
                        />
                        <Spacer />
                        {/* <Button
                          onClick={() => reload()}
                          leftIcon={<Icon as={MdRefresh} boxSize={5} />}
                          variant="outline"
                          textTransform="none"
                          fontFamily="body"
                          color="content.tertiary"
                          borderColor="border.neutral"
                          fontWeight="400"
                          lineHeight="16px"
                          letterSpacing="0.5px"
                        >
                          {t("regenerate")}
                        </Button> */}
                      </HStack>
                    </>
                  )}
              </Box>
            </HStack>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <Divider mt={2} mb={6} borderColor="border.neutral" />

      <div className="overflow-x-auto space-x-2 whitespace-nowrap pb-3">
        {suggestions.map((suggestion, i) => (
          <Button
            key={i}
            onClick={() => {
              handleSuggestionClick(suggestion.message);
            }}
            bg="background.overlay"
            color="content.alternative"
            py={2}
            px={4}
            textTransform="none"
            fontSize="16px"
            fontFamily="body"
            letterSpacing="0.5px"
            lineHeight="24px"
            fontWeight="400"
            whiteSpace="nowrap"
            display="inline-block"
            isDisabled={inputDisabled}
          >
            {suggestion.preview}
          </Button>
        ))}
      </div>

      <form onSubmit={handleSubmit} ref={formRef}>
        <HStack mt={1}>
          {/*<IconButton
            variant="ghost"
            icon={<BsPaperclip size={24} />}
            color="content.tertiary"
            aria-label="Attach file"
          />*/}
          <Textarea
            h="80px"
            ref={inputRef}
            className="flex-grow w-full p-4"
            value={userInput}
            placeholder={t("ask-assistant")}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {inputDisabled ? (
            <IconButton
              onClick={stopGeneration}
              icon={<MdStop />}
              colorScheme="red"
              aria-label={t("stop-generation")}
            />
          ) : (
            <IconButton
              type="submit"
              variant="ghost"
              icon={<MdOutlineSend size={24} />}
              color="content.tertiary"
              aria-label={t("send-message")}
              isDisabled={inputDisabled}
            />
          )}
        </HStack>
      </form>
    </div>
  );
}
