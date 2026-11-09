/** @jest-environment jsdom */

import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ReadableStream } from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  STREAM_STALLED_CODE,
  useSSEStream,
  type SSEStreamController,
} from "@/hooks/useSSEStream";

const IDLE_TIMEOUT_MS = 60;
const originalFetch = globalThis.fetch;
const originalTextDecoder = globalThis.TextDecoder;
const onError = jest.fn();
const onComplete = jest.fn();
const encoder = new TextEncoder();
let controller: SSEStreamController;
let root: Root;

function Harness() {
  const stream = useSSEStream({
    onError,
    onComplete,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
  });
  useEffect(() => {
    controller = stream;
  }, [stream]);
  return null;
}

// A fetch whose body follows the request's abort signal, like the browser's.
function mockStreamingFetch(
  write: (send: (chunk: string) => void, close: () => void) => void,
): void {
  globalThis.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        init?.signal?.addEventListener("abort", () =>
          stream.error(new DOMException("Aborted", "AbortError")),
        );
        write(
          (chunk) => stream.enqueue(encoder.encode(chunk)),
          () => stream.close(),
        );
      },
    });
    return { ok: true, status: 200, body };
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, "TextDecoder", {
    configurable: true,
    value: TextDecoder,
  });
  onError.mockClear();
  onComplete.mockClear();
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "TextDecoder", {
    configurable: true,
    value: originalTextDecoder,
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

it("cancels a silent stream and reports it as stalled, not as a user cancel", async () => {
  mockStreamingFetch((send) => send(": keep-alive\n\n"));

  await act(async () => {
    await expect(
      controller.startStream("/api/v1/chat/messages"),
    ).rejects.toMatchObject({ name: "StreamStalledError" });
  });

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith(
    "The response stream stalled",
    STREAM_STALLED_CODE,
    { status: 200, streamStarted: true },
  );
});

it("treats heartbeats as activity so a slow answer is not cut off", async () => {
  mockStreamingFetch((send, close) => {
    let beats = 0;
    const timer = setInterval(() => {
      beats += 1;
      if (beats < 5) {
        send(": keep-alive\n\n");
        return;
      }
      clearInterval(timer);
      send('event: done\ndata: {"ok":true}\n\n');
      close();
    }, IDLE_TIMEOUT_MS / 2);
  });

  await act(async () => controller.startStream("/api/v1/chat/messages"));

  expect(onError).not.toHaveBeenCalled();
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it("passes the error code and stream state from an SSE error event", async () => {
  mockStreamingFetch((send, close) => {
    send('event: error\ndata: {"message":"Boom","code":"provider_error"}\n\n');
    send('event: done\ndata: {"ok":false}\n\n');
    close();
  });

  await act(async () => controller.startStream("/api/v1/chat/messages"));

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith("Boom", "provider_error", {
    streamStarted: true,
  });
});
