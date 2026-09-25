/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteChatThread } from "@/util/types";

const latestId = "11111111-1111-4111-8111-111111111111";
const olderId = "22222222-2222-4222-8222-222222222222";
const threads: ConceptNoteChatThread[] = [
  {
    thread_id: latestId,
    title: "Heat resilience",
    created_at: "2026-09-25T14:02:00Z",
    last_message_at: null,
    message_count: 0,
    preview: null,
  },
  {
    thread_id: olderId,
    title: "Heat resilience",
    created_at: "2026-09-22T09:15:00Z",
    last_message_at: "2026-09-22T09:20:00Z",
    message_count: 9,
    preview: "Summarise the Climate Action Plan I uploaded",
  },
];
const startChat = jest.fn<() => { unwrap: () => Promise<unknown> }>();
const activateThread = jest.fn<() => { unwrap: () => Promise<unknown> }>();
const toast = jest.fn();
const refetchThreads = jest.fn(async () => ({}));

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && "number" in options
        ? `${key}:${options.number}`
        : options && "count" in options
          ? `${key}:${options.count}`
          : key,
  }),
}));
jest.unstable_mockModule("@/components/ui/toaster", () => ({
  toaster: { create: toast },
}));
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useGetConceptNoteChatThreadsQuery: () => ({
      data: { threads },
      refetch: refetchThreads,
    }),
    useStartConceptNoteChatMutation: () => [startChat, { isLoading: false }],
    useActivateConceptNoteChatThreadMutation: () => [
      activateThread,
      { isLoading: false },
    ],
  },
}));

const { ChatThreadSwitcher, OlderChatNotice, useConceptNoteChatThreads } =
  await import("@/components/ConceptNoteWorkspace/chat-threads");

function Harness({ threadId }: { threadId: string | null }) {
  const controller = useConceptNoteChatThreads({
    cityId: "city",
    lng: "en",
    runId: "run",
    threadId,
  });
  return (
    <>
      <ChatThreadSwitcher
        controller={controller}
        lng="en"
        threadId={threadId}
      />
      <OlderChatNotice controller={controller} lng="en" />
    </>
  );
}

let root: Root;
let container: HTMLDivElement;
const render = async (threadId: string | null) =>
  act(async () =>
    root.render(
      <ChakraProvider value={appTheme}>
        <Harness threadId={threadId} />
      </ChakraProvider>,
    ),
  );
const trigger = () =>
  container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-chat-switcher"]',
  )!;
const menuItems = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid="concept-note-chat-thread"]',
    ),
  );
// Chakra menus highlight on pointerdown and select the highlighted item on
// click, so each event needs its own render flush.
const selectItem = async (item: HTMLElement) => {
  for (const type of ["pointerdown", "click"]) {
    await act(async () => {
      item.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }),
      );
    });
  }
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  startChat.mockReturnValue({ unwrap: async () => ({}) });
  activateThread.mockReturnValue({ unwrap: async () => ({}) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.clearAllMocks();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

it("numbers the active chat from the oldest and hides the notice on the latest", async () => {
  await render(latestId);
  expect(trigger().textContent).toContain("chat-number:2");
  expect(
    container.querySelector('[data-testid="concept-note-older-chat"]'),
  ).toBeNull();
});

it("lists previous chats and switches to the selected one", async () => {
  await render(latestId);
  await act(async () => trigger().click());
  // Counts and previews change as messages are sent, so opening refreshes them.
  expect(refetchThreads).toHaveBeenCalledTimes(1);
  const items = menuItems();
  expect(items).toHaveLength(2);
  expect(items[0].dataset.active).toBe("true");
  expect(items[1].textContent).toContain("chat-number:1");
  expect(items[1].textContent).toContain("Summarise the Climate Action Plan");
  expect(items[1].textContent).toContain("chat-message-count:9");
  await selectItem(items[1]);
  expect(activateThread).toHaveBeenCalledWith({
    cityId: "city",
    runId: "run",
    threadId: olderId,
  });
});

it("starts a new chat from the menu and reports success", async () => {
  await render(latestId);
  await act(async () => trigger().click());
  await selectItem(
    document.querySelector<HTMLElement>(
      '[data-testid="concept-note-start-new-chat"]',
    )!,
  );
  expect(startChat).toHaveBeenCalledWith({ cityId: "city", runId: "run" });
  expect(toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "start-new-chat-success" }),
  );
});

it("offers a way back to the latest chat while an earlier one is active", async () => {
  await render(olderId);
  expect(trigger().textContent).toContain("chat-number:1");
  const back = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-back-to-latest-chat"]',
  );
  expect(back).not.toBeNull();
  await act(async () => back!.click());
  expect(activateThread).toHaveBeenCalledWith({
    cityId: "city",
    runId: "run",
    threadId: latestId,
  });
});

it("explains a busy run instead of switching", async () => {
  activateThread.mockReturnValue({
    unwrap: async () => {
      throw { status: 409, data: {} };
    },
  });
  await render(olderId);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-back-to-latest-chat"]',
      )!
      .click(),
  );
  expect(toast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "switch-chat-conflict", type: "error" }),
  );
});
