"use client";
import React, { useState } from "react";
import {
  Box,
  Card,
  Collapsible,
  HStack,
  Icon,
  Link,
  SimpleGrid,
  Table,
  VStack,
} from "@chakra-ui/react";
import { LuChevronDown, LuChevronUp, LuExternalLink } from "react-icons/lu";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleLarge } from "@/components/package/Texts/Title";
import { MeedChipGroup } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedChipGroup";
import { MeedMeter } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedMeter";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { DemoShell } from "../../../../_components/DemoShell";
import { cityFromSlug } from "../../../../_lib/useTrack";
import { useDemoT } from "../../../../_lib/useDemoT";
import { useLabels } from "../../../../_lib/useLabels";
import { SCREEN_IDS, trackHref } from "../../../../_lib/hrefs";
import { ADAPTATION_ACTIONS } from "../../../../_lib/actions";
import {
  AUTHORITY_LABEL,
  COMPETENCE_LABEL,
  GRADE_LABEL,
  LEVEL_LABEL,
  legalGrade,
  type LegalGrade,
} from "../../../../_lib/legal";
import { pick } from "../../../../_lib/localized";
import { ADAPTA_SECTORS, SECTOR_LABEL } from "../../../../_lib/riskCells";
import { Level } from "../../../../_components/next/Level";
import { SectorGlyph } from "../../../../_components/next/SectorIcon";
import { legalTone } from "../../../../_components/next/rows";

const GRADES: LegalGrade[] = [
  "highly_feasible",
  "feasible",
  "feasible_with_adjustments",
  "feasible_with_heavy_adjustments",
  "least_feasible",
  "not_feasible",
];

/**
 * BR-N7 — proposal: legal feasibility as one expandable list, on the pattern
 * of the policy-alignment page. The authority × competence explanation
 * appears once; each row shows the grade, and opens on the norms behind it.
 */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const labels = useLabels(lng, "adaptation");
  const [sectors, setSectors] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const all = [...ADAPTATION_ACTIONS].sort(
    (a, b) => b.legal.score - a.legal.score,
  );
  const actions = sectors.length
    ? all.filter((a) => sectors.includes(a.sector))
    : all;
  const counts = GRADES.map((g) => ({
    g,
    n: all.filter((a) => legalGrade(a.legal.score) === g).length,
  })).filter((c) => c.n > 0);

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="next/legal"
      screenId={SCREEN_IDS.next.legal}
      title={t("legal-title")}
      description={t("legal-intro")}
      backLabel={t("back-to-home")}
      homeHref={trackHref(lng, city.slug, "adaptation", "next")}
      openPoints={[t("next-notice-proposal"), t("next-notice-legal")]}
    >
      {/* How to read the grade — once, not on every card. */}
      <Card.Root borderColor="border.overlay">
        <Card.Body p="l">
          <VStack alignItems="stretch" gap="m">
            <TitleLarge color="content.primary">
              {t("next-legal-explainer-title")}
            </TitleLarge>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap="m">
              <VStack alignItems="stretch" gap="xs">
                <Overline color="content.tertiary">
                  {t("legal-axis-authority")}
                </Overline>
                <BodyMedium color="content.secondary">
                  {t("legal-axis-authority-body")}
                </BodyMedium>
              </VStack>
              <VStack alignItems="stretch" gap="xs">
                <Overline color="content.tertiary">
                  {t("legal-axis-competence")}
                </Overline>
                <BodyMedium color="content.secondary">
                  {t("legal-axis-competence-body")}
                </BodyMedium>
              </VStack>
            </SimpleGrid>
            <HStack gap="l" flexWrap="wrap">
              {counts.map(({ g, n }) => (
                <Level key={g} tone={legalTone(g)}>
                  {pick(GRADE_LABEL[g], lng)} · {n}
                </Level>
              ))}
            </HStack>
          </VStack>
        </Card.Body>
      </Card.Root>

      <VStack alignItems="stretch" gap="m">
        <HStack
          justifyContent="space-between"
          alignItems="flex-end"
          gap="m"
          flexWrap="wrap"
        >
          <VStack alignItems="flex-start" gap="xs">
            <TitleLarge color="content.primary">
              {t("legal-actions-title")}
            </TitleLarge>
            <BodySmall color="content.secondary">
              {t("next-legal-rows", { count: actions.length })}
            </BodySmall>
          </VStack>
          <VStack alignItems="flex-end" gap="xs">
            <BodySmall color="content.tertiary">
              {t("next-legal-filter")}
            </BodySmall>
            <MeedChipGroup
              options={ADAPTA_SECTORS.map((key) => ({
                value: key,
                label: labels.sector(key),
              }))}
              selected={sectors}
              onChange={setSectors}
              ariaLabel={t("next-legal-filter")}
            />
          </VStack>
        </HStack>

        <Card.Root overflow="hidden" borderColor="border.neutral">
          <VStack alignItems="stretch" gap="0">
            {actions.map((a) => {
              const grade = legalGrade(a.legal.score);
              const isOpen = open === a.id;
              return (
                <Collapsible.Root
                  key={a.id}
                  open={isOpen}
                  onOpenChange={(d) => setOpen(d.open ? a.id : null)}
                >
                  <Collapsible.Trigger asChild>
                    <Box
                      as="button"
                      id={a.id}
                      w="full"
                      textAlign="start"
                      px="l"
                      py="m"
                      borderBottomWidth="1px"
                      borderColor="border.overlay"
                      scrollMarginTop="96px"
                      _hover={{ bg: "background.neutral" }}
                      _focusVisible={FOCUS_RING}
                    >
                      <HStack
                        justifyContent="space-between"
                        gap="m"
                        flexWrap="wrap"
                      >
                        <VStack
                          alignItems="flex-start"
                          gap="xs"
                          flex="1"
                          minW="240px"
                        >
                          <LabelLarge color="content.primary">
                            {pick(a.name, lng)}
                          </LabelLarge>
                          <BodySmall color="content.tertiary">
                            <SectorGlyph sector={a.sector} size="12px" />{" "}
                            {pick(SECTOR_LABEL[a.sector], lng)} ·{" "}
                            {pick(LEVEL_LABEL[a.legal.responsibleLevel], lng)} ·{" "}
                            {t("next-legal-norms", {
                              count: a.legal.norms.length,
                            })}
                          </BodySmall>
                        </VStack>
                        <Box w="160px" display={{ base: "none", md: "block" }}>
                          <MeedMeter
                            value={(a.legal.score - 1) / 4}
                            tone={legalTone(grade)}
                          />
                        </Box>
                        <Level tone={legalTone(grade)}>
                          {pick(GRADE_LABEL[grade], lng)}
                        </Level>
                        <Icon
                          as={isOpen ? LuChevronUp : LuChevronDown}
                          boxSize="16px"
                          color="content.tertiary"
                        />
                      </HStack>
                    </Box>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <Box
                      px="l"
                      py="m"
                      bg="background.neutral"
                      borderBottomWidth="1px"
                      borderColor="border.overlay"
                    >
                      <Table.Root size="md">
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeader>
                              {t("legal-col-norm")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader>
                              {t("legal-col-authority")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader>
                              {t("legal-col-competence")}
                            </Table.ColumnHeader>
                            <Table.ColumnHeader
                              display={{ base: "none", md: "table-cell" }}
                            >
                              {t("legal-col-validation")}
                            </Table.ColumnHeader>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {a.legal.norms.map((n) => (
                            <Table.Row key={`${a.id}-${n.code}`}>
                              <Table.Cell>
                                <VStack alignItems="flex-start" gap="xs">
                                  <BodyMedium
                                    color="content.primary"
                                    fontWeight="semibold"
                                  >
                                    {n.name}
                                  </BodyMedium>
                                  {n.url ? (
                                    <Link
                                      href={n.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      color="content.link"
                                      fontSize="caption"
                                      _focusVisible={FOCUS_RING}
                                    >
                                      <HStack gap="xs">
                                        <span>{n.code}</span>
                                        <Icon
                                          as={LuExternalLink}
                                          boxSize="12px"
                                        />
                                      </HStack>
                                    </Link>
                                  ) : (
                                    <BodySmall color="content.tertiary">
                                      {n.code}
                                    </BodySmall>
                                  )}
                                </VStack>
                              </Table.Cell>
                              <Table.Cell>
                                <BodySmall color="content.secondary">
                                  {pick(AUTHORITY_LABEL[n.authority], lng)}
                                </BodySmall>
                              </Table.Cell>
                              <Table.Cell>
                                <BodySmall color="content.secondary">
                                  {pick(COMPETENCE_LABEL[n.competence], lng)}
                                </BodySmall>
                              </Table.Cell>
                              <Table.Cell
                                display={{ base: "none", md: "table-cell" }}
                              >
                                <BodySmall color="content.tertiary">
                                  {pick(n.validation, lng)}
                                </BodySmall>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    </Box>
                  </Collapsible.Content>
                </Collapsible.Root>
              );
            })}
          </VStack>
        </Card.Root>
      </VStack>
    </DemoShell>
  );
}
