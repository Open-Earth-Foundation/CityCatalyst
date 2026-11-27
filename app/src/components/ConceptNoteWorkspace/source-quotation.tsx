import { Text } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import type { DocumentPointCitation } from "@/util/document-workspace";
import type { GroupedSourceCitation } from "./source-citations";

/** Show the cited words in place, with their original heading or sentence when available. */
export function SourceQuotation({
  citation,
  lng,
}: {
  citation: GroupedSourceCitation;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const repeated = citation.repeatedCitations ?? [];
  const pages = [
    ...new Set(
      repeated
        .map((source) => source.page_number)
        .filter(
          (page): page is number =>
            page != null && page !== citation.page_number,
        ),
    ),
  ]
    .sort((a, b) => a - b)
    .map((page) => new Intl.NumberFormat(lng).format(page));
  const anchors = [
    ...new Set(
      repeated
        .filter((source) => source.page_number == null)
        .map((source) => source.source_anchor)
        .filter(
          (anchor): anchor is string =>
            Boolean(anchor) && anchor !== citation.source_anchor,
        ),
    ),
  ];
  return (
    <>
      <QuotationText citation={citation} />
      {pages.length > 0 && (
        <Text
          as="span"
          display="block"
          fontSize="body.sm"
          color="content.secondary"
          mt={1}
        >
          {t("workspace-same-wording-pages", {
            count: pages.length,
            pages: pages.join(", "),
          })}
        </Text>
      )}
      {anchors.length > 0 && (
        <Text
          as="span"
          display="block"
          fontSize="body.sm"
          color="content.secondary"
          mt={1}
        >
          {t("workspace-same-wording-locations", {
            locations: anchors.join(", "),
          })}
        </Text>
      )}
    </>
  );
}

function QuotationText({
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
