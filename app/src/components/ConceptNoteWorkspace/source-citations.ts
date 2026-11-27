import type { DocumentPointCitation } from "@/util/document-workspace";

export type GroupedSourceCitation = DocumentPointCitation & {
  repeatedCitations?: DocumentPointCitation[];
};

/** Only a matching original can absorb a repeated location; keep other evidence visible. */
export function groupSourceCitations(
  citations: DocumentPointCitation[],
): GroupedSourceCitation[] {
  const originals: GroupedSourceCitation[] = citations
    .filter((citation) => !citation.repeated_from_anchor)
    .map((citation) => ({ ...citation }));
  const grouped = new Set<DocumentPointCitation>();
  for (const citation of citations) {
    if (!citation.repeated_from_anchor || !citation.quote) continue;
    const original = originals.find(
      (source) =>
        source.source_label === citation.source_label &&
        source.quote === citation.quote &&
        (source.source_anchor ||
          (source.page_number != null
            ? `page-${source.page_number}`
            : null)) === citation.repeated_from_anchor,
    );
    if (original && (citation.page_number != null || citation.source_anchor)) {
      (original.repeatedCitations ??= []).push(citation);
      grouped.add(citation);
    }
  }
  let originalIndex = 0;
  return citations.flatMap((citation) => {
    if (!citation.repeated_from_anchor) return [originals[originalIndex++]];
    return grouped.has(citation) ? [] : [{ ...citation }];
  });
}
