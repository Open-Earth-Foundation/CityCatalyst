/**
 * Detects AI visuals that would show an empty card after sanitizing.
 *
 * The backend (climate-advisor/service/app/utils/visual_html.py) rejects the
 * obvious cases before the tool reports success; these checks cover what
 * reaches the chat anyway, e.g. older history or content hidden by CSS.
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

/**
 * Whether a sanitized visual document has any text or drawing. Parses only;
 * DOMParser never runs scripts, and the document is already sanitized.
 */
export function hasVisualContent(sandboxedDocument: string): boolean {
  if (!sandboxedDocument) return false;
  const doc = new DOMParser().parseFromString(sandboxedDocument, "text/html");
  return hasBodyContent(doc.body);
}

// A CSS `content:` value that draws text, e.g. `::after{content:"62 mm"}`.
const CSS_CONTENT_TEXT =
  /content\s*:\s*(?!none\b|normal\b|""|'')("|'|attr\(|counter)/i;
// An inline box painted by its background, e.g. a CSS bar `width:62%`.
const INLINE_BACKGROUND =
  /(^|;)\s*background(-color|-image)?\s*:\s*(?!transparent|none|rgba\([^)]*,\s*0\s*\))/i;
const INLINE_SIZE = /(^|;)\s*(width|height)\s*:/i;

// A stylesheet rule that paints a box: a non-transparent background colour or
// a gradient, e.g. `.cell{background:#087f8c}` on empty waffle cells.
const CSS_PAINT_RULE =
  /background(-color|-image)?\s*:\s*(?!transparent|none|rgba\([^)]*,\s*0\s*\)|inherit|initial|unset)[^;}]/i;
// Caps how many stylesheet selectors are tried against the body.
const MAX_PAINT_SELECTORS = 200;
// Painted boxes that make a drawing (bars, cells). One painted box is more
// often an empty container a script was meant to fill.
const MIN_PAINTED_MARKS = 3;

/** Whether stylesheet rules paint backgrounds on several elements in `body`. */
function hasStylesheetPaint(body: HTMLElement, css: string): boolean {
  let tried = 0;
  const painted = new Set<Element>();
  for (const [, selector, declarations] of css.matchAll(
    /([^{}@]+)\{([^{}]*)\}/g,
  )) {
    if (!CSS_PAINT_RULE.test(declarations)) continue;
    for (const part of selector.split(",")) {
      // The box itself, not its pseudo-elements; html/body only fill the card.
      const target = part.replace(/::?(before|after)\b.*$/, "").trim();
      if (!target || /^(html|body|:root|\*)$/i.test(target)) continue;
      if (++tried > MAX_PAINT_SELECTORS) return false;
      try {
        body.querySelectorAll(target).forEach((el) => painted.add(el));
        if (painted.size >= MIN_PAINTED_MARKS) return true;
      } catch {
        // An unsupported selector says nothing either way.
      }
    }
  }
  return false;
}

/** Whether CSS alone draws something: pseudo-element text or painted boxes. */
function hasCssDrawing(body: HTMLElement): boolean {
  const doc = body.ownerDocument;
  // The host's own styles (theme, layout) draw nothing by themselves.
  const css = Array.from(
    doc.querySelectorAll(
      "style:not([data-cc-theme],[data-cc-host],[data-cc-layout])",
    ),
    (style) => (style.textContent ?? "").replace(/\/\*[\s\S]*?\*\//g, ""),
  ).join("\n");
  if (CSS_CONTENT_TEXT.test(css)) return true;
  if (
    Array.from(body.querySelectorAll("[style]")).some((element) => {
      const style = element.getAttribute("style") ?? "";
      return INLINE_BACKGROUND.test(style) && INLINE_SIZE.test(style);
    })
  ) {
    return true;
  }
  return hasStylesheetPaint(body, css);
}

/** Same check on an already parsed, sanitized body, without parsing again. */
export function hasBodyContent(body: HTMLElement | null): boolean {
  if (!body) return false;
  return (
    visibleTextNodes(body).length > 0 ||
    body.querySelector(DRAWN_ELEMENTS) !== null ||
    hasCssDrawing(body)
  );
}

// A background that paints nothing: the keyword or alpha 0.
const TRANSPARENT_BACKGROUND =
  /^(transparent|rgba?\([^)]*[,/]\s*0(\.0*)?\s*\))$/;
// Caps the scan for painted boxes, so a huge document stays cheap.
const MAX_PAINT_SCAN = 400;

/** Whether a laid-out element paints a background (colour or gradient). */
function paintsBackground(element: Element, win: Window): boolean {
  const style = win.getComputedStyle(element);
  return (
    !TRANSPARENT_BACKGROUND.test(style.backgroundColor) ||
    (!!style.backgroundImage && style.backgroundImage !== "none")
  );
}

/** Whether a laid-out element draws text with ::before or ::after. */
function hasPseudoText(element: Element, win: Window): boolean {
  return ["::before", "::after"].some((pseudo) => {
    const content = win.getComputedStyle(element, pseudo).content;
    return !!content && !/^(none|normal|""|'')$/.test(content);
  });
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
  if (
    Array.from(doc.body.querySelectorAll(DRAWN_ELEMENTS)).some((element) =>
      isDrawn(element, element.getBoundingClientRect()),
    )
  ) {
    return true;
  }
  // CSS-only marks: values in ::before/::after, or several painted boxes
  // (bars, cells). One painted box alone is usually an empty container.
  const win = doc.defaultView;
  if (!win) return false;
  let painted = 0;
  for (const element of Array.from(doc.body.getElementsByTagName("*")).slice(
    0,
    MAX_PAINT_SCAN,
  )) {
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0) || !isDrawn(element, rect)) {
      continue;
    }
    if (hasPseudoText(element, win)) return true;
    if (paintsBackground(element, win) && ++painted >= MIN_PAINTED_MARKS) {
      return true;
    }
  }
  return false;
}
