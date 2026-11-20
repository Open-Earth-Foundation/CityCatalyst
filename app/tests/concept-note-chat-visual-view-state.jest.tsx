/** @jest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { appTheme } from "@/lib/theme/recipes/app-theme";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const {
  applyVisualViewState,
  activePanelId,
  readVisualViewState,
  useVisualViewState,
} = await import("@/components/ConceptNoteWorkspace/use-visual-view-state");
const { ChatVisualFrame } =
  await import("@/components/ConceptNoteWorkspace/chat-visual-frame");

// Radio cards with stable panel ids plus two independent phases.
const CARDS = [
  '<input type="radio" name="tab" id="cc-panel-0" checked>',
  '<input type="radio" name="tab" id="cc-panel-1">',
  '<input type="radio" name="tab" id="cc-panel-2">',
  '<label for="cc-panel-0">Overview</label><label for="cc-panel-1">Costs</label>',
  '<label for="cc-panel-2">Risks</label>',
  "<details><summary>Design</summary>D</details>",
  "<details><summary>Build</summary>B</details>",
].join("");

function documentWith(html: string): Document {
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = html;
  return doc;
}

describe("visual view state", () => {
  it("keys controls by stable id, else by position, and copies them over", () => {
    const source = documentWith(CARDS + '<input type="checkbox">');
    (source.getElementById("cc-panel-1") as HTMLInputElement).checked = true;
    source.querySelectorAll("details")[1].open = true;
    source.querySelector<HTMLInputElement>("[type=checkbox]")!.checked = true;

    const state = readVisualViewState(source);
    expect(state).toEqual({
      "#cc-panel-0": false,
      "#cc-panel-1": true,
      "#cc-panel-2": false,
      "input:3": true,
      "details:0": false,
      "details:1": true,
    });
    expect(activePanelId(state)).toBe("cc-panel-1");

    const target = documentWith(CARDS + '<input type="checkbox">');
    applyVisualViewState(target, state);
    expect(readVisualViewState(target)).toEqual(state);
  });

  it("falls back to position when an id repeats or is missing", () => {
    const html =
      '<input type="radio" name="a" id="x" checked><input type="radio" name="a" id="x">' +
      '<input type="radio" name="b" checked><input type="radio" name="b">';
    const source = documentWith(html);
    source.querySelectorAll("input")[1].checked = true;
    source.querySelectorAll("input")[3].checked = true;

    const target = documentWith(html);
    applyVisualViewState(target, readVisualViewState(source));
    expect(
      Array.from(target.querySelectorAll("input")).map((i) => i.checked),
    ).toEqual([false, true, false, true]);
    expect(activePanelId(readVisualViewState(target))).toBeNull();
  });

  it("copies a select's selected option by index between documents", () => {
    const html =
      '<select id="year"><option value="y2023">2023</option><option value="y2024">2024</option></select>' +
      "<select><option>a</option><option>b</option></select>";
    const source = documentWith(html);
    source.querySelectorAll("select")[0].selectedIndex = 1;
    source.querySelectorAll("select")[1].selectedIndex = 1;

    const state = readVisualViewState(source);
    expect(state).toEqual({ "#year": 1, "select:1": 1 });

    const target = documentWith(html);
    applyVisualViewState(target, state);
    expect(
      Array.from(target.querySelectorAll("select")).map((s) => s.selectedIndex),
    ).toEqual([1, 1]);
    expect(readVisualViewState(target)).toEqual(state);
  });

  it("never reads a select's option index as an active panel", () => {
    // A select with a panel id holds 1, which is truthy but not a checked radio.
    const source = documentWith(
      '<select id="cc-panel-3"><option>a</option><option>b</option></select>',
    );
    source.querySelector("select")!.selectedIndex = 1;

    const state = readVisualViewState(source);
    expect(state).toEqual({ "#cc-panel-3": 1 });
    expect(activePanelId(state)).toBeNull();
    expect(activePanelId({ ...state, "#cc-panel-1": true })).toBe("cc-panel-1");
  });
});

describe("ChatVisualFrame view state", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  // jsdom does not parse srcdoc; fill the frame and fire its load event.
  const load = (frame: HTMLIFrameElement) =>
    act(async () => {
      frame.contentDocument!.body.innerHTML = CARDS;
      frame.dispatchEvent(new Event("load"));
    });
  const card = () =>
    container.querySelector<HTMLElement>(
      '[data-testid="concept-note-chat-visual"]',
    )!;
  const inlineFrame = () => card().querySelector("iframe")!;
  const dialogFrame = () =>
    document.querySelector<HTMLIFrameElement>('[role="dialog"] iframe');
  const checked = (frame: HTMLIFrameElement) =>
    frame.contentDocument!.querySelector<HTMLInputElement>(":checked")?.id;
  const choose = (frame: HTMLIFrameElement, id: string) =>
    act(async () => {
      const radio = frame.contentDocument!.getElementById(
        id,
      ) as HTMLInputElement;
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    });
  const expand = async () => {
    await act(async () =>
      card()
        .querySelector<HTMLButtonElement>(
          '[aria-label="chat-visual-expand-label"]',
        )!
        .click(),
    );
    const frame = dialogFrame();
    expect(frame).not.toBeNull();
    await load(frame!);
    return frame!;
  };
  const close = async () => {
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[role="dialog"] [aria-label="close"]',
        )!
        .click(),
    );
    // Wait for the dialog to unmount its frame.
    for (let i = 0; i < 20 && dialogFrame(); i++) {
      await act(() => new Promise((resolve) => setTimeout(resolve, 25)));
    }
    expect(dialogFrame()).toBeNull();
  };

  it("keeps the chosen card and open sections across Expand and close", async () => {
    await act(async () =>
      root.render(
        <ChakraProvider value={appTheme}>
          <ChatVisualFrame lng="en" title="Cards" html={CARDS} />
        </ChakraProvider>,
      ),
    );
    await load(inlineFrame());
    expect(card().dataset.activePanel).toBe("cc-panel-0");

    // Costs inline, then Expand still shows Costs.
    await choose(inlineFrame(), "cc-panel-1");
    expect(card().dataset.activePanel).toBe("cc-panel-1");
    let big = await expand();
    expect(checked(big)).toBe("cc-panel-1");

    // Risks and the second phase in the dialog carry back to the card.
    await choose(big, "cc-panel-2");
    await act(async () => {
      const build = big.contentDocument!.querySelectorAll("details")[1];
      build.open = true;
      build.dispatchEvent(new Event("toggle"));
    });
    expect(checked(inlineFrame())).toBe("cc-panel-2");
    expect(
      Array.from(
        inlineFrame().contentDocument!.querySelectorAll("details"),
      ).map((d) => d.open),
    ).toEqual([false, true]);
    await close();
    expect(card().dataset.activePanel).toBe("cc-panel-2");

    // Reopening restores Risks and only the Build phase.
    big = await expand();
    expect(checked(big)).toBe("cc-panel-2");
    expect(
      Array.from(big.contentDocument!.querySelectorAll("details")).map(
        (d) => d.open,
      ),
    ).toEqual([false, true]);
  });

  it("lets the host select a trusted panel by its stable id", async () => {
    const api: { current?: ReturnType<typeof useVisualViewState> } = {};
    function Host() {
      const viewState = useVisualViewState();
      useEffect(() => {
        api.current = viewState;
      });
      return (
        <div data-active={viewState.activePanel ?? ""}>
          <iframe
            srcDoc="cards"
            onLoad={(event) => viewState.connect(event.currentTarget)}
          />
          <iframe
            srcDoc="cards"
            onLoad={(event) => viewState.connect(event.currentTarget)}
          />
        </div>
      );
    }
    await act(async () => root.render(<Host />));
    const frames = Array.from(container.querySelectorAll("iframe"));
    for (const frame of frames) await load(frame);

    await act(async () => api.current!.selectPanel("cc-panel-2"));
    expect(frames.map(checked)).toEqual(["cc-panel-2", "cc-panel-2"]);
    expect(container.firstElementChild!.getAttribute("data-active")).toBe(
      "cc-panel-2",
    );
    // A later user change in one frame still reaches the other.
    await choose(frames[1], "cc-panel-1");
    expect(checked(frames[0])).toBe("cc-panel-1");
    expect(api.current!.activePanel).toBe("cc-panel-1");

    // A body without panel radios (host-drawn tabs) keeps the host's choice,
    // and a frame loaded later follows it.
    await act(async () => api.current!.selectPanel("cc-panel-2"));
    const extra = document.createElement("iframe");
    container.appendChild(extra);
    await act(async () => {
      extra.contentDocument!.body.innerHTML = "<details></details>";
      api.current!.connect(extra);
    });
    expect(api.current!.activePanel).toBe("cc-panel-2");
    await act(async () => {
      frames[0].contentDocument!.body.innerHTML = CARDS;
      api.current!.connect(frames[0]);
    });
    expect(checked(frames[0])).toBe("cc-panel-2");
  });

  it("syncs a select's option between two connected frames", async () => {
    const FILTER =
      '<select><option value="y2023">2023</option><option value="y2024">2024</option></select>';
    function Host() {
      const viewState = useVisualViewState();
      return (
        <>
          <iframe
            srcDoc="filters"
            onLoad={(event) => viewState.connect(event.currentTarget)}
          />
          <iframe
            srcDoc="filters"
            onLoad={(event) => viewState.connect(event.currentTarget)}
          />
        </>
      );
    }
    await act(async () => root.render(<Host />));
    const [first, second] = Array.from(container.querySelectorAll("iframe"));
    for (const frame of [first, second]) {
      await act(async () => {
        frame.contentDocument!.body.innerHTML = FILTER;
        frame.dispatchEvent(new Event("load"));
      });
    }
    const select = (frame: HTMLIFrameElement) =>
      frame.contentDocument!.querySelector("select")!;

    // Choosing 2024 in one frame sets it in the other, both ways.
    await act(async () => {
      select(first).selectedIndex = 1;
      select(first).dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select(second).selectedIndex).toBe(1);

    await act(async () => {
      select(second).selectedIndex = 0;
      select(second).dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select(first).selectedIndex).toBe(0);
  });

  it("starts a new visual from its own defaults", async () => {
    const render = (html: string) =>
      act(async () =>
        root.render(
          <ChakraProvider value={appTheme}>
            <ChatVisualFrame lng="en" title="Cards" html={html} />
          </ChakraProvider>,
        ),
      );
    await render(CARDS);
    await load(inlineFrame());
    await choose(inlineFrame(), "cc-panel-2");

    await render(CARDS + "<p>v2</p>");
    await load(inlineFrame());
    expect(checked(inlineFrame())).toBe("cc-panel-0");
    expect(card().dataset.activePanel).toBe("cc-panel-0");
  });
});
