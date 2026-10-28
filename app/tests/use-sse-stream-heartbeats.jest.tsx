/** @jest-environment jsdom */

import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ReadableStream } from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSSEStream, type SSEStreamController } from "@/hooks/useSSEStream";
import { logger } from "@/services/logger";

const originalFetch = globalThis.fetch;
const originalTextDecoder = globalThis.TextDecoder;
const onMessage = jest.fn();
const onComplete = jest.fn();
let controller: SSEStreamController;
let root: Root;
let container: HTMLDivElement;

function Harness() {
  const stream = useSSEStream({ onMessage, onComplete });
  useEffect(() => {
    controller = stream;
  }, [stream]);
  return null;
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, "TextDecoder", {
    configurable: true,
    value: TextDecoder,
  });
  onMessage.mockClear();
  onComplete.mockClear();
  container = document.createElement("div");
  root = createRoot(container);
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
  jest.restoreAllMocks();
});

it("ignores initial and recurring heartbeat comments while handling events", async () => {
  const warning = jest.spyOn(logger, "warn").mockImplementation(() => logger);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      stream.enqueue(encoder.encode(": keep-alive\n\n"));
      stream.enqueue(encoder.encode(": keep-alive\n\n"));
      stream.enqueue(
        encoder.encode(
          'event: message\ndata: {"content":"Hello","index":0}\n\n',
        ),
      );
      stream.enqueue(encoder.encode('event: done\ndata: {"ok":true}\n\n'));
      stream.close();
    },
  });
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    body,
  })) as unknown as typeof fetch;

  await act(async () => controller.startStream("/api/v1/chat/messages"));

  expect(onMessage).toHaveBeenCalledWith("Hello", 0);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(warning).not.toHaveBeenCalled();
});
