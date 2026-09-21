"use client";

import { Box, Flex, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteFunder,
  ConceptNoteFundingOpportunity,
} from "@/util/types";

function fieldLabel(key: string): string {
  return key
    .replace(/[_-]/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

/** Render stored facts as readable labels and values, including nested profiles. */
function ProfileValue({ value, lng }: { value: unknown; lng: string }) {
  const { t } = useTranslation(lng, "concept-notes");
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) {
    return (
      <VStack align="stretch" gap={2}>
        {value.map((item, index) => (
          <ProfileValue key={index} value={item} lng={lng} />
        ))}
      </VStack>
    );
  }
  if (typeof value === "object") {
    return (
      <VStack align="stretch" gap={3}>
        {Object.entries(value)
          .filter(([, item]) => item !== null && item !== "")
          .map(([key, item]) => (
            <Box key={key}>
              <Text
                fontSize="label.sm"
                fontWeight="semibold"
                color="content.primary"
              >
                {t(`funding-field-${key}`, { defaultValue: fieldLabel(key) })}
              </Text>
              <Box
                mt={1}
                ps={2}
                borderInlineStart="2px solid"
                borderColor="border.neutral"
              >
                <ProfileValue value={item} lng={lng} />
              </Box>
            </Box>
          ))}
      </VStack>
    );
  }
  return (
    <Text
      fontSize="body.sm"
      color="content.secondary"
      whiteSpace="pre-wrap"
      overflowWrap="anywhere"
    >
      {typeof value === "boolean"
        ? t(value ? "funding-yes" : "funding-no")
        : String(value)}
    </Text>
  );
}

export function FunderProfile({
  funder,
  lng,
}: {
  funder: ConceptNoteFunder;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  return (
    <VStack align="stretch" gap={4}>
      <Box>
        <Heading as="h3" fontSize="title.md" color="content.primary">
          {funder.name}
        </Heading>
        <Text mt={1} fontSize="body.sm" color="content.tertiary">
          {[funder.funder_type, funder.country, funder.region]
            .filter(Boolean)
            .join(" · ") || t("funding-profile-location-missing")}
        </Text>
      </Box>
      {Object.keys(funder.profile).length ? (
        <ProfileValue value={funder.profile} lng={lng} />
      ) : (
        <Text fontSize="body.sm" color="content.tertiary">
          {t("funding-profile-empty")}
        </Text>
      )}
    </VStack>
  );
}

export function FundingOpportunityDetails({
  opportunity,
  lng,
}: {
  opportunity: ConceptNoteFundingOpportunity;
  lng: string;
}) {
  const { t } = useTranslation(lng, "concept-notes");
  const template = opportunity.template;
  const amount = (value: string | null): string => {
    if (value === null || value.trim() === "") return t("not-available");
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
      ? new Intl.NumberFormat(lng, { maximumFractionDigits: 0 }).format(
          numericValue,
        )
      : value;
  };
  const facts = [
    ["funding-applicants", opportunity.applicant_type],
    ["funding-region", opportunity.region_scope],
    ["funding-sector", opportunity.sector],
    ["funding-instrument", opportunity.instrument_type],
    ["funding-finance-route", opportunity.finance_route],
    ["funding-category", opportunity.category],
    ["funding-status", opportunity.status],
    ["funding-hazards", opportunity.hazards.join(", ")],
    ["funding-interventions", opportunity.interventions.join(", ")],
    [
      "funding-award",
      opportunity.min_award !== null || opportunity.max_award !== null
        ? `${amount(opportunity.min_award)} – ${amount(opportunity.max_award)} ${opportunity.currency ?? ""}`
        : null,
    ],
  ];
  return (
    <VStack align="stretch" gap={5}>
      {opportunity.summary && (
        <Text fontSize="body.sm" color="content.secondary">
          {opportunity.summary}
        </Text>
      )}
      <Box
        as="dl"
        display="grid"
        gridTemplateColumns={{ base: "1fr", sm: "1fr 1fr" }}
        gap={3}
      >
        {facts
          .filter(([, value]) => value)
          .map(([key, value]) => (
            <Box key={key}>
              <Text as="dt" fontSize="label.sm" color="content.tertiary">
                {t(key!)}
              </Text>
              <Text as="dd" fontSize="body.sm" color="content.primary">
                {value}
              </Text>
            </Box>
          ))}
      </Box>
      {opportunity.known_gaps.length > 0 && (
        <Box bg="sentiment.warningOverlay" p={3} borderRadius="rounded">
          <Text fontWeight="semibold" fontSize="body.sm">
            {t("funding-known-gaps")}
          </Text>
          {opportunity.known_gaps.map((gap, index) => (
            <Text key={index} mt={1} fontSize="body.sm">
              {gap}
            </Text>
          ))}
        </Box>
      )}
      <Box borderTop="1px solid" borderColor="border.neutral" pt={4}>
        <HStack justify="space-between" mb={3} align="start">
          <Box>
            <Text fontSize="label.sm" color="content.tertiary">
              {t("funding-template-preview")}
            </Text>
            <Heading as="h4" mt={1} fontSize="body.md">
              {template?.name || t("template-not-selected")}
            </Heading>
          </Box>
          {template?.output_format && (
            <Text
              fontSize="label.sm"
              color="content.tertiary"
              textTransform="uppercase"
            >
              {template.output_format}
            </Text>
          )}
        </HStack>
        {!template ? (
          <Text fontSize="body.sm" color="content.tertiary">
            {t("funding-template-unavailable")}
          </Text>
        ) : (
          <VStack align="stretch" gap={4}>
            <Text fontSize="label.sm" color="content.tertiary">
              {t("funding-template-chapters", {
                count: template.chapter_schema.length,
              })}
            </Text>
            {template.chapter_schema.length === 0 && (
              <Text color="sentiment.warningDefault" fontSize="body.sm">
                {t("funding-template-no-chapters")}
              </Text>
            )}
            <Box as="ol" listStyleType="none" m={0} p={0}>
              {template.chapter_schema.map((chapter, index) => (
                <Flex
                  as="li"
                  key={chapter.chapter_ref ?? index}
                  gap={3}
                  py={3}
                  borderTop="1px solid"
                  borderColor="border.neutral"
                >
                  <Text
                    color="content.link"
                    fontSize="body.sm"
                    fontWeight="semibold"
                    minW="24px"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                  <Box flex={1} minW={0}>
                    <HStack justify="space-between" align="start">
                      <Text fontSize="body.sm" fontWeight="semibold">
                        {chapter.title}
                      </Text>
                      {chapter.required && (
                        <Text fontSize="label.sm" color="content.tertiary">
                          {t("funding-required")}
                        </Text>
                      )}
                    </HStack>
                    {chapter.description && (
                      <Text mt={1} fontSize="body.sm" color="content.secondary">
                        {chapter.description}
                      </Text>
                    )}
                  </Box>
                </Flex>
              ))}
            </Box>
            {template.required_fields.length > 0 && (
              <Box>
                <Text fontWeight="semibold" fontSize="body.sm" mb={2}>
                  {t("funding-required-fields")}
                </Text>
                <Box as="ul" ps={5}>
                  {template.required_fields.map((field, index) => (
                    <Text
                      as="li"
                      key={index}
                      fontSize="body.sm"
                      color="content.secondary"
                    >
                      {fieldLabel(field)}
                    </Text>
                  ))}
                </Box>
              </Box>
            )}
          </VStack>
        )}
      </Box>
    </VStack>
  );
}
