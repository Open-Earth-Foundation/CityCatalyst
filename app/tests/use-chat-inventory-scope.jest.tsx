/** @jest-environment jsdom */

import {
  afterAll,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const startStream =
  jest.fn<(url: string, init: RequestInit) => Promise<void>>();
const createThread =
  jest.fn<(data: unknown) => { unwrap: () => Promise<{ threadId: string }> }>();

jest.unstable_mockModule("@/services/api", () => ({
  useCreateChatThreadMutation: () => [createThread],
}));
jest.unstable_mockModule("@/hooks/Toasts", () => ({
  UseErrorToast: () => ({ showErrorToast: jest.fn() }),
}));
jest.unstable_mockModule("@/hooks/useSSEStream", () => ({
  useSSEStream: () => ({ startStream, stopStream: jest.fn() }),
}));
jest.unstable_mockModule("@/lib/analytics", () => ({ trackEvent: jest.fn() }));

let useChat: typeof import("@/hooks/useChat").useChat;
let root: Root;
let container: HTMLDivElement;
let suggest: (message: string) => void;

// A stable translator: useChat resets its messages whenever `t` changes.
const t = ((key: string) => key) as never;

function Harness({ inventoryId }: { inventoryId?: string }) {
  const chat = useChat({ inventoryId, t });
  suggest = chat.handleSuggestionClick;
  return null;
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ useChat } = await import("@/hooks/useChat"));
});

beforeEach(() => {
  startStream.mockReset().mockResolvedValue(undefined);
  createThread
    .mockReset()
    .mockReturnValue({ unwrap: async () => ({ threadId: "thread-1" }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

async function send(inventoryId: string | undefined, message: string) {
  await act(async () => {
    root.render(<Harness inventoryId={inventoryId} />);
  });
  await act(async () => {
    suggest(message);
  });
  const [url, init] = startStream.mock.calls[0];
  return { url, body: JSON.parse(String(init.body)) };
}

it("sends the chat's inventory with every message so Clima can scope catalog reads", async () => {
  const { url, body } = await send("inventory-chat", "ranked actions?");

  expect(url).toBe("/api/v1/chat/messages");
  expect(body).toEqual({
    threadId: "thread-1",
    content: "ranked actions?",
    inventory_id: "inventory-chat",
  });
});

it("omits the inventory when the chat has none", async () => {
  const { body } = await send(undefined, "hello");

  expect(body.inventory_id).toBeUndefined();
  expect(body.threadId).toBe("thread-1");
});
