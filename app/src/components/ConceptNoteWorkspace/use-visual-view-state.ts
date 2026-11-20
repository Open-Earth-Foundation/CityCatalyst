"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Native view state of a static visual, keyed per control: a radio or checkbox
 * holds whether it is checked, a <details> whether it is open, and a <select>
 * the index of its selected option. Model visuals have no scripts, so these
 * CSS-driven controls are the only state a card can hold.
 */
export type VisualViewState = Record<string, boolean | number>;

/** Radio ids with this prefix name a panel of a trusted named-card visual. */
export const PANEL_ID_PREFIX = "cc-panel-";

type StatefulControl =
  HTMLInputElement | HTMLDetailsElement | HTMLSelectElement;

function isSelect(element: StatefulControl): element is HTMLSelectElement {
  return element.tagName === "SELECT";
}

/**
 * Lists the stateful controls with a key that matches across two documents
 * built from the same HTML: the element id when it is unique (stable panel
 * ids such as `cc-panel-1`), else its position among controls of its kind.
 */
function statefulControls(doc: Document): [string, StatefulControl][] {
  const inputs = Array.from(
    doc.querySelectorAll<HTMLInputElement>(
      'input[type="radio"], input[type="checkbox"]',
    ),
  );
  const details = Array.from(doc.querySelectorAll("details"));
  const selects = Array.from(doc.querySelectorAll("select"));
  // Ids are counted across all kinds, so a repeated id falls back to position.
  const idCounts = new Map<string, number>();
  for (const element of [...inputs, ...details, ...selects]) {
    if (element.id)
      idCounts.set(element.id, (idCounts.get(element.id) ?? 0) + 1);
  }
  const keyOf = (element: StatefulControl, fallback: string) =>
    element.id && idCounts.get(element.id) === 1 ? `#${element.id}` : fallback;
  return [
    ...inputs.map((input, i): [string, StatefulControl] => [
      keyOf(input, `input:${i}`),
      input,
    ]),
    ...details.map((item, i): [string, StatefulControl] => [
      keyOf(item, `details:${i}`),
      item,
    ]),
    ...selects.map((select, i): [string, StatefulControl] => [
      keyOf(select, `select:${i}`),
      select,
    ]),
  ];
}

/** Reads the checked, open, or selected-option state of every control in `doc`. */
export function readVisualViewState(doc: Document): VisualViewState {
  const state: VisualViewState = {};
  for (const [key, element] of statefulControls(doc)) {
    if (isSelect(element)) state[key] = element.selectedIndex;
    else state[key] = "open" in element ? element.open : element.checked;
  }
  return state;
}

/**
 * Writes `state` into `doc`. Setting properties (`checked`, `open`, and
 * `selectedIndex`) fires no `change` event, and a `toggle` only re-reads equal
 * state, so syncing two frames cannot loop.
 */
export function applyVisualViewState(doc: Document, state: VisualViewState) {
  const controls = statefulControls(doc);
  // Selects hold a number, so they are set in their own pass before the flags.
  for (const [key, element] of controls) {
    const value = state[key];
    if (typeof value !== "number" || !isSelect(element)) continue;
    if (element.selectedIndex !== value) element.selectedIndex = value;
  }
  // Unchecks first so checking a radio is never undone by a later sibling.
  for (const checked of [false, true]) {
    for (const [key, element] of controls) {
      if (isSelect(element) || state[key] !== checked) continue;
      if ("open" in element) {
        if (element.open !== checked) element.open = checked;
      } else if (element.checked !== checked) {
        element.checked = checked;
      }
    }
  }
}

/** The stable id of the checked trusted panel, e.g. `cc-panel-1`, if any. */
export function activePanelId(state: VisualViewState): string | null {
  // Only a `true` flag counts; a select's option index may also sit under a panel id.
  const key = Object.keys(state).find(
    (k) => k.startsWith(`#${PANEL_ID_PREFIX}`) && state[k] === true,
  );
  return key ? key.slice(1) : null;
}

/**
 * Keeps one view state for every frame showing the same visual, so the inline
 * card and its Expand dialog show the same tab and open sections both ways.
 * Call `connect` from each frame's load event. The state lives in the host,
 * not the frame, so a dialog frame that unmounts on close loses nothing.
 */
export function useVisualViewState() {
  // State per frame srcdoc, since keys only match within one document. One
  // host can so share state for several bodies, e.g. the panels of a card.
  const statesRef = useRef(new Map<string, VisualViewState>());
  const framesRef = useRef(new Set<HTMLIFrameElement>());
  const connectedRef = useRef(new WeakSet<Document>());
  // Host-owned stable id of the active trusted panel (`cc-panel-<n>`). The
  // ref mirrors the state for load and event handlers.
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const activePanelRef = useRef<string | null>(null);
  const choosePanel = useCallback((id: string) => {
    activePanelRef.current = id;
    setActivePanel(id);
  }, []);

  // Only a frame with panel radios moves the active panel; other bodies, such
  // as host-drawn tabs' panels, leave the host's choice alone.
  const store = useCallback(
    (source: string, values: VisualViewState) => {
      statesRef.current.set(source, values);
      const id = activePanelId(values);
      if (id) choosePanel(id);
    },
    [choosePanel],
  );

  const connect = useCallback(
    (frame: HTMLIFrameElement) => {
      const doc = frame.contentDocument;
      if (!doc) return;
      const source = frame.srcdoc;
      const frames = framesRef.current;
      frames.add(frame);

      // The host state wins over the HTML defaults; a new visual starts from
      // its own. Merging keeps controls an earlier empty load never reported.
      const saved = statesRef.current.get(source);
      const values = { ...readVisualViewState(doc), ...saved };
      // A panel chosen by the host also wins in a known document with its
      // radio; a new visual starts from its own default panel.
      const hostPanel = activePanelRef.current;
      if (saved && hostPanel && `#${hostPanel}` in values) {
        for (const key of Object.keys(values)) {
          if (key.startsWith(`#${PANEL_ID_PREFIX}`)) values[key] = false;
        }
        values[`#${hostPanel}`] = true;
      }
      applyVisualViewState(doc, values);
      store(source, values);

      if (connectedRef.current.has(doc)) return;
      connectedRef.current.add(doc);
      // Copies a user change in this frame to the host and the other frames.
      const sync = () => {
        if (frame.contentDocument !== doc) return;
        const values = readVisualViewState(doc);
        store(source, values);
        for (const other of frames) {
          if (!other.isConnected) frames.delete(other);
          else if (other !== frame && other.srcdoc === source) {
            const otherDoc = other.contentDocument;
            if (otherDoc) applyVisualViewState(otherDoc, values);
          }
        }
      };
      doc.addEventListener("change", sync);
      // `toggle` does not bubble; capture still sees it.
      doc.addEventListener("toggle", sync, true);
    },
    [store],
  );

  /**
   * Selects a trusted panel by its stable id, for tabs drawn by the host
   * instead of inside the HTML. Frames with a matching radio follow it.
   */
  const selectPanel = useCallback(
    (id: string) => {
      choosePanel(id);
      for (const frame of framesRef.current) {
        const doc = frame.isConnected ? frame.contentDocument : null;
        const radio = doc?.getElementById(id);
        if (!doc || !(radio && "checked" in radio)) continue;
        (radio as HTMLInputElement).checked = true;
        store(frame.srcdoc, readVisualViewState(doc));
      }
    },
    [choosePanel, store],
  );

  return { activePanel, connect, selectPanel };
}
