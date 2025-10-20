import { useRef, useCallback } from "react";
import { logger } from "@/services/logger";

export interface SSEEvent {
  type?: string;
  data?: any;
  id?: string;
}

export interface SSEStreamOptions {
  onMessage?: (content: string, index: number) => void;
  onToolResult?: (tool: any) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onWarning?: (warning: string) => void;
}

export function useSSEStream(options: SSEStreamOptions = {}) {
  const abortControllerRef = useRef<AbortController | null>(null);

  const parseSSEEvent = useCallback((eventText: string): SSEEvent => {
    const lines = eventText.trim().split('\n');
    const event: SSEEvent = {};

    for (const line of lines) {
      if (line.startsWith('event:')) {
        event.type = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        const dataStr = line.substring(5).trim();
        try {
          event.data = JSON.parse(dataStr);
        } catch {
          event.data = dataStr;
        }
      } else if (line.startsWith('id:')) {
        event.id = line.substring(3).trim();
      }
    }

    return event;
  }, []);

  const handleSSEEvent = useCallback(async (event: SSEEvent) => {
    try {
      switch (event.type) {
        case 'message':
          if (event.data?.content && options.onMessage) {
            options.onMessage(event.data.content, event.data.index || 0);
          }
          break;

        case 'tool_result':
          if (event.data && options.onToolResult) {
            options.onToolResult(event.data);
          }
          break;

        case 'done':
          if (event.data?.ok && options.onComplete) {
            options.onComplete();
          } else if (!event.data?.ok && options.onError) {
            options.onError(event.data?.error || "Stream completed with error");
          }
          break;

        case 'error':
          if (options.onError) {
            options.onError(event.data?.message || "Stream error");
          }
          break;

        case 'warning':
          if (options.onWarning) {
            options.onWarning(event.data?.message || "Stream warning");
          }
          break;

        default:
          logger.debug({ event }, "Unhandled SSE event type");
      }
    } catch (error: any) {
      logger.error({ error, event }, "Error handling SSE event");
      if (options.onError) {
        options.onError(error.message || "Stream processing error");
      }
    }
  }, [options]);

  const handleStream = useCallback(async (response: Response) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body reader available");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        const events = buffer.split('\n\n');
        buffer = events.pop() || "";

        for (const eventText of events) {
          if (!eventText.trim()) continue;

          try {
            const event = parseSSEEvent(eventText);
            await handleSSEEvent(event);
          } catch (error) {
            logger.error({ error, eventText }, "Failed to parse SSE event");
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }, [parseSSEEvent, handleSSEEvent]);

  const startStream = useCallback(async (url: string, fetchOptions: RequestInit = {}) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: abortController.signal,
      });

      if (!response.ok) {
        // Try to extract error message from response
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorMessage = errorData.detail;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // Fallback to status text if JSON parsing fails
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error("HTTP response is null");
      }

      await handleStream(response);
    } catch (error: any) {
      if (error.name !== "AbortError") {
        // Call onError callback for any non-abort errors
        if (options.onError) {
          options.onError(error.message || "Failed to start stream");
        }
      }
      throw error; // Re-throw so calling code can handle it too
    }
  }, [handleStream, options]);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    startStream,
    stopStream,
  };
}