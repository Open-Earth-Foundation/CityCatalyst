import type { DocumentPointCitation } from "@/util/document-workspace";

/** Show the cited words in place, with their original heading or sentence when available. */
export function SourceQuotation({
  citation,
}: {
  citation: Pick<DocumentPointCitation, "quote" | "quote_context">;
}) {
  const { quote, quote_context: context } = citation;
  if (typeof context !== "string" || !quote || context === quote) {
    return <>{quote}</>;
  }

  const start = context.indexOf(quote);
  if (start < 0 || context.indexOf(quote, start + 1) >= 0) return <>{quote}</>;

  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {context.slice(0, start)}
      <strong>{quote}</strong>
      {context.slice(start + quote.length)}
    </span>
  );
}
