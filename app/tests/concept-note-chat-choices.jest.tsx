/** @jest-environment jsdom */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
let ChatChoices: typeof import("@/components/ConceptNoteWorkspace/chat-choices").ChatChoices;
let root: Root;
let container: HTMLDivElement;
const reply = jest.fn<(answer: string) => Promise<void>>();
const originalClone = globalThis.structuredClone;
const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  ({ ChatChoices } =
    await import("@/components/ConceptNoteWorkspace/chat-choices"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalClone;
  globalThis.ResizeObserver = originalResizeObserver;
});
beforeEach(() => {
  reply.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(
  disabled = false,
  answered = false,
  selectedAnswer?: string,
  choices = ["Budget", "Partners", "Scope"],
) {
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ChoicesFixture
          choices={choices}
          disabled={disabled}
          answered={answered}
          selectedAnswer={selectedAnswer}
          lng="en"
          onReply={reply}
        />
      </ChakraProvider>,
    ),
  );
}
function ChoicesFixture(
  props: Omit<Parameters<typeof ChatChoices>[0], "draft" | "onDraftChange">,
) {
  const [draft, setDraft] = useState("");
  return <ChatChoices {...props} draft={draft} onDraftChange={setDraft} />;
}
const send = () =>
  container.querySelector<HTMLButtonElement>(
    '[aria-label="chat-choices-send"]',
  )!;
const option = () =>
  container.querySelector<HTMLButtonElement>("button[aria-pressed]")!;
const input = () => container.querySelector("textarea")!;
async function type(text: string) {
  const textarea = input();
  await act(async () => {
    textarea.focus();
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function enter(options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    ...options,
  });
  await act(async () => {
    input().dispatchEvent(event);
  });
  return event;
}
it("sends a clicked choice immediately and blocks duplicate clicks while sending", async () => {
  let finish!: () => void;
  reply.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  expect(send().disabled).toBe(true);
  await act(async () => {
    option().focus();
    option().click();
    option().click();
  });
  expect(option().getAttribute("aria-pressed")).toBe("false");
  expect(reply).toHaveBeenCalledTimes(1);
  expect(reply).toHaveBeenCalledWith("Budget");
  expect(option().disabled).toBe(true);
  expect(send().disabled).toBe(true);
  await act(async () => finish());
});
it("submits a trimmed custom answer with Enter", async () => {
  await render();
  await type("  Focus on the tram depot  ");
  expect(reply).not.toHaveBeenCalled();
  expect((await enter()).defaultPrevented).toBe(true);
  expect(reply).toHaveBeenCalledWith("Focus on the tram depot");
});
it("keeps the arrow available for custom answers", async () => {
  await render();
  await type("  Start with project scope  ");
  expect(reply).not.toHaveBeenCalled();
  await act(async () => send().click());
  expect(reply).toHaveBeenCalledWith("Start with project scope");
});
it("locks previous questions and choices while a response is generating", async () => {
  await render(true);
  expect(option().disabled).toBe(true);
  expect(send().disabled).toBe(true);
  await render(false, true);
  expect(option().disabled).toBe(true);
  expect(container.querySelector("textarea")).toBeNull();
});
it("restores the persisted selection on mount and clears it when the parent removes the reply", async () => {
  await render(false, true, "Budget");
  expect(option().getAttribute("aria-pressed")).toBe("true");
  expect(option().querySelector("svg")).not.toBeNull();

  await render(false, false);
  expect(option().getAttribute("aria-pressed")).toBe("false");
  expect(option().querySelector("svg")).toBeNull();
  expect(option().disabled).toBe(false);
  expect(reply).not.toHaveBeenCalled();
});
it("does not mark a suggestion selected for a custom answer", async () => {
  await render(false, true, "Custom scope");
  expect(
    container.querySelectorAll('button[aria-pressed="true"]'),
  ).toHaveLength(0);
});
it("renders paragraph whitespace and submits the complete suggested answer", async () => {
  const choice =
    "First paragraph.\n\nSecond paragraph with  extra spaces.\n" +
    "Details ".repeat(200);
  await render(false, false, undefined, [choice, "Other"]);
  const text = option().querySelectorAll("span")[1];
  expect(text.textContent).toBe(choice);
  expect(getComputedStyle(text).whiteSpace).toBe("pre-wrap");
  await act(async () => option().click());
  expect(reply).toHaveBeenCalledWith(choice);
});
it("allows Shift+Enter and sends multiline custom text with only outer whitespace trimmed", async () => {
  await render();
  await type("  First paragraph");
  expect((await enter({ shiftKey: true })).defaultPrevented).toBe(false);
  expect(reply).not.toHaveBeenCalled();
  // jsdom does not insert text for keyboard default actions.
  await type("  First paragraph\n\nSecond paragraph with  extra spaces.  ");
  await enter();
  expect(reply).toHaveBeenCalledTimes(1);
  expect(reply).toHaveBeenCalledWith(
    "First paragraph\n\nSecond paragraph with  extra spaces.",
  );
});
it("blocks blank replies and IME-confirming Enter including Safari's keyCode fallback", async () => {
  await render();
  await type(" \n\t ");
  expect(send().disabled).toBe(true);
  await enter();
  await act(async () => send().click());
  expect(reply).not.toHaveBeenCalled();

  await type("Composition candidate");
  await enter({ isComposing: true });
  await enter({ keyCode: 229 });
  expect(reply).not.toHaveBeenCalled();
  await enter();
  expect(reply).toHaveBeenCalledTimes(1);
});
it("retains a failed custom draft and enables a retry", async () => {
  reply.mockRejectedValueOnce(new Error("Request rejected"));
  await render();
  const draft = "  First line\nSecond line  ";
  await type(draft);
  await act(async () => send().click());
  expect(input().value).toBe(draft);
  expect(send().disabled).toBe(false);
  expect(option().disabled).toBe(false);
  expect(option().getAttribute("aria-pressed")).toBe("false");
  await act(async () => send().click());
  expect(reply).toHaveBeenCalledTimes(2);
  expect(reply).toHaveBeenLastCalledWith("First line\nSecond line");
});

it("keeps a custom answer over the edit limit unsent and says how much to shorten it", async () => {
  await render();
  await type("x".repeat(8_003));

  expect(send().disabled).toBe(true);
  expect(container.textContent).toContain("chat-message-too-long");
  expect(input().getAttribute("aria-invalid")).toBe("true");
  const event = await enter();
  expect(event.defaultPrevented).toBe(true);
  expect(reply).not.toHaveBeenCalled();
  expect(input().value).toHaveLength(8_003);

  await type("x".repeat(8_000));
  expect(send().disabled).toBe(false);
  expect(container.textContent).not.toContain("chat-message-too-long");
});
