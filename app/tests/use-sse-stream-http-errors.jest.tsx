/** @jest-environment jsdom */

import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSSEStream, type SSEStreamController } from "@/hooks/useSSEStream";

const originalFetch = globalThis.fetch;
const onError = jest.fn();
let controller: SSEStreamController;
let root: Root;
let container: HTMLDivElement;

function Harness() {
  const stream = useSSEStream({ onError });
  useEffect(() => {
    controller = stream;
  }, [stream]);
  return null;
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
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
