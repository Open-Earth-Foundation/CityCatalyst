/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { appTheme } from "@/lib/theme/recipes/app-theme";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const { ChatSuggestions } =
  await import("@/components/ConceptNoteWorkspace/chat-suggestions");
let root: Root;
let container: HTMLDivElement;
const originalFetch = globalThis.fetch;
const onSelect = jest.fn();
const render = async (revision = "1", hasDocument = true) => {
  await act(async () =>
    root.render(
      <ChakraProvider value={appTheme}>
        <ChatSuggestions
          runId="run"
          threadId="thread"
          lng="en"
          tab="draft"
          revision={revision}
          hasDocument={hasDocument}
          onSelect={onSelect}
        />
      </ChakraProvider>,
    ),
  );
};
const respond = (suggestions: string[]) =>
  ({ ok: true, json: async () => ({ suggestions }) }) as Response;

beforeEach(() => {
  jest.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

it("shows two selectable fallbacks and then two model questions", async () => {
  globalThis.fetch = jest.fn(async () =>
    respond(["Budget question?", "Evidence question?"]),
  ) as typeof fetch;
  await render();
  expect(container.querySelectorAll("button")).toHaveLength(2);
  expect(container.textContent).toContain("chat-suggestion-review");
  await act(async () => jest.advanceTimersByTime(400));
  expect(container.textContent).toContain("Budget question?");
  await act(async () => container.querySelector("button")!.click());
  expect(onSelect).toHaveBeenCalledWith("Budget question?");
});

it("ignores a late response after the workspace changes", async () => {
  let resolveOld!: (response: Response) => void;
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(respond(["Current question?", "Next question?"]));
  globalThis.fetch = fetchMock;
  await render("1");
  await act(async () => jest.advanceTimersByTime(400));
  await render("2");
  expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(
    true,
  );
  await act(async () => jest.advanceTimersByTime(400));
  await act(async () =>
    resolveOld(respond(["Stale question?", "Old question?"])),
  );
  expect(container.textContent).toContain("Current question?");
  expect(container.textContent).not.toContain("Stale question?");
});

it("keeps preparation fallbacks on failure and rejects duplicate responses", async () => {
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(respond(["Same?", "same?"]));
  await render("1", false);
  await act(async () => jest.advanceTimersByTime(400));
  expect(container.textContent).toContain("chat-suggestion-start");
  await render("2", false);
  await act(async () => jest.advanceTimersByTime(400));
  expect(container.textContent).toContain("chat-suggestion-evidence");
  expect(container.textContent).not.toContain("Same?");
});
