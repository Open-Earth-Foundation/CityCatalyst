/**
 * Parses chapter Markdown into blocks and inline runs a PDF can lay out.
 *
 * jsPDF draws text, not Markdown, so the body has to become typed blocks first.
 * The supported subset is bounded by what the chapter prompts actually emit
 * (`hiap-meed/app/modules/prioritizer/prompts/city_action_report_*.md`):
 * headings, paragraphs, lists, GitHub-flavoured pipe tables, and inline bold,
 * italic, code and links. Anything outside that degrades to plain text rather
 * than being printed as raw syntax.
 *
 * Inline markup is kept as *runs* rather than stripped. jsPDF switches font
 * weight per `text()` call, so honouring bold means laying out a line run by
 * run — which the renderer does, because these chapters lead with bold labels
 * ("**The ask:**") and carry links in table cells, and dropping both is most of
 * what made the output look unformatted.
 */

/** A stretch of text sharing one set of inline styles. */
export interface MeedReportSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

export type MeedTableAlign = "left" | "center" | "right";

export type MeedReportBlock =
  | { type: "heading"; level: number; spans: MeedReportSpan[] }
  | { type: "paragraph"; spans: MeedReportSpan[] }
  | { type: "bullet"; marker: string; spans: MeedReportSpan[] }
  | {
      type: "table";
      header: MeedReportSpan[][];
      rows: MeedReportSpan[][][];
      align: MeedTableAlign[];
    };

/** Plain text of a run sequence — for measuring, tests and empty checks. */
export function spansToText(spans: MeedReportSpan[]): string {
  return spans.map((span) => span.text).join("");
}

const INLINE = [
  // Images first: their `!` prefix would otherwise be left behind by the link
  // rule, printing a stray bang before the alt text.
  {
    re: /!\[([^\]]*)\]\(([^)]*)\)/,
    take: (m: RegExpMatchArray) => ({ text: m[1] }),
  },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/,
    take: (m: RegExpMatchArray) => ({ text: m[1], href: m[2] }),
  },
  {
    re: /(\*\*|__)([\s\S]+?)\1/,
    take: (m: RegExpMatchArray) => ({ text: m[2], bold: true }),
  },
  {
    re: /(\*|_)([^\s*_][\s\S]*?)\1/,
    take: (m: RegExpMatchArray) => ({ text: m[2], italic: true }),
  },
  {
    re: /`([^`]+)`/,
    take: (m: RegExpMatchArray) => ({ text: m[1], code: true }),
  },
] as const;

/**
 * Splits a line into styled runs.
 *
 * One pass, always taking the earliest match, so `**bold** and [link](x)` does
 * not let the bold rule swallow the link. Nested emphasis resolves by recursing
 * into the captured text.
 */
export function parseInline(text: string): MeedReportSpan[] {
  const spans: MeedReportSpan[] = [];
  let rest = text;

  while (rest.length > 0) {
    let best: { index: number; length: number; span: MeedReportSpan } | null =
      null;

    for (const rule of INLINE) {
      const match = rest.match(rule.re);
      if (!match || match.index === undefined) continue;
      if (best && match.index >= best.index) continue;
      best = {
        index: match.index,
        length: match[0].length,
        span: rule.take(match) as MeedReportSpan,
      };
    }

    if (!best) {
      spans.push({ text: rest });
      break;
    }
    if (best.index > 0) spans.push({ text: rest.slice(0, best.index) });

    // Recurse so "**bold with [a link](x)**" keeps both, rather than the outer
    // rule winning and the inner syntax printing literally.
    const inner = parseInline(best.span.text);
    for (const span of inner) {
      spans.push({ ...best.span, ...span, text: span.text });
    }
    rest = rest.slice(best.index + best.length);
  }

  return spans.filter((span) => span.text.length > 0);
}

/** A `|---|:--:|---:|` row, which is what makes the line above it a header. */
function parseDelimiter(line: string): MeedTableAlign[] | null {
  const cells = splitRow(line);
  if (cells.length === 0) return null;
  const align: MeedTableAlign[] = [];
  for (const cell of cells) {
    if (!/^:?-{1,}:?$/.test(cell.trim())) return null;
    const left = cell.trim().startsWith(":");
    const right = cell.trim().endsWith(":");
    align.push(left && right ? "center" : right ? "right" : "left");
  }
  return align;
}

/** Cells of a pipe row, ignoring the optional leading and trailing pipes. */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (trimmed.length === 0) return [];
  // Escaped pipes are cell content, not separators.
  return trimmed
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

const isTableRow = (line: string) => line.includes("|") && /^\|/.test(line);

export function markdownToBlocks(markdown: string): MeedReportBlock[] {
  const blocks: MeedReportBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    const spans = parseInline(paragraph.join(" "));
    if (spansToText(spans).trim().length > 0) {
      blocks.push({ type: "paragraph", spans });
    }
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.length === 0) {
      flush();
      continue;
    }

    // A table is a header row whose *next* line is a delimiter. Checking the
    // delimiter is what keeps a prose line containing a pipe from starting one.
    if (isTableRow(line) && i + 1 < lines.length) {
      const align = parseDelimiter(lines[i + 1].trim());
      if (align) {
        flush();
        const header = splitRow(line).map(parseInline);
        const rows: MeedReportSpan[][][] = [];
        let cursor = i + 2;
        while (cursor < lines.length && isTableRow(lines[cursor].trim())) {
          const cells = splitRow(lines[cursor].trim());
          // Ragged rows are padded or clipped to the header, so a model that
          // miscounts pipes shifts one row rather than breaking the table.
          const row = Array.from({ length: header.length }, (_, c) =>
            parseInline(cells[c] ?? ""),
          );
          rows.push(row);
          cursor++;
        }
        blocks.push({
          type: "table",
          header,
          rows,
          align: Array.from(
            { length: header.length },
            (_, c) => align[c] ?? "left",
          ),
        });
        i = cursor - 1;
        continue;
      }
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        spans: parseInline(heading[2]),
      });
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.*)$/);
    const ordered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (unordered || ordered) {
      flush();
      blocks.push({
        type: "bullet",
        marker: ordered ? `${ordered[1]}.` : "•",
        spans: parseInline(ordered ? ordered[2] : unordered![1]),
      });
      continue;
    }

    paragraph.push(line);
  }

  flush();

  return blocks.filter((block) =>
    block.type === "table"
      ? block.header.length > 0
      : spansToText(block.spans).trim().length > 0,
  );
}
