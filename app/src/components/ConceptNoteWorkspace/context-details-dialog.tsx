"use client";

import type { ReactNode } from "react";

import { Box, Grid, HStack, Text, VStack } from "@chakra-ui/react";

import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/client";
import { formatEmissions } from "@/util/helpers";
import type {
  CityDashboardResponse,
  ConceptNoteApplicationContext,
  HIAction,
} from "@/util/types";

export type ContextDetailKey = "city" | "ghgi" | "ccra" | "hiap" | "funder";
type ContextTone = "positive" | "neutral" | "warning";

interface ContextDetailsDialogProps {
  applicationContext: ConceptNoteApplicationContext | null;
  cityDashboard: CityDashboardResponse | null;
  cityName: string;
  country: string | null;
  detailKey: ContextDetailKey | null;
  lng: string;
  onOpenChange: (open: boolean) => void;
  status: string;
  tone: ContextTone;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Grid
      gap={3}
      gridTemplateColumns={{ base: "1fr", sm: "minmax(140px, 0.7fr) 1.3fr" }}
      borderBottom="1px solid"
      borderColor="border.neutral"
      py={2.5}
    >
      <Text fontSize="label.sm" color="content.tertiary">
        {label}
      </Text>
      <Text fontSize="body.sm" color="content.primary">
        {value}
      </Text>
    </Grid>
  );
}

function DetailSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <VStack align="stretch" gap={2}>
      <Text
        fontFamily="heading"
        fontSize="body.md"
        fontWeight="semibold"
        color="content.primary"
      >
        {title}
      </Text>
      {children}
    </VStack>
  );
}

function toneColor(tone: ContextTone): string {
  if (tone === "positive") {
    return "sentiment.positiveDefault";
  }
  if (tone === "warning") {
    return "sentiment.warningDefault";
  }
  return "content.tertiary";
}

function DetailStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: ContextTone;
}) {
  const color = toneColor(tone);
  return (
    <HStack
      alignSelf="flex-start"
      gap={1.5}
      border="1px solid"
      borderColor={color}
      borderRadius="pill"
      px={2}
      py={0.5}
    >
      <Box boxSize="6px" borderRadius="full" bg={color} />
      <Text fontSize="10px" lineHeight="16px" color="content.secondary">
        {label}
      </Text>
    </HStack>
  );
}

function formatEmissionValue(
  value: bigint | number | null | undefined,
): string {
  if (value == null) {
    return "—";
  }
  const formatted = formatEmissions(Number(value));
  return `${formatted.value} ${formatted.unit.trim()} CO₂e`;
}

function ActionDetails({ action, lng }: { action: HIAction; lng: string }) {
  const { t } = useTranslation(lng, "concept-notes");
  const descriptors = [
    action.sectors.length
      ? t("context-detail-action-sectors", {
          sectors: action.sectors.join(", "),
        })
      : "",
    action.hazards.length
      ? t("context-detail-action-hazards", {
          hazards: action.hazards.join(", "),
        })
      : "",
    action.timelineForImplementation
      ? t("context-detail-action-timeline", {
          timeline: action.timelineForImplementation,
        })
      : "",
  ].filter(Boolean);

  return (
    <VStack
      align="stretch"
      gap={1.5}
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="rounded"
      bg="background.alternativeLight"
      p={3}
    >
      <HStack align="start" justify="space-between" gap={3}>
        <Text
          fontFamily="heading"
          fontSize="body.sm"
          fontWeight="semibold"
          color="content.primary"
        >
          {action.name}
        </Text>
        {action.rank > 0 && (
          <Text flexShrink={0} fontSize="label.sm" color="content.link">
            #{action.rank}
          </Text>
        )}
      </HStack>
      {action.description && (
        <Text fontSize="label.sm" color="content.secondary">
          {action.description}
        </Text>
      )}
      {descriptors.map((descriptor) => (
        <Text key={descriptor} fontSize="10px" color="content.tertiary">
          {descriptor}
        </Text>
      ))}
    </VStack>
  );
}

export function ContextDetailsDialog({
  applicationContext,
  cityDashboard,
  cityName,
  country,
  detailKey,
  lng,
  onOpenChange,
  status,
  tone,
}: ContextDetailsDialogProps) {
  const { t } = useTranslation(lng, "concept-notes");
  const ghgiCandidate = cityDashboard?.widgets.ghgi;
  const ghgi =
    ghgiCandidate?.inventory && ghgiCandidate.totalEmissions
      ? ghgiCandidate
      : null;
  const ccraCandidate = cityDashboard?.widgets.ccra;
  const ccra = Array.isArray(ccraCandidate?.topRisks) ? ccraCandidate : null;
  const hiapCandidate = cityDashboard?.widgets.hiap;
  const hiap =
    Array.isArray(hiapCandidate?.mitigation?.rankedActions) &&
    Array.isArray(hiapCandidate?.mitigation?.unrankedActions) &&
    Array.isArray(hiapCandidate?.adaptation?.rankedActions) &&
    Array.isArray(hiapCandidate?.adaptation?.unrankedActions)
      ? hiapCandidate
      : null;
  const titles: Record<ContextDetailKey, string> = {
    city: t("city-population"),
    ghgi: t("ghg-inventory"),
    ccra: t("climate-risk-assessment"),
    hiap: t("hiap-context"),
    funder: t("funder-profile"),
  };

  return (
    <DialogRoot
      open={detailKey !== null}
      onOpenChange={(details) => onOpenChange(details.open)}
      size="lg"
    >
      <DialogContent
        maxW="720px"
        maxH="calc(100dvh - 32px)"
        my={4}
        overflow="hidden"
        borderRadius="rounded"
        bg="base.light"
        boxShadow="12dp"
      >
        <DialogHeader
          display="block"
          borderBottom="1px solid"
          borderColor="border.neutral"
          px={6}
          py={5}
          pe={12}
        >
          <DialogTitle
            fontFamily="heading"
            fontSize="title.lg"
            color="content.primary"
          >
            {detailKey ? titles[detailKey] : ""}
          </DialogTitle>
          <HStack mt={2} gap={2}>
            <DetailStatusBadge label={status} tone={tone} />
            <Text fontSize="label.sm" color="content.tertiary">
              {t("context-details-read-only")}
            </Text>
          </HStack>
        </DialogHeader>
        <DialogCloseTrigger aria-label={t("close")} />

        <DialogBody minH={0} overflowY="auto" px={6} py={5}>
          {detailKey === "city" && cityDashboard?.population && (
            <VStack align="stretch" gap={0}>
              <DetailRow label={t("context-detail-city")} value={cityName} />
              <DetailRow
                label={t("context-detail-country")}
                value={country || t("not-available")}
              />
              <DetailRow
                label={t("context-detail-population")}
                value={new Intl.NumberFormat(lng).format(
                  cityDashboard.population.population,
                )}
              />
              <DetailRow
                label={t("context-detail-year")}
                value={String(cityDashboard.population.year)}
              />
            </VStack>
          )}

          {detailKey === "ghgi" && ghgi && (
            <VStack align="stretch" gap={5}>
              <VStack align="stretch" gap={0}>
                <DetailRow
                  label={t("context-detail-inventory")}
                  value={
                    ghgi.inventory.inventoryName ||
                    t("inventory-year", { year: ghgi.year })
                  }
                />
                <DetailRow
                  label={t("context-detail-year")}
                  value={String(ghgi.year)}
                />
                <DetailRow
                  label={t("context-detail-inventory-type")}
                  value={ghgi.inventory.inventoryType || t("not-available")}
                />
                <DetailRow
                  label={t("context-detail-total-emissions")}
                  value={formatEmissionValue(ghgi.totalEmissions.total)}
                />
              </VStack>

              {ghgi.totalEmissions.bySector.length > 0 && (
                <DetailSection title={t("context-detail-sector-breakdown")}>
                  <VStack align="stretch" gap={2}>
                    {ghgi.totalEmissions.bySector.map((sector) => (
                      <HStack
                        key={sector.sectorName}
                        justify="space-between"
                        gap={4}
                        border="1px solid"
                        borderColor="border.neutral"
                        borderRadius="rounded"
                        p={3}
                      >
                        <Box minW={0}>
                          <Text fontSize="body.sm" color="content.primary">
                            {sector.sectorName}
                          </Text>
                          <Text fontSize="10px" color="content.tertiary">
                            {new Intl.NumberFormat(lng, {
                              maximumFractionDigits: 1,
                            }).format(sector.percentage)}
                            %
                          </Text>
                        </Box>
                        <Text
                          flexShrink={0}
                          fontFamily="heading"
                          fontSize="label.sm"
                          fontWeight="semibold"
                          color="content.primary"
                        >
                          {formatEmissionValue(sector.co2eq)}
                        </Text>
                      </HStack>
                    ))}
                  </VStack>
                </DetailSection>
              )}

              {ghgi.topEmissions.bySubSector.length > 0 && (
                <DetailSection title={t("context-detail-top-emissions")}>
                  <VStack align="stretch" gap={2}>
                    {ghgi.topEmissions.bySubSector.map((item) => (
                      <DetailRow
                        key={`${item.sectorName}-${item.subsectorName}-${item.scopeName}`}
                        label={item.subsectorName}
                        value={`${item.sectorName} · ${formatEmissionValue(item.co2eq)}`}
                      />
                    ))}
                  </VStack>
                </DetailSection>
              )}
            </VStack>
          )}

          {detailKey === "ccra" && ccra && (
            <DetailSection title={t("context-detail-top-risks")}>
              <VStack align="stretch" gap={3}>
                {ccra.topRisks.map((risk) => (
                  <VStack
                    key={`${risk.hazard}-${risk.keyimpact}`}
                    align="stretch"
                    gap={2}
                    border="1px solid"
                    borderColor="border.neutral"
                    borderRadius="rounded"
                    bg="background.alternativeLight"
                    p={3}
                  >
                    <Text
                      fontFamily="heading"
                      fontSize="body.sm"
                      fontWeight="semibold"
                      color="content.primary"
                    >
                      {risk.hazard}
                    </Text>
                    <Text fontSize="label.sm" color="content.secondary">
                      {risk.keyimpact}
                    </Text>
                    <Grid
                      gap={2}
                      gridTemplateColumns="repeat(4, minmax(0, 1fr))"
                    >
                      {[
                        [t("context-detail-risk-score"), risk.risk_score],
                        [t("context-detail-hazard-score"), risk.hazard_score],
                        [
                          t("context-detail-exposure-score"),
                          risk.exposure_score,
                        ],
                        [
                          t("context-detail-vulnerability-score"),
                          risk.vulnerability_score,
                        ],
                      ].map(([label, value]) => (
                        <Box key={String(label)}>
                          <Text fontSize="9px" color="content.tertiary">
                            {label}
                          </Text>
                          <Text
                            fontFamily="heading"
                            fontSize="body.sm"
                            fontWeight="semibold"
                            color="content.primary"
                          >
                            {String(value)}
                          </Text>
                        </Box>
                      ))}
                    </Grid>
                  </VStack>
                ))}
              </VStack>
            </DetailSection>
          )}

          {detailKey === "hiap" && hiap && (
            <VStack align="stretch" gap={5}>
              {[
                [t("context-detail-mitigation-actions"), hiap.mitigation],
                [t("context-detail-adaptation-actions"), hiap.adaptation],
              ].map(([title, group]) => {
                const actionGroup = group as typeof hiap.mitigation;
                return (
                  <DetailSection key={String(title)} title={String(title)}>
                    <Text fontSize="label.sm" color="content.tertiary">
                      {t("context-detail-action-counts", {
                        ranked: actionGroup.rankedActions.length,
                        unranked: actionGroup.unrankedActions.length,
                      })}
                    </Text>
                    <VStack align="stretch" gap={2}>
                      {actionGroup.rankedActions.map((action) => (
                        <ActionDetails
                          key={action.id}
                          action={action}
                          lng={lng}
                        />
                      ))}
                    </VStack>
                  </DetailSection>
                );
              })}
            </VStack>
          )}

          {detailKey === "funder" && applicationContext?.funder && (
            <VStack align="stretch" gap={5}>
              <VStack align="stretch" gap={0}>
                <DetailRow
                  label={t("context-detail-funder")}
                  value={applicationContext.funder.name}
                />
                <DetailRow
                  label={t("context-detail-opportunity")}
                  value={
                    applicationContext.opportunity?.name || t("not-available")
                  }
                />
                <DetailRow
                  label={t("context-detail-template")}
                  value={
                    applicationContext.template?.name || t("not-available")
                  }
                />
                <DetailRow
                  label={t("context-detail-output-format")}
                  value={
                    applicationContext.template?.output_format ||
                    t("not-available")
                  }
                />
              </VStack>

              {applicationContext.template && (
                <>
                  <DetailSection title={t("context-detail-template-chapters")}>
                    <VStack align="stretch" gap={2}>
                      {applicationContext.template.chapter_schema.map(
                        (chapter, index) => (
                          <HStack
                            key={chapter.chapter_ref}
                            align="start"
                            justify="space-between"
                            gap={3}
                            border="1px solid"
                            borderColor="border.neutral"
                            borderRadius="rounded"
                            p={3}
                          >
                            <Text fontSize="body.sm" color="content.primary">
                              {index + 1}. {chapter.title}
                            </Text>
                            {chapter.required && (
                              <Text
                                flexShrink={0}
                                fontSize="10px"
                                color="content.link"
                              >
                                {t("required")}
                              </Text>
                            )}
                          </HStack>
                        ),
                      )}
                    </VStack>
                  </DetailSection>

                  <DetailSection title={t("context-detail-required-fields")}>
                    <Text fontSize="label.sm" color="content.secondary">
                      {applicationContext.template.required_fields.length
                        ? applicationContext.template.required_fields.join(", ")
                        : t("context-detail-no-required-fields")}
                    </Text>
                  </DetailSection>
                </>
              )}
            </VStack>
          )}
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
}
