import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const INLINE_DEFAULT_HEIGHT = 420;
const INLINE_MIN_HEIGHT = 120;
const INLINE_MAX_HEIGHT = 720;

// Only body's direct children are watched, and at most this many, so a huge
// model document cannot make the card track thousands of elements.
const MAX_OBSERVED_CHILDREN = 50;

// A height change that triggers another within this window counts as the same
// burst. Content whose size follows the frame (vh units, a scrollbar toggling
// width) could otherwise resize forever; a burst stops after this many changes.
const BURST_GAP_MS = 100;
const MAX_BURST_CHANGES = 20;

/**
 * Fits a same-origin, script-free visual iframe to its content, between the
 * card's min and max height.
 *
 * Measures on load and whenever the frame or its loaded document changes size,
 * so opening or closing a <details> section grows or shrinks the card.
 * Returns the height to apply and the iframe's onLoad handler.
 */
export function useVisualFrameHeight(
  frameRef: RefObject<HTMLIFrameElement | null>,
  onHeightChange?: () => void,
) {
  const [height, setHeight] = useState(INLINE_DEFAULT_HEIGHT);
  const heightRef = useRef(INLINE_DEFAULT_HEIGHT);
  const burstRef = useRef({ last: 0, changes: 0 });
  const innerObserverRef = useRef<ResizeObserver | null>(null);

  // After the resize is laid out, so a following chat can re-pin to the bottom.
  useLayoutEffect(() => onHeightChange?.(), [height, onHeightChange]);

  // Takes max() for html/body pinned to 100% and adds any horizontal scrollbar.
  const measure = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame?.contentWindow || !doc?.body) return;
    const root = doc.documentElement;
    const reported =
      Math.max(root.getBoundingClientRect().height, doc.body.scrollHeight) +
      frame.contentWindow.innerHeight -
      root.clientHeight;
    // Throttled offscreen frames report 0; keep the current height then.
    if (reported <= 0) return;
    const next = Math.min(
      INLINE_MAX_HEIGHT,
      Math.max(INLINE_MIN_HEIGHT, Math.ceil(reported)),
    );
    if (next === heightRef.current) return;

    // Loop guard: stop following a resize chain that never settles.
    const now = performance.now();
    const burst = burstRef.current;
    burst.changes = now - burst.last < BURST_GAP_MS ? burst.changes + 1 : 1;
    burst.last = now;
    if (burst.changes > MAX_BURST_CHANGES) return;

    heightRef.current = next;
    setHeight(next);
  }, [frameRef]);

  // Each load is a new document: drop the old observer and watch the new
  // root, body and its direct children (they change size when body is pinned).
  const onLoad = useCallback(() => {
    innerObserverRef.current?.disconnect();
    innerObserverRef.current = null;
    const doc = frameRef.current?.contentDocument;
    if (doc?.body) {
      const observer = new ResizeObserver(measure);
      observer.observe(doc.documentElement);
      observer.observe(doc.body);
      Array.from(doc.body.children)
        .slice(0, MAX_OBSERVED_CHILDREN)
        .forEach((child) => observer.observe(child));
      innerObserverRef.current = observer;
    }
    measure();
  }, [frameRef, measure]);

  // The frame itself changes size when the chat column changes width.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => {
      observer.disconnect();
      innerObserverRef.current?.disconnect();
      innerObserverRef.current = null;
    };
  }, [frameRef, measure]);

  return { height, onLoad };
}
