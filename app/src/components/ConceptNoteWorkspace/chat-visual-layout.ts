import { hasRenderedVisualContent } from "./chat-visual-content";

/**
 * Layout fixes for AI-generated chat visuals. They run on the document that
 * DOMPurify has already sanitized, so the model's HTML is parsed only once and
 * only trusted host markup (wrappers, a toggle with plain text, one style) is
 * added afterwards.
 *
 * - Every table scrolls horizontally inside its own box, so a wide table no
 *   longer pushes the whole frame sideways. Headers and unit columns scroll
 *   with the data, so they stay aligned. A table the model already wrapped in
 *   a horizontal scroller is left in that scroller, not wrapped twice. Each
 *   scroll box gets a hint line after it, shown only while columns are hidden.
 * - A long ranking shows its leading entries first. The remaining entries stay
 *   in the same answer, unchanged, behind a native <details> toggle. Without
 *   CSS :has() support every entry simply stays visible.
 *
 * Only a clear ranking is collapsed: a "Rank" column numbered from 1, or a
 * ranking label (caption, header or the line just above, e.g. "Districts
 * ranked by total") together with values in ranked order. Anything else, such
 * as a monthly time series or numbered steps, keeps every entry visible.
 *
 * Nothing is removed, reordered or rewritten: values, units and order are the
 * model's.
 */

/** Entries shown before the toggle in a collapsed ranking. */
export const VISUAL_LEADING_ENTRIES = 10;
/** Collapse only rankings longer than this; shorter ones are ordinary content. */
export const VISUAL_LONG_RANKING_MIN = 21;

/** Toggle and hint texts in the user's language, e.g. "Show all 60 entries". */
export interface VisualLayoutLabels {
  showAll: (count: number) => string;
  showFirst: (count: number) => string;
  /** Shown under a table whose columns are cut off, e.g. "Scroll sideways …". */
  scrollHint: string;
}

const SCROLL_CLASS = "cc-visual-table-scroll";
const HINT_CLASS = "cc-visual-scroll-hint";
const LONG_CLASS = "cc-visual-long";
const RANKED_CLASS = "cc-visual-ranked";
const TOGGLE_CLASS = "cc-visual-long-toggle";
// Set by watchTableScroll on a scroll box whose table fits its width.
const FITS_CLASS = "cc-fits";

// Hidden entries are `display:none` only while the toggle is closed; the
// !important rules win over model CSS such as `tr{display:grid}`.
const LAYOUT_CSS = [
  `.${SCROLL_CLASS}{overflow-x:auto!important;max-width:100%!important;min-width:0}`,
  // A box that scrolls on one axis scrolls on both, so a sticky header would stick
  // to it instead of the page. Once measured as fitting, it stops scrolling.
  `.${SCROLL_CLASS}.${FITS_CLASS}{overflow:visible!important}`,
  `.${LONG_CLASS}:has(>.${TOGGLE_CLASS}:not([open])) table.${RANKED_CLASS}>tbody>tr:nth-child(n+${VISUAL_LEADING_ENTRIES + 1}),`,
  `.${LONG_CLASS}:has(>.${TOGGLE_CLASS}:not([open]))>.${RANKED_CLASS}>li:nth-child(n+${VISUAL_LEADING_ENTRIES + 1}){display:none!important}`,
  `.${TOGGLE_CLASS}>summary{cursor:pointer;padding:6px 0;font-weight:600}`,
  `.${TOGGLE_CLASS}[open]>summary>.cc-more,.${TOGGLE_CLASS}:not([open])>summary>.cc-less{display:none}`,
  // The hint shows only while watchTableScroll marks the box as overflowing.
  `.${HINT_CLASS}{display:none;margin:4px 0 0;font:12px/1.4 system-ui,sans-serif;color:#5b6472}`,
  `.${SCROLL_CLASS}.cc-overflow+.${HINT_CLASS}{display:block}`,
  // Fades mark the side where columns are hidden, since touch screens hide scrollbars.
  `.${SCROLL_CLASS}.cc-more-right{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 40px),transparent)}`,
  `.${SCROLL_CLASS}.cc-more-left{-webkit-mask-image:linear-gradient(to left,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(to left,#000 calc(100% - 40px),transparent)}`,
  `.${SCROLL_CLASS}.cc-more-left.cc-more-right{-webkit-mask-image:linear-gradient(to right,transparent,#000 40px,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(to right,transparent,#000 40px,#000 calc(100% - 40px),transparent)}`,
].join("");

// Words that say the entries are a ranking: "ranked by total", "Top 25",
// "largest first". Plain "highest" is too common in ordinary prose to count.
const RANKING_LABEL =
  /\brank(s|ed|ing|ings)?\b|\btop[\s-]?\d+\b|\bleaderboard\b|\bleague table\b|\b(highest|largest|lowest|smallest|biggest)\b[^.;:]{0,30}\bfirst\b/i;
// A column header that names the rank itself.
const RANK_HEADER = /^(rank|ranking|position|place)$/i;
// Labels longer than this are prose, not a heading for the next block.
const MAX_LABEL_LENGTH = 200;

/** The first number in a cell or item, e.g. 1234.5 from "1,234.5 ktCO₂e". */
function firstNumber(text: string): number | null {
  const match = /[-−]?\d+(?:[.,]\d+)*/.exec(text);
  if (!match) return null;
  const plain = match[0]
    .replace("−", "-")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const value = Number.parseFloat(plain);
  return Number.isNaN(value) ? null : value;
}

/** The last number in an item, e.g. 54 from "D07 · 54 ktCO₂e". */
function lastNumber(text: string): number | null {
  const all = text.match(/[-−]?\d+(?:[.,]\d+)*/g);
  return all ? firstNumber(all[all.length - 1]) : null;
}

/**
 * Values sorted one way (ties allowed) and mostly distinct, as in a ranking.
 * The distinct share rules out columns like a year repeated for every month.
 */
function isRankedOrder(values: (number | null)[]): boolean {
  if (values.some((value) => value === null)) return false;
  const numbers = values as number[];
  const ascending = numbers.every((v, i) => i === 0 || v >= numbers[i - 1]);
  const descending = numbers.every((v, i) => i === 0 || v <= numbers[i - 1]);
  return (
    (ascending || descending) && new Set(numbers).size * 2 >= numbers.length
  );
}

/** Ranks 1, 2, 3 … with shared ranks allowed (1, 2, 2, 4). */
function isRankColumn(values: (number | null)[]): boolean {
  return values.every(
    (v, i) =>
      v !== null &&
      Number.isInteger(v) &&
      (i === 0 ? v === 1 : v === values[i - 1] || v === i + 1),
  );
}

const textOf = (element: Element | null | undefined) =>
  element?.textContent?.trim() ?? "";

/**
 * The block's own label: aria-label/title, plus the nearest element just
 * before it (or before its wrapper), e.g. a heading or a short <p>.
 */
function nearbyLabel(block: Element): string {
  const own = [block.getAttribute("aria-label"), block.getAttribute("title")];
  let node: Element | null = block;
  // Climb at most two wrappers, e.g. the model's scroller <div>.
  for (let depth = 0; node && depth < 3; depth++) {
    const previous = node.previousElementSibling;
    if (previous) {
      const text = textOf(previous);
      if (text.length <= MAX_LABEL_LENGTH) own.push(text);
      break;
    }
    node = node.parentElement;
    if (!node || node.tagName === "BODY") break;
  }
  return own.filter(Boolean).join(" ");
}

/**
 * Body rows of a table that is clearly a ranking, or [] when unclear.
 * A body row of only <th> cells is a header without <thead>, not an entry.
 */
function rankingRows(table: HTMLTableElement): HTMLTableRowElement[] {
  if (table.tBodies.length !== 1) return [];
  const rows = Array.from(table.tBodies[0].rows);
  const bodyHeader =
    rows[0] && Array.from(rows[0].cells).every((c) => c.tagName === "TH")
      ? rows.shift()
      : undefined;
  if (rows.length < VISUAL_LONG_RANKING_MIN) return [];

  // Every row has the same cells, nothing merged.
  const shape = (row: HTMLTableRowElement) =>
    Array.from(row.cells, (cell) =>
      cell.colSpan === 1 && cell.rowSpan === 1 ? cell.tagName : "span",
    ).join();
  const first = shape(rows[0]);
  if (first.includes("span") || !rows.every((row) => shape(row) === first)) {
    return [];
  }

  const headerRow =
    table.tHead?.rows[table.tHead.rows.length - 1] ?? bodyHeader;
  const headers = headerRow ? Array.from(headerRow.cells, textOf) : [];
  const columns = Array.from(rows[0].cells, (_, index) =>
    rows.map((row) => textOf(row.cells[index])),
  );

  // Strong signal: a "Rank" column numbered from 1.
  if (
    columns.some(
      (column, index) =>
        RANK_HEADER.test(headers[index] ?? "") &&
        isRankColumn(column.map(firstNumber)),
    )
  ) {
    return rows;
  }

  // Otherwise a ranking label plus a column in ranked order.
  const label = [
    textOf(table.caption),
    headers.join(" "),
    nearbyLabel(table),
  ].join(" ");
  const ordered = columns.some((column) =>
    isRankedOrder(column.map(firstNumber)),
  );
  return RANKING_LABEL.test(label) && ordered ? rows : [];
}

/** Items of a flat list that is clearly a ranking, or [] when unclear. */
function rankingItems(list: HTMLOListElement | HTMLUListElement): Element[] {
  // Reversed numbering would shift while entries are hidden.
  if (list.hasAttribute("reversed")) return [];
  const items = Array.from(list.children);
  if (
    items.length < VISUAL_LONG_RANKING_MIN ||
    !items.every((i) => i.tagName === "LI" && !i.querySelector("ol,ul,table"))
  ) {
    return [];
  }
  if (!RANKING_LABEL.test(nearbyLabel(list))) return [];
  // A labelled <ol> numbers the ranks itself; a <ul> needs ordered values.
  const ordered =
    list.tagName === "OL" ||
    isRankedOrder(items.map((item) => lastNumber(textOf(item))));
  return ordered ? items : [];
}

/** Wraps `element` in a new `<div class>` at the same place in the tree. */
function wrap(element: Element, className: string): HTMLDivElement {
  const wrapper = element.ownerDocument.createElement("div");
  wrapper.className = className;
  element.replaceWith(wrapper);
  wrapper.append(element);
  return wrapper;
}

/** Adds the "Show all N" / "Show first 10" toggle after a long ranking. */
function addToggle(block: Element, count: number, labels: VisualLayoutLabels) {
  const doc = block.ownerDocument;
  const toggle = doc.createElement("details");
  toggle.className = TOGGLE_CLASS;
  const summary = doc.createElement("summary");
  const more = doc.createElement("span");
  more.className = "cc-more";
  more.textContent = labels.showAll(count);
  const less = doc.createElement("span");
  less.className = "cc-less";
  less.textContent = labels.showFirst(VISUAL_LEADING_ENTRIES);
  summary.append(more, less);
  toggle.append(summary);
  block.append(toggle);
}

const SCROLL_DECLARATION = /overflow(-x)?\s*:\s*(auto|scroll)/i;

/** Selectors of the model's own CSS rules that scroll horizontally. */
function scrollSelectors(doc: Document): string[] {
  const css = Array.from(doc.querySelectorAll("style"), textOf)
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors: string[] = [];
  // Innermost `selector{declarations}` pairs; @media wrappers are skipped over.
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (SCROLL_DECLARATION.test(body)) {
      selectors.push(...selector.split(",").map((s) => s.trim()));
    }
  }
  return selectors;
}

/** The model's own horizontal scroller around `table`, if any. */
function existingScroller(table: Element, selectors: string[]): Element | null {
  for (
    let element = table.parentElement;
    element && element.tagName !== "BODY";
    element = element.parentElement
  ) {
    const scrolls =
      SCROLL_DECLARATION.test(element.getAttribute("style") ?? "") ||
      selectors.some((selector) => {
        try {
          return element!.matches(selector);
        } catch {
          return false; // e.g. a pseudo-element selector
        }
      });
    if (scrolls) return element;
  }
  return null;
}

// Nested tables and SVG islands keep their own layout.
const isUntouchable = (element: Element) =>
  !!element.parentElement?.closest("foreignObject,table");

/**
 * Adapts a sanitized visual document in place: scrollable tables and
 * collapsible long rankings. Returns whether anything changed.
 */
export function adaptVisualLayout(
  doc: Document,
  labels: VisualLayoutLabels,
): boolean {
  const tables = Array.from(doc.querySelectorAll("table"));
  const lists = Array.from(
    doc.querySelectorAll<HTMLOListElement | HTMLUListElement>("ol,ul"),
  );
  if (!tables.length && !lists.length) return false;
  const selectors = tables.length ? scrollSelectors(doc) : [];
  let changed = false;

  for (const table of tables) {
    if (isUntouchable(table)) continue;
    // Wide tables: horizontal scroll stays inside the table's own box,
    // reusing the model's scroller when it already has one.
    const scroller = existingScroller(table, selectors);
    let block: Element = table;
    if (!scroller) {
      block = wrap(table, SCROLL_CLASS);
      changed = true;
    } else {
      // Marked too, so the fade and hint also cover the model's scroller.
      scroller.classList.add(SCROLL_CLASS);
      if (
        scroller.children.length === 1 &&
        scroller.firstElementChild === table
      ) {
        block = scroller;
      }
    }

    // Long rankings, unless the model already put them in its own disclosure.
    if (table.parentElement?.closest("details")) continue;
    const rows = rankingRows(table);
    if (!rows.length) continue;
    // Promote a body header row to <thead> so it is never hidden or counted.
    if (rows[0] !== table.tBodies[0].rows[0] && !table.tHead) {
      table.createTHead().append(table.tBodies[0].rows[0]);
    }
    table.classList.add(RANKED_CLASS);
    addToggle(wrap(block, LONG_CLASS), rows.length, labels);
    changed = true;
  }

  // Long ranked lists: same leading-entries toggle, numbering is untouched.
  for (const list of lists) {
    // Model-authored disclosures and nested sub-lists are left as written.
    if (isUntouchable(list) || list.closest("details,li")) continue;
    const items = rankingItems(list);
    if (!items.length) continue;
    list.classList.add(RANKED_CLASS);
    addToggle(wrap(list, LONG_CLASS), items.length, labels);
    changed = true;
  }

  // Last, so the hint follows any ranking wrapper; one per scroll box.
  for (const box of Array.from(doc.querySelectorAll(`.${SCROLL_CLASS}`))) {
    const hint = doc.createElement("p");
    hint.className = HINT_CLASS;
    hint.textContent = labels.scrollHint;
    box.after(hint);
    changed = true;
  }

  if (changed) {
    const style = doc.createElement("style");
    style.setAttribute("data-cc-layout", "");
    style.textContent = LAYOUT_CSS;
    doc.head.append(style);
  }
  return changed;
}

/**
 * Theme variables every visual can use, as in Visualize: series colours and the
 * app's text, border and surface colours. These are the blue theme's values;
 * `syncHostTheme` replaces them with the organization theme once the frame loads.
 */
export const VISUAL_THEME_DEFAULTS: Record<string, string> = {
  "--chart-1": "#2351DC",
  "--chart-2": "#E07B24",
  "--chart-3": "#149037",
  "--chart-4": "#8A3FD1",
  "--chart-5": "#C4314B",
  "--chart-6": "#5B6472",
  "--foreground": "#00001F",
  "--muted-foreground": "#4B4C63",
  "--border": "#D7D8FA",
  "--background": "#FFFFFF",
  "--card": "#FFFFFF",
  "--muted": "#E8EAFB",
  // The app's fonts are not loaded in the frame (CSP allows data: fonts only),
  // so this names Open Sans for systems that have it and falls back to a sans.
  "--font-sans":
    '"Open Sans",system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
};

// Chakra variables of the app theme that the visual variables follow.
const HOST_THEME_SOURCES: Record<string, string> = {
  "--chart-1": "--chakra-colors-interactive-secondary",
  "--foreground": "--chakra-colors-content-primary",
  "--muted-foreground": "--chakra-colors-content-tertiary",
  "--border": "--chakra-colors-border-neutral",
  "--background": "--chakra-colors-base-light",
  "--card": "--chakra-colors-base-light",
  "--muted": "--chakra-colors-background-neutral",
};

const themeCss = (values: Record<string, string>) =>
  `:root{color-scheme:light;${Object.entries(values)
    .map(([name, value]) => `${name}:${value}`)
    .join(";")}}`;

// Before the model's CSS, so any rule of its own wins. Without it a page with
// no font-family is drawn in the browser's serif default.
const THEME_BASE_CSS =
  "body{font-family:var(--font-sans);color:var(--foreground)}";

// After the model's CSS. Labels a few units past the viewBox edge are drawn,
// not cut; the content inset keeps them inside the card. Title duplicates hide.
const HOST_CSS =
  "svg:not(svg svg){overflow:visible}[data-cc-duplicate-title]{display:none!important}";

// Media features for the OS colour scheme; see addHostStyles.
const PREFERS_DARK = /\(\s*prefers-color-scheme\s*:\s*dark\s*\)/gi;
const PREFERS_LIGHT = /\(\s*prefers-color-scheme\s*:\s*light\s*\)/gi;

const normalizeTitle = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s.:;!?]+$/, "")
    .trim();

/**
 * The heading that opens the page when it repeats one of `titles` (the card
 * title, or for a panel also its tab label), or null. A heading that is the
 * page's only text stays: hiding it would leave nothing to read.
 */
function duplicateTitleHeading(
  doc: Document,
  titles: string[],
): Element | null {
  const wanted = new Set(titles.map(normalizeTitle).filter(Boolean));
  if (!wanted.size || !doc.body) return null;
  let heading: Element | null = null;
  let otherText = false;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (parent?.closest("style,script,title,template")) continue;
    if (heading) {
      if (!heading.contains(node)) {
        otherText = true;
        break;
      }
      continue;
    }
    // Only the first visible text decides: a heading further down is content.
    const opening = parent?.closest("h1,h2,h3,h4");
    if (
      !opening ||
      opening.closest("svg,table") ||
      !wanted.has(normalizeTitle(opening.textContent ?? ""))
    ) {
      return null;
    }
    heading = opening;
  }
  // A drawing that paints something: an empty <svg> or a canvas does not.
  const drawing = doc.body.querySelector(
    "svg :is(path,rect,circle,ellipse,line,polyline,polygon,use),img,table,meter,progress",
  );
  return heading && (otherText || drawing) ? heading : null;
}

/**
 * Adds the host styles every visual gets: theme variables and a sans default
 * before the model's CSS, and the SVG overflow and duplicate-title rules after
 * it. The model's light/dark media rules always resolve to light. A first heading that repeats the card `title` is hidden, because the card
 * and the Expand dialog already show the title. Runs on the sanitized document.
 */
export function addHostStyles(
  doc: Document,
  titles: string | string[] = [],
): void {
  // The card is always light, but a frame's prefers-color-scheme follows the
  // OS (Chromium ignores the iframe's color-scheme). A model's dark-mode rule
  // would draw a dark card in the light chat, so it never matches here.
  for (const style of Array.from(doc.querySelectorAll("style"))) {
    const css = style.textContent ?? "";
    if (/prefers-color-scheme/i.test(css)) {
      style.textContent = css
        .replace(PREFERS_DARK, "(width < 0px)")
        .replace(PREFERS_LIGHT, "(width >= 0px)");
    }
  }

  const theme = doc.createElement("style");
  theme.setAttribute("data-cc-theme", "");
  theme.textContent = themeCss(VISUAL_THEME_DEFAULTS) + THEME_BASE_CSS;
  doc.head.prepend(theme);

  const host = doc.createElement("style");
  host.setAttribute("data-cc-host", "");
  host.textContent = HOST_CSS;
  doc.head.append(host);

  duplicateTitleHeading(
    doc,
    typeof titles === "string" ? [titles] : titles,
  )?.setAttribute("data-cc-duplicate-title", "");
}

/**
 * Shows a hidden duplicate title again when, once laid out, nothing else on
 * the page is visible (the remaining text was hidden by CSS, for example), so
 * hiding it never leaves an empty card. Runs on each loaded frame.
 */
export function restoreLoneDuplicateTitle(doc: Document | null): void {
  const heading = doc?.querySelector("[data-cc-duplicate-title]");
  if (heading && hasRenderedVisualContent(doc) === false) {
    heading.removeAttribute("data-cc-duplicate-title");
  }
}

/**
 * Replaces the default theme values in a loaded frame with the organization
 * theme of the page around it, read from the app's Chakra variables on the
 * iframe element. Values the page does not define keep their defaults.
 */
export function syncHostTheme(frame: HTMLIFrameElement): void {
  const style = frame.contentDocument?.querySelector("style[data-cc-theme]");
  const win = frame.ownerDocument.defaultView;
  if (!style || !win) return;
  const computed = win.getComputedStyle(frame);
  const values = { ...VISUAL_THEME_DEFAULTS };
  for (const [name, source] of Object.entries(HOST_THEME_SOURCES)) {
    const value = computed.getPropertyValue(source).trim();
    // Plain colours only, so nothing but a colour reaches the frame's CSS.
    if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i.test(value)) {
      values[name] = value;
    }
  }
  style.textContent = themeCss(values) + THEME_BASE_CSS;
}

// Expand zooms the whole page evenly. A width:100% SVG in the ~1200 px dialog
// grows about 3.7x, so its text (27-34 px) outgrew the headings, tables and
// source line (12-14 px). Zooming the root element scales text, tables and
// charts together, so the hierarchy stays as the model wrote it. Inline frames
// keep the model's own layout.
/** Page column width before zoom: a little wider than the 500 px desktop chat column, so text wraps about as inline. */
export const EXPANDED_LAYOUT_PX = 560;
/** Largest zoom, so a very wide dialog does not enlarge text past what fits a screen. */
export const EXPANDED_MAX_ZOOM = 1.6;
/** Room kept left and right of the zoomed page. */
export const EXPANDED_SIDE_PX = 64;

/** The first top-level chart in the body that is laid out, or null. */
function firstChart(doc: Document): Element | null {
  return (
    Array.from(doc.body.querySelectorAll("svg[viewBox]")).find(
      (svg) =>
        !svg.parentElement?.closest("svg") &&
        svg.getBoundingClientRect().height > 0,
    ) ?? null
  );
}

/** The element after `chart` in reading order, climbing at most two levels. */
function followerOf(chart: Element): Element | null {
  let node: Element = chart;
  for (let depth = 0; depth < 3; depth++) {
    const next = node.nextElementSibling;
    if (next) return next;
    const parent = node.parentElement;
    if (!parent || parent.tagName === "BODY") return null;
    node = parent;
  }
  return null;
}

/**
 * Marks the first chart for a height cap that keeps it and the block right
 * after it (its legend or key) on the first screen. Returns the cap in
 * unzoomed px, or null when the chart needs no cap or starts far down the page.
 */
function fitFirstChart(
  doc: Document,
  win: Window,
  zoom: number,
): number | null {
  const chart = firstChart(doc);
  if (!chart) return null;

  // Reserve the follower only when it is a short block, not a whole table.
  const chartRect = chart.getBoundingClientRect();
  const follower = followerOf(chart);
  const followerHeight = follower?.getBoundingClientRect().height ?? 0;
  const reserve =
    follower && followerHeight <= 0.25 * win.innerHeight
      ? followerHeight + 8
      : 0;

  // Add the scroll offset back, so the room is measured from the document top
  // even when the reader has scrolled.
  const scrollTop = doc.scrollingElement?.scrollTop ?? 0;
  const room = win.innerHeight - (chartRect.top + scrollTop) - reserve - 16;
  // Far down the page, the reader scrolls to the chart anyway. A chart that
  // already fits needs no cap.
  if (room < 0.4 * win.innerHeight || room >= chartRect.height) return null;

  chart.setAttribute("data-cc-fit", "");
  return Math.floor(room / zoom);
}

/** Room kept under a page that fits the Expand frame whole. */
const EXPANDED_FIT_MARGIN_PX = 16;
/** Chart labels may be at most this many times the page's own text size. */
export const EXPANDED_TEXT_RATIO = 1.5;
// Caps the text sample used for the page's text size.
const MAX_SAMPLED_TEXT = 200;

/** Bottom of the page content in document px, or 0 when it is not laid out. */
function pageContentHeight(doc: Document, win: Window): number {
  const scrollTop = doc.scrollingElement?.scrollTop ?? 0;
  let bottom = 0;
  for (const child of Array.from(doc.body.children)) {
    if (/^(style|script|template)$/.test(child.localName)) continue;
    const rect = child.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      bottom = Math.max(bottom, rect.bottom + scrollTop);
    }
  }
  if (!bottom) return 0;
  // The body's own min-height (e.g. 100vh) is ignored: only content counts.
  const body = win.getComputedStyle(doc.body);
  return Math.ceil(
    bottom +
      (parseFloat(body.paddingBottom) || 0) +
      (parseFloat(body.marginBottom) || 0),
  );
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Median font size of the page's HTML text, outside SVG, or 0 if none. */
function pageTextPx(doc: Document, win: Window): number {
  const sizes: number[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (
    let node = walker.nextNode();
    node && sizes.length < MAX_SAMPLED_TEXT;
    node = walker.nextNode()
  ) {
    const parent = node.parentElement;
    if (
      !node.textContent?.trim() ||
      !parent ||
      parent.closest("svg,style,script,title,template") ||
      !isShown(parent)
    ) {
      continue;
    }
    const size = parseFloat(win.getComputedStyle(parent).fontSize);
    if (size > 0) sizes.push(size);
  }
  return sizes.length ? median(sizes) : 0;
}

/**
 * Narrows each top-level chart whose labels would be drawn much larger than
 * the page text, so Expand enlarges the chart and its table together instead
 * of turning axis labels into headings. A 150-unit mini chart filling a
 * 270 px grid cell otherwise draws 13-unit labels at 23 px next to 12 px
 * text. Measured on the unzoomed page; returns the CSS for the caps.
 */
function capChartText(doc: Document, win: Window): string {
  const pagePx = pageTextPx(doc, win);
  if (!pagePx) return "";
  const limit = EXPANDED_TEXT_RATIO * pagePx;
  const rules: string[] = [];
  const charts = Array.from(
    doc.body.querySelectorAll<SVGSVGElement>("svg[viewBox]"),
  ).filter((svg) => !svg.parentElement?.closest("svg"));
  charts.forEach((svg, index) => {
    const viewBoxWidth = Number(
      (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/)[2],
    );
    const rect = svg.getBoundingClientRect();
    if (!(viewBoxWidth > 0) || !(rect.width > 0)) return;
    // Laid-out labels only: a hidden tooltip does not set the chart's size.
    const sizes = Array.from(svg.querySelectorAll("text"))
      .filter((text) => isShown(text))
      .map((text) => parseFloat(win.getComputedStyle(text).fontSize))
      .filter((size) => size > 0);
    if (!sizes.length) return;
    // The median label: one large headline number does not shrink the chart.
    const label = median(sizes);
    if ((label * rect.width) / viewBoxWidth <= limit) return;
    const cap = Math.floor((viewBoxWidth * limit) / label);
    svg.setAttribute("data-cc-text-cap", String(index));
    // A chart that filled its box stays centred in it once narrower.
    const box = svg.parentElement?.getBoundingClientRect().width ?? 0;
    const centre =
      box > 0 && rect.width >= 0.9 * box
        ? "display:block!important;margin-left:auto!important;margin-right:auto!important;"
        : "";
    // More specific than the base svg rule, which also carries !important.
    rules.push(
      `svg[viewBox][data-cc-text-cap="${index}"]:not(svg svg){max-width:${cap}px!important;${centre}}`,
    );
  });
  return rules.join("");
}

/** The zoom and the one-screen chart cap, in unzoomed px. */
function expandedBaseCss(zoom: number, innerHeight: number): string {
  // 48 px leaves room for the dialog header. The cap is in unzoomed px, so
  // after zoom one chart still fits the frame height.
  const height = Math.floor((innerHeight - 48) / zoom);
  return `html{zoom:${zoom}}body{max-width:${EXPANDED_LAYOUT_PX}px!important;margin-left:auto!important;margin-right:auto!important}svg[viewBox]:not(svg svg){max-height:${height}px!important;max-width:100%!important}`;
}

/**
 * Adds the Expand layout to a loaded frame document: a zoom, chart text caps
 * and height caps.
 *
 * - A page that fits the frame at its normal size is zoomed only as far as it
 *   still fits whole, so a ranking, table or accordion is read without
 *   scrolling. A taller page is zoomed to fit the frame width, up to 1.6x.
 * - A chart whose labels would outgrow the page text is narrowed, see
 *   `capChartText`.
 * - Every top-level chart is capped to one screen. On a page taller than the
 *   frame, the first chart is also capped so it and the legend or key under it
 *   fit on the first screen, because the series and slice names must be
 *   visible without scrolling. Later charts keep only the screen cap: their
 *   position depends on scrolling, so a fit measured at the top would not
 *   apply to them.
 *
 * The style is host CSS on the live document, not part of the srcdoc, so
 * inline and Expand frames keep the same srcdoc (view state is keyed by it).
 */
export function applyExpandedLayout(doc: Document): void {
  const win = doc.defaultView;
  if (!win || !doc.body) return;
  const existing = doc.head.querySelector<HTMLStyleElement>(
    "style[data-cc-expanded]",
  );
  const style = existing ?? doc.createElement("style");
  if (!existing) {
    style.setAttribute("data-cc-expanded", "");
    doc.head.append(style);
  }

  const update = () => {
    // Never zoom below 1: a phone-width dialog keeps the page at its normal size.
    const widthZoom = Math.max(
      1,
      Math.min(
        EXPANDED_MAX_ZOOM,
        (win.innerWidth - EXPANDED_SIDE_PX) / EXPANDED_LAYOUT_PX,
      ),
    );

    // Drop the last run's marks and measure the page at zoom 1, so the
    // layout reflects the new frame size and not the old caps.
    doc.querySelectorAll("[data-cc-fit],[data-cc-text-cap]").forEach((el) => {
      el.removeAttribute("data-cc-fit");
      el.removeAttribute("data-cc-text-cap");
    });
    style.textContent = expandedBaseCss(1, win.innerHeight);
    const textCaps = capChartText(doc, win);
    style.textContent = expandedBaseCss(1, win.innerHeight) + textCaps;

    // Zoom scales the laid-out page evenly, so the fitting zoom is exact.
    const pageHeight = pageContentHeight(doc, win);
    const room = win.innerHeight - EXPANDED_FIT_MARGIN_PX;
    const fitsWhole = pageHeight > 0 && pageHeight <= room;
    const zoom = fitsWhole
      ? Math.max(
          1,
          Math.floor(Math.min(widthZoom, room / pageHeight) * 1000) / 1000,
        )
      : widthZoom;

    let base = expandedBaseCss(zoom, win.innerHeight) + textCaps;
    style.textContent = base;
    if (fitsWhole) {
      // The estimate misses content past its box (a positioned footer, labels
      // past an SVG edge), so check the real scroll extent and step back.
      const root = doc.documentElement;
      for (
        let fit = zoom;
        fit > 1 && root.scrollHeight > root.clientHeight + 1;
      ) {
        fit = Math.max(1, Math.floor(fit * 0.94 * 1000) / 1000);
        base = expandedBaseCss(fit, win.innerHeight) + textCaps;
        style.textContent = base;
      }
    }
    const fitCap = fitsWhole ? null : fitFirstChart(doc, win, zoom);
    // The fit selector has more specificity than the base rule, which also
    // carries !important, so the cap wins.
    style.textContent =
      fitCap === null
        ? base
        : `${base}svg[viewBox][data-cc-fit]{max-height:${fitCap}px!important}`;
  };
  update();
  // Only the first call registers a listener; a later call reuses the style.
  if (!existing) win.addEventListener("resize", update);
}

// Text inside these is never drawn, so it does not count as content.
const INSET_HIDDEN_TEXT_PARENTS = "style, script, title";
// Elements that paint a box or a line; their edges count as content.
const INSET_DRAWN_TAGS = new Set([
  "img",
  "canvas",
  "table",
  "hr",
  "input",
  "select",
  "textarea",
  "button",
  "progress",
  "meter",
]);
// A background that paints nothing: the keyword or alpha 0.
const TRANSPARENT_COLOR = /^(transparent|rgba?\([^)]*[,/]\s*0(\.0*)?\s*\))$/;
// Caps the element scan; text is measured in full. Keeps big documents cheap.
const MAX_SCANNED_ELEMENTS = 400;
// Content closer than this to the card edge gets the inset.
const CLOSE_SIDE_PX = 8;
const CLOSE_TOP_PX = 6;
const INSET_PX = 12;

/** Whether the element is laid out and not hidden. Without checkVisibility, assume yes. */
function isShown(element: Element): boolean {
  return element.checkVisibility?.({ visibilityProperty: true }) ?? true;
}

/** Whether an element paints its own box or line, see `INSET_DRAWN_TAGS`. */
function isPainted(element: Element, win: Window): boolean {
  const tag = element.localName;
  // Only the outermost svg counts: its shapes lie inside its box.
  if (tag === "svg") return !element.parentElement?.closest("svg");
  if (INSET_DRAWN_TAGS.has(tag)) return true;
  const style = win.getComputedStyle(element);
  return (
    !TRANSPARENT_COLOR.test(style.backgroundColor) ||
    parseFloat(style.borderLeftWidth) > 0
  );
}

/** Boxes of visible text and painted elements, in viewport coordinates. */
function contentRects(doc: Document, win: Window): DOMRect[] {
  const rects: DOMRect[] = [];
  // Text: a Range per node measures the glyphs, not the block that holds them.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (
      !node.textContent?.trim() ||
      !parent ||
      parent.closest(INSET_HIDDEN_TEXT_PARENTS) ||
      !isShown(parent)
    ) {
      continue;
    }
    const range = doc.createRange();
    range.selectNodeContents(node);
    rects.push(range.getBoundingClientRect());
  }
  // Painted elements, first MAX_SCANNED_ELEMENTS only.
  const elements = Array.from(doc.body.getElementsByTagName("*")).slice(
    0,
    MAX_SCANNED_ELEMENTS,
  );
  for (const element of elements) {
    if (isPainted(element, win) && isShown(element)) {
      rects.push(element.getBoundingClientRect());
    }
  }
  // Zero-size boxes, e.g. an empty line box, say nothing about the edge.
  return rects.filter((rect) => rect.width > 0 && rect.height > 0);
}

/**
 * Gives a loaded model page a default inset when its content touches the card
 * edge. Some pages set body margin 0 and no padding, so titles, tables and
 * charts sit at the card's left edge. Pages with their own spacing are left
 * alone. Runs once per document and marks it, even when nothing was added.
 */
export function ensureContentInset(doc: Document): void {
  const win = doc.defaultView;
  if (!doc.body || !win || doc.querySelector("style[data-cc-inset]")) return;
  // Zero width means the frame is not laid out (e.g. hidden); a later load can measure.
  if (doc.documentElement.getBoundingClientRect().width === 0) return;

  let minLeft = Infinity;
  let maxRight = -Infinity;
  let minTop = Infinity;
  for (const rect of contentRects(doc, win)) {
    minLeft = Math.min(minLeft, rect.left);
    maxRight = Math.max(maxRight, rect.right);
    minTop = Math.min(minTop, rect.top);
  }

  // clientWidth leaves out a vertical scrollbar, so the right margin is the visible one.
  const sideTooClose =
    minLeft < CLOSE_SIDE_PX ||
    maxRight > doc.documentElement.clientWidth - CLOSE_SIDE_PX;
  const topTooClose = minTop < CLOSE_TOP_PX;
  const declarations: string[] = [];
  if (sideTooClose) {
    declarations.push(
      `padding-left:${INSET_PX}px!important`,
      `padding-right:${INSET_PX}px!important`,
    );
  }
  if (topTooClose) {
    declarations.push(
      `padding-top:${INSET_PX}px!important`,
      `padding-bottom:${INSET_PX}px!important`,
    );
  }

  // An empty style still marks the document as measured.
  const style = doc.createElement("style");
  style.setAttribute("data-cc-inset", "");
  style.textContent = declarations.length
    ? `body{${declarations.join(";")}}`
    : "";
  doc.head.append(style);
}

/**
 * Shows which side of a horizontally scrolling table hides columns: a fade on
 * that side and the hint under the box. Touch screens hide scrollbars, so the
 * fade and hint are the only cue there. Runs once per box on a loaded frame.
 */
export function watchTableScroll(doc: Document): void {
  const boxes = doc.querySelectorAll<HTMLElement>(
    `.${SCROLL_CLASS}:not([data-cc-watched])`,
  );
  for (const box of Array.from(boxes)) {
    box.setAttribute("data-cc-watched", "");
    // One pass after the box is laid out, then on scroll and on box resize.
    const update = () => {
      const overflow = box.scrollWidth > box.clientWidth + 1;
      box.classList.toggle("cc-overflow", overflow);
      box.classList.toggle(FITS_CLASS, !overflow);
      box.classList.toggle("cc-more-left", overflow && box.scrollLeft > 1);
      box.classList.toggle(
        "cc-more-right",
        overflow && box.scrollLeft + box.clientWidth < box.scrollWidth - 1,
      );
    };
    update();
    box.addEventListener("scroll", update, { passive: true });
    // The table too: a CSS filter can widen it while the box keeps its size.
    const observer = new ResizeObserver(update);
    observer.observe(box);
    const table = box.querySelector("table");
    if (table) observer.observe(table);
  }
}
