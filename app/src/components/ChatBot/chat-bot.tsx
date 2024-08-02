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
} from "react-icons/md";
import { RefObject, useRef } from "react";
import { api, useCreateThreadIdMutation } from "@/services/api";
import { AssistantStream } from "openai/lib/AssistantStream";
// @ts-expect-error - no types for this yet
import { AssistantStreamEvent } from "openai/resources/beta/assistants/assistants";

interface Message {
  role: "user" | "assistant" | "code";
  text: string;
}

// const UserMessage = ({ text }: { text: string }) => {
//   return <div>{text}</div>;
// };

// const AssistantMessage = ({ text }: { text: string }) => {
//   return <div>{text}</div>;
// };

// const Message = ({ role, text }: Message) => {
//   switch (role) {
//     case "user":
//       return <UserMessage text={text} />;
//     case "assistant":
//       return <AssistantMessage text={text} />;
//     case "code":
//     //return <CodeMessage text={text} />;
//     default:
//       return null;
//   }
// };

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
  const [threadId, setThreadId] = useState("");
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [createThreadId, { data: threadIdData }] = useCreateThreadIdMutation();
  const [getAllDataSources, { data, error, isLoading }] =
    api.useLazyGetAllDataSourcesQuery();

  // Automatically scroll to bottom of chat
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // TODO: Convert to Redux
  const sendMessage = async (text: string) => {
    try {
      const response = await fetch(`/api/v0/assistants/threads/messages`, {
        method: "POST",
        body: JSON.stringify({
          threadId: threadId,
          content: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (response.body == null) {
        throw new Error("Response body is null");
      }

      const stream = AssistantStream.fromReadableStream(response.body);
      handleReadableStream(stream);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  ////////////////////
  // Function calls //
  ////////////////////

  const functionCallHandler = async (call: any) => {
    if (call?.function?.name === "get_all_datasources") {
      console.log("function call get data sources");

      const { data, error, isLoading } = await getAllDataSources({
        inventoryId,
      });

      console.log(data);
      return JSON.stringify(data);
    } else if (call?.function?.name === "query_global_api") {
      console.log("function call generic");
      const mockData = "CO2, SF6, SF8, and Methane of doom";
      return mockData; // no stringify needed since its a string already
    } else {
      return JSON.stringify({ status: "no function identified to call" });
    }
  };

  const submitActionResult = async (
    threadId: string,
    runId: string,
    toolCallOutputs: object,
  ) => {
    try {
      const response = await fetch(`/api/v0/assistants/threads/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId: threadId,
          runId: runId,
          toolCallOutputs: toolCallOutputs,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (response.body == null) {
        throw new Error("Response body is null");
      }

      const stream = AssistantStream.fromReadableStream(response.body);
      handleReadableStream(stream);
    } catch (err) {
      console.error("Failed to submit tool output:", err);
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

    const toolCallOutputs = await Promise.all(
      toolCalls.map(async (toolCall: any) => {
        const result = await functionCallHandler(toolCall);

        console.log(result);
        return { output: result, tool_call_id: toolCall.id };
      }),
    );
    console.log(toolCallOutputs);
    setInputDisabled(true);
    submitActionResult(threadId, runId, toolCallOutputs);
  };

  // Here all the streaming events get processed
  const handleReadableStream = (stream: AssistantStream) => {
    // messages
    stream.on("textCreated", handleTextCreated);
    stream.on("textDelta", handleTextDelta);

    // // image
    // stream.on("imageFileDone", handleImageFileDone);

    // // code interpreter
    // stream.on("toolCallCreated", toolCallCreated);
    // stream.on("toolCallDelta", toolCallDelta);

    // events without helpers yet (e.g. requires_action and run.done)
    stream.on("event", (event) => {
      if (event.event === "thread.run.requires_action")
        handleRequiresAction(event);
      if (event.event === "thread.run.completed") handleRunCompleted();
    });
  };

  // Function to create the threadId with initial message
  const createThread = async () => {
    try {
      await createThreadId({
        inventoryId: inventoryId,
        content: t("initial-message"),
      }).unwrap();
    } catch (err) {
      console.error("Failed to create thread ID:", err);
    }
  };

  // Creating the thread id for the given inventory on initial render
  useEffect(() => {
    createThread();
  }, []); // Empty dependency array means this effect runs only once,
  // HOWEVER currently it always runs twice

  // Set threadId once the value from API call is returned to threadData
  useEffect(() => {
    if (threadIdData) {
      setThreadId(threadIdData);
    }
  }, [threadIdData]);

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
  }, []);

  const { copyToClipboard, isCopied } = useCopyToClipboard({});
  const { formRef, onKeyDown } = useEnterSubmit();
  const messagesWrapperRef = useRef<HTMLDivElement>(null);

  const userStyles = "rounded-br-none";
  const botStyles = "rounded-bl-none";
  const suggestions = [
    {
      preview: "What is GPC?",
      message: "What is the GHG Protocol for Cities?",
    },
    {
      preview: "How can I collect data?",
      message: "How can I add new data sources to CityCatalyst?",
    },
    {
      preview: "What is IPCC?",
      message: "What is the Intergovernmental Panel on Climate Change?",
    },
  ];

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

  // TODO: Fix annotations
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
              throw new Error(`HTTP error! status: ${response.status}`);
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
        className="overflow-y-auto max-h-96 space-y-4"
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
                  {m.text}
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
        {/* <ScrollAnchor
          trackVisibility={status === "in_progress"}
          rootRef={messagesWrapperRef}
        /> */}
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
          <IconButton
            type="submit"
            variant="ghost"
            icon={<MdOutlineSend size={24} />}
            color="content.tertiary"
            aria-label="Send message"
            isDisabled={inputDisabled}
          />
        </HStack>
      </form>
    </div>
  );
}
