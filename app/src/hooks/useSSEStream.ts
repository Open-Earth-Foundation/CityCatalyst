import { AssistantStream } from "openai/lib/AssistantStream";
import { useCallback, useRef } from "react";

import { logger } from "@/services/logger";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

type SSEDataRecord = Record<string, unknown>;
export type ToolResultPayload = SSEDataRecord;

export interface SSEEvent {
  type?: string;
  data?: unknown;
  id?: string;
}

export interface SSEStreamOptions {
  onMessage?: (content: string, index: number) => void;
  onToolResult?: (tool: ToolResultPayload) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onWarning?: (warning: string) => void;
  forceEventStream?: boolean;
  // Legacy OpenAI Assistant API callbacks
  onTextCreated?: () => void;
  onTextDelta?: (delta: unknown) => void;
  onRequiresAction?: (event: unknown) => void;
  onRunCompleted?: () => void;
}

export type SSEStreamController = {
  startStream: (url: string, fetchOptions?: RequestInit) => Promise<void>;
  stopStream: () => void;
};

function isRecord(value: unknown): value is SSEDataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAsString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isNamedError(error: unknown, name: string): boolean {
  return error instanceof Error
    ? error.name === name
    : isRecord(error) && error.name === name;
}

function mergeToolResult(
  tool: SSEDataRecord,
  result: SSEDataRecord,
): ToolResultPayload {
  return {
    name: tool.name,
    status: tool.status,
    tool_call_id: tool.id,
    ...result,
  };
}

function parseJsonRecord(value: string): SSEDataRecord | null {
  const parsed: unknown = JSON.parse(value);
  return isRecord(parsed) ? parsed : null;
}

function collectToolResultPayloads(eventData: unknown): ToolResultPayload[] {
  if (!isRecord(eventData) || !Array.isArray(eventData.tools_used)) {
    return [];
  }

  return eventData.tools_used
    .map((tool) => {
      if (!isRecord(tool)) {
        return null;
      }

      if (isRecord(tool.result_json)) {
        return mergeToolResult(tool, tool.result_json);
      }

      if (typeof tool?.result === "string") {
        try {
          const parsed = parseJsonRecord(tool.result);
          if (parsed) {
            return mergeToolResult(tool, parsed);
          }
        } catch {
          return null;
        }
      }

      return null;
    })
    .filter(
      (toolResult): toolResult is ToolResultPayload => toolResult !== null,
    );
}

export function useSSEStream(
  options: SSEStreamOptions = {},
): SSEStreamController {
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamErroredRef = useRef(false);

  const parseSSEEvent = useCallback((eventText: string): SSEEvent => {
    const lines = eventText.trim().split("\n");
    const event: SSEEvent = {};

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event.type = line.substring(6).trim();
      } else if (line.startsWith("data:")) {
        const dataStr = line.substring(5).trim();
        try {
          event.data = JSON.parse(dataStr) as unknown;
        } catch {
          event.data = dataStr;
        }
      } else if (line.startsWith("id:")) {
        event.id = line.substring(3).trim();
      }
    }

    return event;
  }, []);

  const handleSSEEvent = useCallback(
    async (event: SSEEvent) => {
      try {
        switch (event.type) {
          case "message":
            if (isRecord(event.data) && options.onMessage) {
              const content = valueAsString(event.data.content);
              if (content) {
                options.onMessage(
                  content,
                  typeof event.data.index === "number" ? event.data.index : 0,
                );
              }
            }
            break;

          case "tool_result":
            if (isRecord(event.data) && options.onToolResult) {
              options.onToolResult(event.data);
            }
            break;

          case "done":
            if (
              isRecord(event.data) &&
              event.data.ok === true &&
              options.onToolResult
            ) {
              for (const toolResult of collectToolResultPayloads(event.data)) {
                options.onToolResult(toolResult);
              }
            }
            if (
              isRecord(event.data) &&
              event.data.ok === true &&
              options.onComplete
            ) {
              options.onComplete();
            } else if (
              (!isRecord(event.data) || event.data.ok !== true) &&
              options.onError &&
              !streamErroredRef.current
            ) {
              options.onError(
                isRecord(event.data)
                  ? (valueAsString(event.data.error) ??
                      "Stream completed with error")
                  : "Stream completed with error",
              );
            }
            streamErroredRef.current = false;
            break;

          case "error":
            streamErroredRef.current = true;
            if (options.onError) {
              options.onError(
                isRecord(event.data)
                  ? (valueAsString(event.data.message) ?? "Stream error")
                  : "Stream error",
              );
            }
            break;

          case "warning":
            if (options.onWarning) {
              options.onWarning(
                isRecord(event.data)
                  ? (valueAsString(event.data.message) ?? "Stream warning")
                  : "Stream warning",
              );
            }
            break;

          default:
            logger.warn({ event }, "Unhandled SSE event type");
        }
      } catch (error: unknown) {
        logger.error({ error, event }, "Error handling SSE event");
        if (options.onError) {
          options.onError(getErrorMessage(error, "Stream processing error"));
        }
      }
    },
    [options],
  );

  const handleStream = useCallback(
    async (response: Response) => {
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

          const events = buffer.split("\n\n");
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
    },
    [parseSSEEvent, handleSSEEvent],
  );

  // Handler for legacy OpenAI Assistant API streams
  const handleAssistantStream = useCallback(
    (stream: AssistantStream) => {
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
          if (
            event.event === "thread.run.requires_action" &&
            options.onRequiresAction
          ) {
            options.onRequiresAction(event);
          }
          if (
            event.event === "thread.run.completed" &&
            options.onRunCompleted
          ) {
            options.onRunCompleted();
          }
        });
      } catch (error: unknown) {
        if (
          isNamedError(error, "APIUserAbortError") ||
          getErrorMessage(error, "") === "Request was aborted."
        ) {
          logger.info("Assistant stream processing was aborted.");
        } else {
          logger.error(
            { err: error },
            "An error occurred while processing the assistant stream:",
          );
          if (options.onError) {
            options.onError(
              getErrorMessage(error, "Assistant stream processing error"),
            );
          }
        }
      }
    },
    [options],
  );

  const startStream = useCallback(
    async (url: string, fetchOptions: RequestInit = {}) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        streamErroredRef.current = false;
        const response = await fetch(url, {
          ...fetchOptions,
          signal: abortController.signal,
        });

        if (!response.ok) {
          // Try to extract error message from response
          let errorMessage = `HTTP error! status: ${response.status}`;
          try {
            const errorData: unknown = await response.json();
            if (isRecord(errorData)) {
              errorMessage =
                valueAsString(errorData.detail) ??
                valueAsString(errorData.message) ??
                errorMessage;
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
        if (
          options.forceEventStream ||
          hasFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION)
        ) {
          // New CA service SSE format
          await handleStream(response);
        } else {
          // Legacy OpenAI Assistant API format using AssistantStream
          const stream = AssistantStream.fromReadableStream(response.body);
          handleAssistantStream(stream);
        }
      } catch (error: unknown) {
        if (!isNamedError(error, "AbortError")) {
          streamErroredRef.current = true;
          // Call onError callback for non-abort errors
          if (options.onError) {
            options.onError(getErrorMessage(error, "Failed to start stream"));
          }
        }
        throw error; // Re-throw so calling code can handle it too
      }
    },
    [handleStream, handleAssistantStream, options],
  );

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
