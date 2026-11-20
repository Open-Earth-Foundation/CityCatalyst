/** @jest-environment jsdom */

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { useVisualFrameHeight } from "@/components/ConceptNoteWorkspace/use-visual-frame-height";

// jsdom has no layout: record observers so the test can fire resizes itself.
class FakeResizeObserver {
  static all: FakeResizeObserver[] = [];
  targets = new Set<Element>();
  disconnected = false;
  constructor(public callback: () => void) {
    FakeResizeObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  disconnect() {
    this.disconnected = true;
    this.targets.clear();
  }
}

/** Minimal host: a plain iframe sized by the hook. */
function Frame({ onHeightChange }: { onHeightChange?: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { height, onLoad } = useVisualFrameHeight(frameRef, onHeightChange);
  return <iframe ref={frameRef} onLoad={onLoad} style={{ height }} />;
}

describe("useVisualFrameHeight", () => {
  let root: Root;
  let container: HTMLDivElement;
  let frame: HTMLIFrameElement;
  let contentHeight = 0;

  /** Fires a resize on every live observer watching the inner document. */
  const resizeInner = (next: number) =>
    act(async () => {
      contentHeight = next;
      const doc = frame.contentDocument!;
      FakeResizeObserver.all
        .filter((o) => o.targets.has(doc.body))
        .forEach((o) => o.callback());
    });

  const load = () =>
    act(async () => {
      const doc = frame.contentDocument!;
      doc.documentElement.getBoundingClientRect = () =>
        ({ height: contentHeight }) as DOMRect;
      Object.defineProperty(doc.body, "scrollHeight", {
        configurable: true,
        get: () => 0,
      });
      // No horizontal scrollbar.
      Object.defineProperty(doc.documentElement, "clientHeight", {
        configurable: true,
        get: () => frame.contentWindow!.innerHeight,
      });
      frame.dispatchEvent(new Event("load"));
    });

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    FakeResizeObserver.all = [];
    globalThis.ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Frame />));
    frame = container.querySelector("iframe")!;
    frame.contentDocument!.body.innerHTML =
      "<h2>Phases</h2><details><summary>Design</summary><p>May</p></details>";
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("grows and shrinks with the loaded document, capped at the max", async () => {
    contentHeight = 211;
    await load();
    expect(frame.style.height).toBe("211px");

    // Opening a <details> grows the content; the card follows.
    await resizeInner(239);
    expect(frame.style.height).toBe("239px");
    // Closing it shrinks the card back.
    await resizeInner(211);
    expect(frame.style.height).toBe("211px");
    // Still capped at the card's max height.
    await resizeInner(2000);
    expect(frame.style.height).toBe("1200px");
  });

  it("watches root, body and body's children of the loaded document only", async () => {
    contentHeight = 211;
    await load();
    const doc = frame.contentDocument!;
    const inner = FakeResizeObserver.all.filter((o) => o.targets.has(doc.body));
    expect(inner).toHaveLength(1);
    expect(inner[0].targets).toEqual(
      new Set([
        doc.documentElement,
        doc.body,
        ...Array.from(doc.body.children),
      ]),
    );

    // A reload (new document) replaces the inner observer.
    await load();
    expect(inner[0].disconnected).toBe(true);
    expect(
      FakeResizeObserver.all.filter(
        (o) => !o.disconnected && o.targets.has(doc.body),
      ),
    ).toHaveLength(1);

    // Unmount disconnects everything.
    await act(async () => root.unmount());
    expect(FakeResizeObserver.all.every((o) => o.disconnected)).toBe(true);
    root = createRoot(container);
  });

  it("stops a resize chain that never settles", async () => {
    contentHeight = 300;
    await load();
    const onHeightChange = jest.fn();
    await act(async () =>
      root.render(<Frame onHeightChange={onHeightChange} />),
    );
    onHeightChange.mockClear();

    // Content that flips between two heights on every resize, all within one burst.
    for (let i = 0; i < 100; i++) await resizeInner(i % 2 ? 300 : 340);
    expect(onHeightChange.mock.calls.length).toBeLessThanOrEqual(20);

    // After a quiet period a real change (closing details) applies again.
    const now = performance.now();
    jest.spyOn(performance, "now").mockReturnValue(now + 1000);
    await resizeInner(250);
    expect(frame.style.height).toBe("250px");
  });
});
