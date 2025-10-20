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