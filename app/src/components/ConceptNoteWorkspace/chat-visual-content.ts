/**
 * Detects AI visuals that would show an empty card after sanitizing.
 *
 * The backend (climate-advisor/service/app/utils/visual_html.py) rejects the
 * obvious cases before the tool reports success; this check covers what
 * reaches the chat anyway, e.g. older history.
 */

// Text inside these is never drawn.
const HIDDEN_TEXT_PARENTS = "style, title, desc, metadata, script, template";
// Elements that draw without any text. SVG <image> is absent because the
// sanitizer strips its href; data: images are the only ones the CSP loads.
// <use> keeps only a same-document href, see chat-visual-frame.tsx.
const DRAWN_ELEMENTS = [
  'svg use[href^="#"]',
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

// A CSS `content:` value that draws text, e.g. `::after{content:"62 mm"}`.
const CSS_CONTENT_TEXT =
  /content\s*:\s*(?!none\b|normal\b|""|'')("|'|attr\(|counter)/i;
// An inline box painted by its background, e.g. a CSS bar `width:62%`.
const INLINE_BACKGROUND =
  /(^|;)\s*background(-color|-image)?\s*:\s*(?!transparent|none|rgba\([^)]*,\s*0\s*\))/i;
const INLINE_SIZE = /(^|;)\s*(width|height)\s*:/i;

/** Whether CSS alone draws something: pseudo-element text or inline-painted boxes. */
function hasCssDrawing(body: HTMLElement): boolean {
  const doc = body.ownerDocument;
  // The host's own styles (theme, table scroll) draw nothing by themselves.
  const css = Array.from(
    doc.querySelectorAll("style:not([data-cc-theme],[data-cc-host])"),
    (style) => (style.textContent ?? "").replace(/\/\*[\s\S]*?\*\//g, ""),
  ).join("\n");
  if (CSS_CONTENT_TEXT.test(css)) return true;
  return Array.from(body.querySelectorAll("[style]")).some((element) => {
    const style = element.getAttribute("style") ?? "";
    return INLINE_BACKGROUND.test(style) && INLINE_SIZE.test(style);
  });
}

/** Whether a sanitized document body has any text or drawing. */
export function hasBodyContent(body: HTMLElement | null): boolean {
  if (!body) return false;
  return (
    visibleTextNodes(body).length > 0 ||
    body.querySelector(DRAWN_ELEMENTS) !== null ||
    hasCssDrawing(body)
  );
}
