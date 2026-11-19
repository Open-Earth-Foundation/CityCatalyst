/**
 * Detects AI visuals that would show an empty card after sanitizing.
 *
 * The backend (climate-advisor/service/app/utils/visual_html.py) rejects the
 * obvious cases before the tool reports success; these checks cover what
 * reaches the chat anyway, e.g. older history or content hidden by CSS.
 */

// Text inside these is never drawn.
const HIDDEN_TEXT_PARENTS = "style, title, desc, metadata, script, template";
// Elements that draw without any text. SVG <image>/<use> are absent because
// the sanitizer strips their href; data: images are the only ones the CSP loads.
const DRAWN_ELEMENTS = [
  "svg path",
  "svg rect",
  "svg circle",
  "svg ellipse",
  "svg line",
  "svg polyline",
  "svg polygon",
  'img[src^="data:image/" i]',
  "hr",
  // A <details> draws its marker and default "Details" label without text nodes.
  "details",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "meter",
  "progress",
].join(", ");

/** Text nodes that are not inside an element that never draws its text. */
function visibleTextNodes(body: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = body.ownerDocument.createTreeWalker(
    body,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      node.textContent?.trim() &&
      !node.parentElement?.closest(HIDDEN_TEXT_PARENTS)
    ) {
      nodes.push(node as Text);
    }
  }
  return nodes;
}

/**
 * Whether a sanitized visual document has any text or drawing. Parses only;
 * DOMParser never runs scripts, and the document is already sanitized.
 */
export function hasVisualContent(sandboxedDocument: string): boolean {
  if (!sandboxedDocument) return false;
  const doc = new DOMParser().parseFromString(sandboxedDocument, "text/html");
  return hasBodyContent(doc.body);
}

/** Same check on an already parsed, sanitized body, without parsing again. */
export function hasBodyContent(body: HTMLElement | null): boolean {
  if (!body) return false;
  return (
    visibleTextNodes(body).length > 0 ||
    body.querySelector(DRAWN_ELEMENTS) !== null
  );
}

function isDrawn(element: Element, rect: DOMRect): boolean {
  if (rect.width <= 0 && rect.height <= 0) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.visibility !== "hidden" && style?.opacity !== "0";
}

/**
 * Whether a loaded visual frame shows anything, or null when the browser has
 * not laid it out (offscreen, no layout engine) and the answer is unknown.
 * Catches content the static check cannot, e.g. everything set to display:none.
 */
export function hasRenderedVisualContent(doc: Document | null): boolean | null {
  if (!doc?.body) return null;
  if (!(doc.documentElement.getBoundingClientRect().width > 0)) return null;

  const range = doc.createRange();
  for (const node of visibleTextNodes(doc.body)) {
    range.selectNodeContents(node);
    if (
      node.parentElement &&
      isDrawn(node.parentElement, range.getBoundingClientRect())
    ) {
      return true;
    }
  }
  // Lines are zero-width or zero-height boxes, so either side counts.
  return Array.from(doc.body.querySelectorAll(DRAWN_ELEMENTS)).some((element) =>
    isDrawn(element, element.getBoundingClientRect()),
  );
}
