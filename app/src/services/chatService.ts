import { logger } from "@/services/logger";
import { trackEvent } from "@/lib/analytics";

export interface ChatServiceConfig {
  inventoryId: string;
  onError: (error: any, errorMessage: string) => void;
}

export class ChatService {
  private config: ChatServiceConfig;

  constructor(config: ChatServiceConfig) {
    this.config = config;
  }

  async initializeThread(
    createChatThread: (data: { inventoryId: string; title?: string }) => Promise<{ threadId: string }>,
    t: (key: string) => string
  ): Promise<string> {
    try {
      const result = await createChatThread({
        inventoryId: this.config.inventoryId,
        title: t("chat-title") || "Climate Chat",
      });

      const threadId = result.threadId;

      // Save threadId to database asynchronously
      this.saveThreadToDatabase(threadId);

      return threadId;
    } catch (error) {
      this.config.onError(
        error,
        "Failed to initialize thread. Please try again to send a message."
      );
      throw error;
    }
  }

  private async saveThreadToDatabase(threadId: string): Promise<void> {
    try {
      const response = await fetch(`/api/v1/assistants/threads/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });

      if (!response.ok) {
        throw new Error("Failed to save thread to the database.");
      }
    } catch (error) {
      this.config.onError(
        error,
        "Thread initialized, but saving thread ID to the database failed. Please check later."
      );
    }
  }

  async sendMessage(threadId: string, content: string): Promise<Response> {
    trackEvent("chat_message_sent", {
      inventory_id: this.config.inventoryId,
    });

    const response = await fetch(`/api/v1/chat/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId,
        content,
      }),
    });

    if (!response.ok) {
      const data = await response.text();
      logger.error({ err: data }, "HTTP response text");
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      logger.error("HTTP response is null");
      throw new Error("HTTP response is null");
    }

    return response;
  }
}