/** @jest-environment jsdom */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { TFunction } from "i18next";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useStationaryEnergyChatPanelInteractions } from "@/components/StationaryEnergyDraft/use-stationary-energy-chat-panel-interactions";

type InteractionState = Parameters<
  typeof useStationaryEnergyChatPanelInteractions
>[0]["state"];
let state: InteractionState;
let interactions: ReturnType<typeof useStationaryEnergyChatPanelInteractions>;
let root: Root;
let container: HTMLDivElement;
const scrollTo = jest.fn();
const setChatInput = jest.fn();
const t = ((key: string) => key) as TFunction;
const actions = { setChatInput };
const sampleText = "Chat content";

function Harness() {
  const current = useStationaryEnergyChatPanelInteractions({
    state,
    actions,
    t,
  });
  const { scrollRegionRef, chatInputRef, handleChatScroll } = current;
  useEffect(() => {
    interactions = current;
  });
  return (
    <>
      <div ref={scrollRegionRef} onScroll={handleChatScroll}>
        <span>{sampleText}</span>
      </div>
      <textarea ref={chatInputRef} value={state.chatInput} readOnly />
    </>
  );
}

async function update(patch: Partial<InteractionState>) {
  state = { ...state, ...patch };
  await act(async () => root.render(<Harness />));
  await act(async () => jest.advanceTimersByTimeAsync(100));
}

describe("chat panel browser interactions", () => {
  beforeEach(async () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    jest.clearAllMocks();
    Object.defineProperty(HTMLDivElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    state = {
      chatInput: "",
      chatMessages: [],
      chatActivityLabel: null,
      loadingAction: null,
      showStaleWarning: false,
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await update({});
    scrollTo.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.getSelection()?.removeAllRanges();
    delete (HTMLDivElement.prototype as unknown as { scrollTo?: unknown })
      .scrollTo;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("focuses once when a reply finishes with a confirmation card", async () => {
    const input = interactions.chatInputRef.current!;
    const focus = jest.spyOn(input, "focus");
    await update({ loadingAction: "chat" });
    await update({
      loadingAction: null,
      chatMessages: [
        { id: "confirmation", kind: "inventory_save_confirmation" },
      ],
    });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
    await update({ chatActivityLabel: "Updated" });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("keeps a reader's scroll position until they send a message", async () => {
    const region = interactions.scrollRegionRef.current!;
    Object.defineProperties(region, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    });
    region.scrollTop = 0;
    interactions.handleChatScroll();
    await update({
      chatMessages: [
        { id: "answer", kind: "text", role: "assistant", text: "Answer" },
      ],
    });
    expect(scrollTo).not.toHaveBeenCalled();
    interactions.pinToBottom();
    await update({
      chatMessages: [
        ...state.chatMessages,
        { id: "question", kind: "text", role: "user", text: "Next question" },
      ],
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
  });

  it("does not auto-scroll while text inside the chat is selected", async () => {
    const text = container.querySelector("span")!.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()!.addRange(range);
    await update({
      chatMessages: [
        { id: "answer", kind: "text", role: "assistant", text: "Answer" },
      ],
    });
    expect(scrollTo).not.toHaveBeenCalled();
    window.getSelection()!.removeAllRanges();
    await update({ chatActivityLabel: "Next activity" });
    expect(scrollTo).toHaveBeenCalled();
  });

  it("caps the composer height and preserves a question already being typed", async () => {
    const input = interactions.chatInputRef.current!;
    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      value: 300,
    });
    await update({ chatInput: "My question" });
    expect(input.style.height).toBe("160px");
    interactions.handleAskAboutProposal("Residential buildings");
    expect(setChatInput).not.toHaveBeenCalled();
    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      value: 44,
    });
    await update({ chatInput: "" });
    expect(input.style.height).toBe("44px");
    interactions.handleAskAboutProposal("Residential buildings");
    expect(setChatInput).toHaveBeenCalledWith("chat-panel-ask-about-proposal");
  });
});
