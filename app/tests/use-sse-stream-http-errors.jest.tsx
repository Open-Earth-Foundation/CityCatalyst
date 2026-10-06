/** @jest-environment jsdom */

import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextDecoder, TextEncoder } from "node:util";
import { useSSEStream, type SSEStreamController } from "@/hooks/useSSEStream";
import { logger } from "@/services/logger";

const originalFetch = globalThis.fetch;
const originalDecoder = Object.getOwnPropertyDescriptor(
  globalThis,
  "TextDecoder",
);
const onError = jest.fn();
const onMessage = jest.fn();
const onComplete = jest.fn();
const onProgress = jest.fn();
const onReasoning = jest.fn();
let controller: SSEStreamController;
let root: Root;
let container: HTMLDivElement;

function Harness() {
  const stream = useSSEStream({
    onError,
    onMessage,
    onComplete,
    onProgress,
    onReasoning,
  });
  useEffect(() => {
    controller = stream;
  }, [stream]);
  return null;
}

beforeEach(async () => {
  Object.defineProperty(globalThis, "TextDecoder", {
    configurable: true,
    value: TextDecoder,
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;
  if (originalDecoder)
    Object.defineProperty(globalThis, "TextDecoder", originalDecoder);
  else Reflect.deleteProperty(globalThis, "TextDecoder");
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  jest.restoreAllMocks();
});

function mockStream(chunks: string[]) {
  const releaseLock = jest.fn();
  const encoder = new TextEncoder();
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          const chunk = chunks.shift();
          return chunk === undefined
            ? { done: true }
            : { done: false, value: encoder.encode(chunk) };
        },
        releaseLock,
      }),
    },
  })) as unknown as typeof fetch;
  return releaseLock;
}

it("ignores split heartbeat comments while delivering messages and completion", async () => {
  const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
  const releaseLock = mockStream([
    'event: reasoning\ndata: {"id":"one","stage":"chat","delta":"Checking the draft."}\n\n',
    ": keep-",
    'alive\n\nevent: progress\ndata: {"stage":"planning","chapter_title":"Budget","completed":0,"total":12}\n',
    "\n: keep-",
    'alive\n\n: keep-alive\n\nevent: message\ndata: {"content":"Review ready","index":0}\n\n',
    ': keep-alive\n\nevent: done\ndata: {"ok":true}\n\n',
  ]);
  await controller.startStream("/api/v1/chat/messages", { method: "POST" });
  expect(onMessage).toHaveBeenCalledTimes(1);
  expect(onReasoning).toHaveBeenCalledWith({
    id: "one",
    stage: "chat",
    delta: "Checking the draft.",
  });
  expect(onProgress).toHaveBeenCalledWith({
    stage: "planning",
    chapter_title: "Budget",
    completed: 0,
    total: 12,
  });
  expect(onProgress).toHaveBeenCalledTimes(1);
  expect(onMessage).toHaveBeenCalledWith("Review ready", 0);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  expect(releaseLock).toHaveBeenCalledTimes(1);
});

it("passes the HTTP readiness code to the chat error handler exactly once", async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: false,
    status: 409,
    json: async () => ({
      code: "concept_note_context_not_ready",
      message: "Context is not ready",
    }),
  })) as unknown as typeof fetch;
  await expect(
    controller.startStream("/api/v1/chat/messages", { method: "POST" }),
  ).rejects.toThrow("Context is not ready");
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith(
    "Context is not ready",
    "concept_note_context_not_ready",
  );
});

it("reports a stream that closes without a terminal event so chat can recover", async () => {
  const releaseLock = mockStream([
    'event: progress\ndata: {"stage":"planning"}\n\n',
  ]);
  await expect(controller.startStream("/api/v1/chat/messages")).rejects.toThrow(
    "ended before completion",
  );
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  expect(releaseLock).toHaveBeenCalledTimes(1);
});
