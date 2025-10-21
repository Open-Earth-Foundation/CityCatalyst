import { logger } from "@/services/logger";
import { trackEvent } from "@/lib/analytics";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

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
    createChatThread: (data: {
      inventory_id?: string;
      title?: string;
    }) => Promise<{ threadId: string }>,
    createLegacyThread: (data: {
      inventoryId: string;
      content: string;
    }) => Promise<string>,
    t: (key: string) => string,
  ): Promise<string> {
    try {
      // Use feature flag to determine thread creation method
      if (hasFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION)) {
        const result = await createChatThread({
          inventory_id: this.config.inventoryId,
          title: t("chat-title") || "Climate Chat",
        });
        const threadId = result.threadId;
        this.saveThreadToDatabase(threadId);
        return threadId;
      } else {
        // Legacy thread creation for old implementation
        const threadId = await createLegacyThread({
          inventoryId: this.config.inventoryId,
          content: t("initial-message"),
        });
        this.saveThreadToDatabase(threadId);
        return threadId;
      }
    } catch (error) {
      this.config.onError(
        error,
        "Failed to initialize thread. Please try again to send a message.",
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
        "Thread initialized, but saving thread ID to the database failed. Please check later.",
      );
    }
  }

  async sendMessage(threadId: string, content: string): Promise<Response> {
    trackEvent("chat_message_sent", {
      inventory_id: this.config.inventoryId,
    });

    // Use conditional URL based on feature flag
    const messageUrl = hasFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION)
      ? `/api/v1/chat/messages`
      : `/api/v1/assistants/threads/messages`;

    const response = await fetch(messageUrl, {
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
