"use client";

import { Box, Text, VStack, type TextProps } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useTranslation } from "@/i18n/client";
import type { DocumentPointCitation } from "@/util/document-workspace";
import { SourceQuotation } from "./source-quotation";
import {
  groupSourceCitations,
  type GroupedSourceCitation,
} from "./source-citations";

function NarrativeSummary({ children }: { children: ReactNode }) {
  return (
    <Text
      as="summary"
      cursor="pointer"
      minH="44px"
      py="12px"
      lineHeight="20px"
      fontSize="body.sm"
      color="content.link"
      borderRadius="4px"
      _focusVisible={{ outline: "2px solid", outlineColor: "content.link" }}
    >
      {children}
    </Text>
  );
}

/** Long verified lists remain readable by revealing the next sections on demand. */
export function NarrativeValue({
  value,
  citations,
  lng,
  ...style
}: { value: string; citations: DocumentPointCitation[]; lng: string } & Pick<
  TextProps,
  "fontWeight" | "fontSize"
>) {
  const { t } = useTranslation(lng, "concept-notes");
  const blocks = value.split(/\n\s*\n/);
  const flatBullets =
    blocks.length === 1 && /^[•*-]\s/u.test(value)
      ? value.split(/\n(?=[•*-]\s)/u)
      : [];
  const preview =
    blocks.length > 1 ? blocks[0] : flatBullets.slice(0, 2).join("\n");
  const rest = blocks.length > 1 ? blocks.slice(1) : flatBullets.slice(2);
  const isLong = value.length > 700 || value.split("\n").length > 10;
  if (
    !isLong ||
    !rest.length ||
    !citations.some((cite) => cite.component_values?.length)
  )
    return (
      <Text {...style} whiteSpace="pre-wrap">
        {value}
      </Text>
    );
  return (
    <Box>
      <Text {...style} whiteSpace="pre-wrap">
        {preview}
      </Text>
      <Box as="details" mt={1}>
        <NarrativeSummary>
          {blocks.length > 1
            ? t("workspace-narrative-more-sections", { count: rest.length })
            : t("funding-show-all-details")}
        </NarrativeSummary>
        {rest.map((block, index) => (
          <Text {...style} key={index} mt={2} whiteSpace="pre-wrap">
            {block}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

/** Preserve the specific quotation for each contribution to a proposed answer. */
export function NarrativeCitations({
  citations,
  lng,
  preview,
  children,
}: {
  citations: DocumentPointCitation[];
  lng: string;
  preview?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  if (!citations.some((cite) => cite.component_values?.length))
    return <>{children}</>;
  const groupedCitations = groupSourceCitations(citations);
  const byValue = new Map<string, GroupedSourceCitation[]>();
  for (const cite of groupedCitations) {
    for (const value of cite.component_values?.length
      ? cite.component_values
      : [""]) {
      const previous = byValue.get(value) ?? [];
      previous.push(cite);
      byValue.set(value, previous);
    }
  }
  return (
    <>
      {preview && (
        <NarrativeValue
          value={preview}
          citations={citations}
          lng={lng}
          fontSize="body.sm"
        />
      )}
      <Box as="details" mt={1}>
        <NarrativeSummary>
          {t("validation-check-evidence")} ({groupedCitations.length})
        </NarrativeSummary>
        <VStack mt={2} align="stretch" gap={3}>
          {Array.from(byValue, ([value, sources]) => (
            <Box key={value}>
              {value && (
                <Text fontSize="body.sm" fontWeight="semibold">
                  {value}
                </Text>
              )}
              {sources.map((source, index) => (
                <Box
                  as="blockquote"
                  key={index}
                  mt={1}
                  borderLeft="2px solid"
                  borderColor="border.neutral"
                  pl={3}
                >
                  <Text fontSize="body.sm" whiteSpace="pre-wrap">
                    <SourceQuotation citation={source} lng={lng} />
                  </Text>
                  <Text fontSize="body.sm" color="content.secondary">
                    {source.source_label}
                    {source.page_number != null
                      ? ` · ${t("workspace-page", { page: source.page_number })}`
                      : source.source_anchor && ` · ${source.source_anchor}`}
                    {source.component_support === "partial" &&
                      ` · ${t("workspace-narrative-partial-support")}`}
                  </Text>
                </Box>
              ))}
            </Box>
          ))}
        </VStack>
      </Box>
    </>
  );
}
