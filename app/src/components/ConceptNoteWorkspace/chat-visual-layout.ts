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

// Hidden entries are `display:none` only while the toggle is closed; the
// !important rules win over model CSS such as `tr{display:grid}`.
const LAYOUT_CSS = [
  `.${SCROLL_CLASS}{overflow-x:auto!important;max-width:100%!important;min-width:0}`,
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
    style.textContent = LAYOUT_CSS;
    doc.head.append(style);
  }
  return changed;
}

// Expand gives a ~1200 px frame. There a width:100% SVG scales up to about
// 3.7x and its lower part falls below the fold, so its height is capped and
// preserveAspectRatio fits the whole chart. The body width is capped so tables
// stay readable. Inline frames keep the model's own layout.
const EXPANDED_CSS = `body{max-width:880px!important;margin-left:auto!important;margin-right:auto!important}
svg[viewBox]:not(svg svg){max-height:calc(100vh - 48px)!important;max-width:100%!important}`;

/**
 * Adds the Expand layout to a loaded frame document, once. The style is host
 * CSS on the live document, not part of the srcdoc, so inline and Expand frames
 * keep the same srcdoc (view state is keyed by it).
 */
export function applyExpandedLayout(doc: Document): void {
  if (doc.head.querySelector("style[data-cc-expanded]")) return;
  const style = doc.createElement("style");
  style.setAttribute("data-cc-expanded", "");
  style.textContent = EXPANDED_CSS;
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
      box.classList.toggle("cc-more-left", overflow && box.scrollLeft > 1);
      box.classList.toggle(
        "cc-more-right",
        overflow && box.scrollLeft + box.clientWidth < box.scrollWidth - 1,
      );
    };
    update();
    box.addEventListener("scroll", update, { passive: true });
    new ResizeObserver(update).observe(box);
  }
}
