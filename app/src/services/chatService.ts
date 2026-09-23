export interface ChatServiceConfig {
  inventoryId?: string;
  onError: (error: unknown, errorMessage: string) => void;
}

/**
 * Climate Advisor chat client.
 * Always uses `/api/v1/chat/*` — the legacy OpenAI Assistants path is removed.
 */
export class ChatService {
  private config: ChatServiceConfig;

  constructor(config: ChatServiceConfig) {
    this.config = config;
  }

  async initializeThread(
    createChatThread: (data: {
      inventory_id?: string;
      title?: string;
    }) => Promise<{ threadId: string }>,
    t: (key: string) => string,
  ): Promise<string> {
    try {
      const result = await createChatThread({
        inventory_id: this.config.inventoryId,
        title: t("chat-title") || "Climate Chat",
      });
      return result.threadId;
    } catch (error) {
      this.config.onError(
        error,
        "Failed to initialize thread. Please try again to send a message.",
      );
      throw error;
    }
  }
}
