"use client";

import { Box, Text, VStack } from "@chakra-ui/react";

import { useTranslation } from "@/i18n/client";
import type { ConceptNoteChapterValidationEvidence } from "@/util/types";

export function ValidationEvidence({
  evidence,
  lng,
}: {
  evidence: ConceptNoteChapterValidationEvidence[];
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");

  if (evidence.length === 0) return null;

  return (
    <VStack
      data-testid="validation-finding-evidence"
      aria-label={t("validation-evidence-label")}
      align="stretch"
      gap={2}
      mt={2}
      role="list"
    >
      {evidence.map((item, index) => (
        <Box
          key={`${item.selected_source_label}-${item.source_location ?? ""}-${item.claim_ref ?? ""}-${index}`}
          borderLeft="2px solid"
          borderColor="border.neutral"
          pl={3}
          role="listitem"
        >
          <Text
            fontSize="label.sm"
            fontWeight="semibold"
            color="content.primary"
          >
            {t(
              item.source_location
                ? "validation-evidence-source-location"
                : "validation-evidence-source",
              {
                location: item.source_location ?? "",
                source: item.selected_source_label,
              },
            )}
          </Text>
          {item.quote_or_summary && (
            <Text
              mt={1}
              fontSize="label.sm"
              color="content.secondary"
              lineClamp={3}
            >
              {t("validation-evidence-excerpt", {
                excerpt: item.quote_or_summary,
              })}
            </Text>
          )}
        </Box>
      ))}
    </VStack>
  );
}
