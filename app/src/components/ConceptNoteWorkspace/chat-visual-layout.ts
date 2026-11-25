/**
 * Host styles and the Expand layout for AI-generated chat visuals. Styles are
 * added to the document DOMPurify has already sanitized, so the model's HTML
 * is parsed only once and only trusted host markup is added afterwards.
 */

const SCROLL_CLASS = "cc-visual-table-scroll";

/** Whether the element is laid out and not hidden. Without checkVisibility, assume yes. */
function isShown(element: Element): boolean {
  return element.checkVisibility?.({ visibilityProperty: true }) ?? true;
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
// no font-family is drawn in the browser's serif default, and the padding keeps
// content off the card edge.
const THEME_BASE_CSS =
  "body{margin:0;padding:12px;font-family:var(--font-sans);color:var(--foreground)}";

// After the model's CSS. Labels a few units past the viewBox edge are drawn,
// not cut; the body padding keeps them inside the card. A wide table scrolls
// inside its own box instead of pushing the frame sideways.
const HOST_CSS = `svg:not(svg svg){overflow:visible}.${SCROLL_CLASS}{overflow-x:auto!important;max-width:100%!important;min-width:0}`;

// Media features for the OS colour scheme; see addHostStyles.
const PREFERS_DARK = /\(\s*prefers-color-scheme\s*:\s*dark\s*\)/gi;
const PREFERS_LIGHT = /\(\s*prefers-color-scheme\s*:\s*light\s*\)/gi;

/**
 * Adds the host styles every visual gets on the sanitized document: theme
 * variables and a sans default before the model's CSS, SVG overflow and table
 * scrolling after it. Each top-level table is wrapped in its own scroll box.
 * The model's light/dark media rules always resolve to light.
 */
export function addHostStyles(doc: Document): void {
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

  // Host markup added after sanitizing: an empty wrapper with a fixed class.
  for (const table of Array.from(doc.querySelectorAll("table"))) {
    if (table.parentElement?.closest("table,foreignObject")) continue;
    const box = doc.createElement("div");
    box.className = SCROLL_CLASS;
    table.replaceWith(box);
    box.append(table);
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
const EXPANDED_LAYOUT_PX = 560;
/** Largest zoom, so a very wide dialog does not enlarge text past what fits a screen. */
const EXPANDED_MAX_ZOOM = 1.6;
/** Room kept left and right of the zoomed page. */
const EXPANDED_SIDE_PX = 64;

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
const EXPANDED_TEXT_RATIO = 1.5;
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
 * inline and Expand frames keep the same srcdoc.
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
