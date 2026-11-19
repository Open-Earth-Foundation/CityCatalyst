/**
 * Wave 2 reference pass for A1.2a: our code finds the report's reference list in
 * the OCR cache and splits its entries, so the expected count is known; an LLM
 * only maps each entry to {author, title, year}. A second scan takes the sources
 * named under tables and figures. Nothing here reads the gold.
 */
import { z } from "zod";
import type { MircoItem } from "./convert";

export interface ReferenceEntry {
  page: number;
  /** The whole entry, lines joined with spaces. */
  text: string;
  /** The entry's first line on its start page: an exact OCR passage for the quote check. */
  quote: string;
}

export interface MappedReference {
  author: string;
  title: string;
  year: number | null;
}

export interface SourceMention {
  page: number;
  text: string;
  year: number | null;
  quote: string;
}

const REFERENCE_HEADING =
  /^#{1,3}\s*(?:\d+(?:\.\d+)*\.?\s*)?\**\s*(references|referencias|referências|bibliograf[ií]a|bibliography|works cited|literature cited)\s*\**\s*$/i;
const ANY_HEADING = /^#{1,3}\s+\S/;
const NUMBERED_ENTRY = /^\d{1,3}[.)]?\s+[A-ZÁÉÍÓÚÑÜ]/;
const CONTINUATION = /^(https?:|doi|www\.|[a-z(&,;:])/;
const ENTRY_END = /([.)]|https?:\/\/\S+)\s*$/;
const YEAR = /\b(1[89]\d\d|20\d\d)\b/;
const APA_YEAR = /\((?:\d{4}[a-z]?|n\.d\.)\)\./g;

/** Text of the pages from the reference heading to the next heading. */
function referenceLines(
  pages: ReadonlyMap<number, string>,
): { page: number; line: string; pageStart: boolean }[] {
  const lines: { page: number; line: string; pageStart: boolean }[] = [];
  let inSection = false;
  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    let pageStart = true;
    for (const raw of (pages.get(page) ?? "").split("\n")) {
      const line = raw.trim();
      if (!inSection) {
        inSection = REFERENCE_HEADING.test(line);
        continue;
      }
      if (ANY_HEADING.test(line) && !REFERENCE_HEADING.test(line)) return lines;
      lines.push({ page, line, pageStart });
      if (line) pageStart = false;
    }
    if (inSection) lines.push({ page, line: "", pageStart: false });
  }
  return lines;
}

/**
 * Two APA entries in one paragraph: a second "Author. (Year)." whose author part
 * has no italics or parentheses starts a new entry.
 */
function splitMergedApa(entry: ReferenceEntry): ReferenceEntry[] {
  const years = [...entry.text.matchAll(APA_YEAR)];
  if (years.length < 2) return [entry];
  const cuts: number[] = [];
  let from = (years[0].index ?? 0) + years[0][0].length;
  for (const year of years.slice(1)) {
    const at = year.index ?? 0;
    const segment = entry.text.slice(from, at);
    const boundaries = [...segment.matchAll(/[.*)]\s+(?=[A-Z])/g)];
    const start = boundaries.find((b) => {
      const author = segment.slice((b.index ?? 0) + b[0].length);
      return author.length >= 8 && !/[*()]/.test(author);
    });
    if (start) cuts.push(from + (start.index ?? 0) + start[0].length);
    from = at + year[0].length;
  }
  if (cuts.length === 0) return [entry];
  const bounds = [0, ...cuts, entry.text.length];
  return bounds.slice(0, -1).map((b, i) => ({
    page: entry.page,
    text: entry.text.slice(b, bounds[i + 1]).trim(),
    quote: i === 0 ? entry.quote : entry.text.slice(b, bounds[i + 1]).trim(),
  }));
}

export function findReferenceEntries(
  pages: ReadonlyMap<number, string>,
): ReferenceEntry[] {
  type Block = { page: number; lines: string[]; pageStart: boolean };
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const { page, line, pageStart } of referenceLines(pages)) {
    if (!line || line.startsWith("![")) {
      if (current) blocks.push(current);
      current = null;
      continue;
    }
    if (current && NUMBERED_ENTRY.test(line)) {
      blocks.push(current);
      current = null;
    }
    if (!current) current = { page, lines: [line], pageStart };
    else current.lines.push(line);
  }
  if (current) blocks.push(current);

  const entries: ReferenceEntry[] = [];
  for (const block of blocks) {
    const text = block.lines.join(" ");
    const previous = entries.at(-1);
    const continues =
      previous &&
      (CONTINUATION.test(text) ||
        (block.pageStart && !ENTRY_END.test(previous.text)));
    if (continues) previous.text = `${previous.text} ${text}`;
    else entries.push({ page: block.page, text, quote: block.lines[0] });
  }
  return entries.flatMap(splitMergedApa);
}

const CAPTION =
  /^\**\s*(?:tablas?|figuras?|mapas?|gr[aá]ficos?|tables?|figures?|maps?|charts?)\s+\d+[.:]/i;
const CAPTION_SOURCE = /\(([^()]+)\)\s*\**\s*$/;
const SOURCE_LINE =
  /^\**\s*(?:fuentes?|sources?|data sources?)\s*\**\s*:\s*(.+?)\s*$/i;
const SELF_MADE =
  /^(?:elaboraci[oó]n propia|own elaboration|prepared by the authors?)[,;]?\s*/i;

function yearOf(text: string): number | null {
  const m = text.match(YEAR);
  return m ? Number(m[1]) : null;
}

/** Sources under tables and figures: caption parentheses and "Source:" lines. */
export function captionSources(
  pages: ReadonlyMap<number, string>,
): SourceMention[] {
  const seen = new Set<string>();
  const sources: SourceMention[] = [];
  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    for (const raw of (pages.get(page) ?? "").split("\n")) {
      const line = raw.trim();
      const fromCaption = CAPTION.test(line)
        ? line.match(CAPTION_SOURCE)?.[1]
        : undefined;
      const found = fromCaption ?? line.match(SOURCE_LINE)?.[1];
      if (!found) continue;
      const text = found
        .replace(SELF_MADE, "")
        .replace(/^[\s.,;:]+/, "")
        .trim();
      // "IPCC 2014" and "IPCC2014" are one source.
      const key = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (!/\p{L}{3}/u.test(text) || seen.has(key)) continue;
      seen.add(key);
      sources.push({ page, text, year: yearOf(text), quote: line });
    }
  }
  return sources;
}

/** Author, title and year from the entry text, when the model's answer is unusable. */
export function fallbackReference(entry: string): MappedReference {
  const text = entry.replace(/^\d{1,3}[.)]?\s+/, "");
  const paren = text.match(
    /^(.*?)\s*\((\d{4})[a-z]?\)|^(.*?)\s*\((?:sin fecha|s\.\s?f\.|n\.d\.)\)/i,
  );
  const bare = paren ? null : text.match(/^(.*?)\s+(1[89]\d\d|20\d\d)\b/);
  const author = (paren?.[1] ?? paren?.[3] ?? bare?.[1] ?? "").trim();
  const yearText = paren?.[2] ?? bare?.[2];
  const head = paren?.[0] ?? bare?.[0] ?? "";
  const rest = text.slice(head.length).replace(/^[\s.,:]+/, "");
  const title = (rest.split(/\.\s/)[0] ?? "")
    .replace(/\*/g, "")
    .replace(/\.$/, "")
    .trim();
  return {
    author: author || text,
    title: author ? title : "",
    year: yearText ? Number(yearText) : null,
  };
}

const BATCH_SIZE = 30;
const AnswerSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      author: z.string(),
      title: z.string(),
      year: z.number().int().nullable(),
    }),
  ),
});

/** Strict JSON schema for one batch answer, for the LLM client. */
export const REFERENCE_ANSWER_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          author: { type: "string" },
          title: { type: "string" },
          year: { type: ["integer", "null"] },
        },
        required: ["index", "author", "title", "year"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function validBatch(answer: unknown, size: number): MappedReference[] | null {
  const parsed = AnswerSchema.safeParse(answer);
  if (!parsed.success || parsed.data.items.length !== size) return null;
  const byIndex = new Map(parsed.data.items.map((i) => [i.index, i]));
  if (byIndex.size !== size) return null;
  // Numbered reference lists lead the model to count from 1.
  const base = byIndex.has(0) ? 0 : 1;
  const out: MappedReference[] = [];
  for (let i = 0; i < size; i++) {
    const item = byIndex.get(i + base);
    if (!item) return null;
    out.push({ author: item.author, title: item.title, year: item.year });
  }
  return out;
}

/**
 * Maps entries in batches of 30. A batch whose answer does not have exactly one
 * item per entry is retried once, then falls back to fallbackReference.
 */
export async function mapReferences(
  entries: ReferenceEntry[],
  complete: (batch: string[]) => Promise<unknown>,
): Promise<{
  references: MappedReference[];
  stats: { batches: number; retries: number; fallbacks: number };
}> {
  const stats = { batches: 0, retries: 0, fallbacks: 0 };
  const references: MappedReference[] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE).map((e) => e.text);
    stats.batches += 1;
    let mapped: MappedReference[] | null = null;
    for (let attempt = 0; attempt < 2 && !mapped; attempt++) {
      if (attempt > 0) stats.retries += 1;
      mapped = validBatch(
        await complete(batch).catch(() => null),
        batch.length,
      );
    }
    if (!mapped) {
      stats.fallbacks += batch.length;
      mapped = batch.map(fallbackReference);
    }
    references.push(...mapped);
  }
  return { references, stats };
}

/** A source is a duplicate when a reference shares its year and first author word. */
function citesReference(
  source: SourceMention,
  references: MappedReference[],
): boolean {
  const text = source.text.toLowerCase();
  return references.some((r) => {
    const word = r.author.toLowerCase().match(/\p{L}{3,}/u)?.[0];
    return r.year === source.year && !!word && text.includes(word);
  });
}

export function referenceItems(
  entries: ReferenceEntry[],
  references: MappedReference[],
  sources: SourceMention[],
): MircoItem[] {
  const items: MircoItem[] = entries.map((entry, index) => ({
    fieldId: "A1.2a",
    index,
    value: { ...references[index], used_for: null },
    evidence: [{ page: entry.page, quote: entry.quote }],
  }));
  for (const source of sources) {
    if (citesReference(source, references)) continue;
    items.push({
      fieldId: "A1.2a",
      index: items.length,
      value: {
        author: source.text,
        title: "",
        year: source.year,
        used_for: null,
      },
      evidence: [{ page: source.page, quote: source.quote }],
    });
  }
  return items;
}

/** The instructions for one mapping batch. */
export function referencePrompt(batch: string[]): string {
  return [
    "Map each reference entry to {index, author, title, year}. index is the number in square brackets, starting at 0.",
    "- author: the author(s) or institution as written; title: the full title of the work, without italics markup; year: the publication year, or null when the entry has no date.",
    `- Return exactly ${batch.length} items, one per entry, with the entry's index. Never merge, split or skip entries.`,
    "",
    ...batch.map((text, i) => `[${i}] ${text}`),
  ].join("\n");
}
