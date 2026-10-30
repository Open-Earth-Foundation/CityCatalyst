import type { CrvaDraftValue, CrvaDroppedValue } from "./draft-schema";

/** A shorter quote matches by chance, so it proves nothing about the value. */
const MIN_QUOTE_CHARS = 10;

/**
 * Composes accents, and folds ligatures only: full NFKC would also fold
 * superscripts and change a number. Removes `*` emphasis markup added by OCR,
 * which the LLM does not copy reliably, but keeps a `*` between digits. OCR also
 * breaks whitespace.
 */
export function normalizeForQuoteMatch(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\ufb00-\ufb06]/g, (ligature) => ligature.normalize("NFKC"))
    .replace(/\u00ad/g, "")
    .replace(/(?<!\d)\*+|\*+(?![\d*])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function verifyQuotes(
  values: CrvaDraftValue[],
  pages: ReadonlyMap<number, string>,
): { verified: CrvaDraftValue[]; dropped: CrvaDroppedValue[] } {
  const normalizedPages = new Map(
    [...pages].map(([page, text]) => [page, normalizeForQuoteMatch(text)]),
  );
  const verified: CrvaDraftValue[] = [];
  const dropped: CrvaDroppedValue[] = [];

  for (const value of values) {
    const { fieldId, source } = value;
    const quote = normalizeForQuoteMatch(source.quote);
    const report = { fieldId, page: source.page, quote: source.quote };
    if (quote.length < MIN_QUOTE_CHARS) {
      dropped.push({ ...report, reason: "quote_too_short" });
    } else if (normalizedPages.get(source.page)?.includes(quote)) {
      verified.push(value);
    } else {
      dropped.push({ ...report, reason: "quote_not_on_page" });
    }
  }

  return { verified, dropped };
}
