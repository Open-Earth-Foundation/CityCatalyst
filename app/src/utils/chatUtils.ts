export interface Message {
  role: "user" | "assistant" | "code";
  text: string;
}

export const appendMessage = (
  messages: Message[],
  role: Message["role"],
  text: string
): Message[] => {
  return [...messages, { role, text }];
};

export const appendToLastMessage = (
  messages: Message[],
  text: string
): Message[] => {
  if (messages.length === 0) return messages;
  
  const lastMessage = messages[messages.length - 1];
  const updatedLastMessage = {
    ...lastMessage,
    text: lastMessage.text + text,
  };
  
  return [...messages.slice(0, -1), updatedLastMessage];
};

export const removeLastMessage = (messages: Message[]): Message[] => {
  if (messages.length === 0) return messages;
  return messages.slice(0, -1);
};

export const removeLastEmptyAssistantMessage = (messages: Message[]): Message[] => {
  if (messages.length === 0) return messages;
  
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role === "assistant" && lastMessage.text.trim() === "") {
    return messages.slice(0, -1);
  }
  
  return messages;
};

export const createInitialMessage = (t: (key: string) => string): Message => ({
  role: "assistant",
  text: t("initial-message"),
});

export const SUGGESTION_KEYS = ["gpc", "collect-data", "ipcc"];

export const createSuggestions = (t: (key: string) => string) => {
  return SUGGESTION_KEYS.map((name) => ({
    preview: t(`chat-suggestion-${name}`),
    message: t(`chat-suggestion-${name}-message`),
  }));
};