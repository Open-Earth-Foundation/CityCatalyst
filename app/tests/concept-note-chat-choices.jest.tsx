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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
let ChatChoices: typeof import("@/components/ConceptNoteWorkspace/chat-choices").ChatChoices;
let root: Root;
let container: HTMLDivElement;
const reply = jest.fn<(answer: string) => Promise<void>>();
const originalClone = globalThis.structuredClone;
beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ ChatChoices } =
    await import("@/components/ConceptNoteWorkspace/chat-choices"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalClone;
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
async function render(disabled = false, answered = false) {
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ChatChoices
          choices={["Budget", "Partners", "Scope"]}
          disabled={disabled}
          answered={answered}
          lng="en"
          onReply={reply}
        />
      </ChakraProvider>,
    ),
  );
}
const send = () =>
  container.querySelector<HTMLButtonElement>(
    '[aria-label="chat-choices-send"]',
  )!;
const option = () =>
  container.querySelector<HTMLButtonElement>("button[aria-pressed]")!;
async function type(text: string) {
  const input = container.querySelector("input")!;
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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
  expect(option().getAttribute("aria-pressed")).toBe("true");
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
  await act(async () =>
    container.querySelector("input")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
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
  expect(container.querySelector("input")).toBeNull();
});
