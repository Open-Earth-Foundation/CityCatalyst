import { useRef, useCallback } from "react";
import { logger } from "@/services/logger";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { AssistantStream } from "openai/lib/AssistantStream";

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
  // Legacy OpenAI Assistant API callbacks
  onTextCreated?: () => void;
  onTextDelta?: (delta: any) => void;
  onRequiresAction?: (event: any) => void;
  onRunCompleted?: () => void;
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
          logger.warn({ event }, "Unhandled SSE event type");
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

  // Handler for legacy OpenAI Assistant API streams
  const handleAssistantStream = useCallback((stream: AssistantStream) => {
    try {
      // Text creation and delta events
      if (options.onTextCreated) {
        stream.on("textCreated", options.onTextCreated);
      }
      if (options.onTextDelta) {
        stream.on("textDelta", options.onTextDelta);
      }

      // Events without helpers yet (e.g. requires_action and run.done)
      stream.on("event", (event) => {
        if (event.event === "thread.run.requires_action" && options.onRequiresAction) {
          options.onRequiresAction(event);
        }
        if (event.event === "thread.run.completed" && options.onRunCompleted) {
          options.onRunCompleted();
        }
      });
    } catch (error: any) {
      if (error.name === "APIUserAbortError" || error.message === "Request was aborted.") {
        logger.info("Assistant stream processing was aborted.");
      } else {
        logger.error({ err: error }, "An error occurred while processing the assistant stream:");
        if (options.onError) {
          options.onError(error.message || "Assistant stream processing error");
        }
      }
    }
  }, [options]);

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

      // Use different stream handling based on feature flag
      if (hasFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION)) {
        // New CA service SSE format
        await handleStream(response);
      } else {
        // Legacy OpenAI Assistant API format using AssistantStream
        const stream = AssistantStream.fromReadableStream(response.body);
        handleAssistantStream(stream);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        // Call onError callback for any non-abort errors
        if (options.onError) {
          options.onError(error.message || "Failed to start stream");
        }
      }
      throw error; // Re-throw so calling code can handle it too
    }
  }, [handleStream, handleAssistantStream, options]);

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