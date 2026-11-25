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
import { LuExternalLink } from "react-icons/lu";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleLarge } from "@/components/package/Texts/Title";
import type { MeedTone } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { DemoShell } from "../../../_components/DemoShell";
import { cityFromSlug } from "../../../_lib/useTrack";
import { useDemoT } from "../../../_lib/useDemoT";
import { useLabels } from "../../../_lib/useLabels";
import { SCREEN_IDS } from "../../../_lib/hrefs";
import { ADAPTATION_ACTIONS } from "../../../_lib/actions";
import {
  AUTHORITY_LABEL,
  COMPETENCE_LABEL,
  GRADE_LABEL,
  gradeReading,
  LEGAL_GRADES,
  LEVEL_LABEL,
  legalGrade,
} from "../../../_lib/legal";
import { pick } from "../../../_lib/localized";
import { ADAPTA_SECTORS, SECTOR_LABEL } from "../../../_lib/riskCells";
import { Level } from "../../../_components/next/Level";
import { SectorGlyph } from "../../../_components/next/SectorIcon";
import { TextLink } from "../../../_components/next/TextLink";
import { legalTone } from "../../../_components/next/rows";
import {
  ExpandableRow,
  RowList,
} from "../../../_components/next/ExpandableRow";
import {
  FacetFilters,
  useLocationHash,
  useUrlSelection,
} from "../../../_components/next/ListControls";
import { matchesFacets, type Facet } from "../../../_components/next/facets";
import type { AdaptationAction } from "../../../_lib/types";

/** Legal grades in three bins, the same green / amber / red as the levels. */
const LEGAL_BIN: Partial<Record<MeedTone, string>> = {
  positive: "feasible",
  warning: "adjustments",
  negative: "heavy",
};

/**
 * BR-N7 — proposal: legal feasibility as one expandable list, on the pattern
 * of the policy-alignment page. The authority × competence explanation
 * appears once, with what each grade means one click away; each row shows
 * the grade, and opens on labelled facts, one sentence on why it got that
 * grade (read from its norms) and the norms themselves.
 */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const labels = useLabels(lng, "adaptation");
  // A deep link (#<id>, e.g. from the action drawer) opens its row.
  const hash = useLocationHash();
  const [openState, setOpen] = useState<string | null | undefined>(undefined);
  const open = openState === undefined ? hash || null : openState;
  const [selected, setSelected] = useUrlSelection(["sector", "legal", "cost"]);
  const [legendOpen, setLegendOpen] = useState(false);
  // One sentence on why an action got its grade, from its norms.
  const gradeWhy = (a: AdaptationAction) => {
    const grade = pick(
      GRADE_LABEL[legalGrade(a.legal.score)],
      lng,
    ).toLocaleLowerCase(lng === "pt" ? "pt-BR" : "en");
    const r = gradeReading(a.legal);
    if (r.total === 0) return t("next-legal-why-no-norms", { grade });
    return t("next-legal-why", {
      grade,
      authority: t(`next-legal-why-auth-${r.authority}`, {
        count: r.fullAuthority,
        total: r.total,
      }),
      competence: t(`next-legal-why-comp-${r.competence}`, {
        count: r.exclusive,
        total: r.total,
      }),
    });
  };

  const all = [...ADAPTATION_ACTIONS].sort(
    (a, b) => b.legal.score - a.legal.score,
  );
  const facets: Facet<AdaptationAction>[] = [
    {
      key: "sector",
      title: t("next-filter-sectors"),
      options: ADAPTA_SECTORS.map((k) => ({
        value: k,
        label: labels.sector(k),
      })),
      values: (a) => [a.sector],
      chip: (o) => o.label,
    },
    {
      key: "legal",
      title: t("next-filter-legal"),
      options: ["feasible", "adjustments", "heavy"].map((k) => ({
        value: k,
        label: t(`next-legal-bin-${k}`),
      })),
      values: (a) => [
        LEGAL_BIN[legalTone(legalGrade(a.legal.score))] ?? "heavy",
      ],
    },
    {
      key: "cost",
      title: t("next-filter-cost"),
      options: ["low", "medium", "high"].map((k) => ({
        value: k,
        label: t(`next-cost-${k}`),
      })),
      values: (a) => [a.costBand],
      chip: (o) => o.label,
    },
  ];
  const actions = all.filter((a) => matchesFacets(a, facets, selected));
  const counts = LEGAL_GRADES.map((g) => ({
    g,
    n: all.filter((a) => legalGrade(a.legal.score) === g).length,
  })).filter((c) => c.n > 0);

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="legal"
      screenId={SCREEN_IDS.next.legal}
      title={t("legal-title")}
      description={t("next-legal-intro")}
      backLabel={t("back-to-home")}
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
                  {t("next-legal-axis-authority-body")}
                </BodyMedium>
              </VStack>
              <VStack alignItems="stretch" gap="xs">
                <Overline color="content.tertiary">
                  {t("legal-axis-competence")}
                </Overline>
                <BodyMedium color="content.secondary">
                  {t("next-legal-axis-competence-body")}
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
            {/* What each grade means, on demand. */}
            <Collapsible.Root
              open={legendOpen}
              onOpenChange={(d) => setLegendOpen(d.open)}
            >
              <Box data-testid="legal-legend-toggle">
                <TextLink
                  arrow={false}
                  onClick={() => setLegendOpen((v) => !v)}
                >
                  {legendOpen
                    ? t("next-legal-legend-hide")
                    : t("next-legal-legend-show")}
                </TextLink>
              </Box>
              <Collapsible.Content>
                <VStack
                  as="dl"
                  alignItems="stretch"
                  gap="m"
                  pt="m"
                  data-testid="legal-legend"
                >
                  {LEGAL_GRADES.map((g) => (
                    <SimpleGrid
                      key={g}
                      columns={{ base: 1, md: 3 }}
                      gap={{ base: "xs", md: "l" }}
                    >
                      <Box as="dt">
                        <Level tone={legalTone(g)}>
                          {pick(GRADE_LABEL[g], lng)}
                        </Level>
                      </Box>
                      <Box as="dd" gridColumn={{ base: "auto", md: "span 2" }}>
                        <BodySmall color="content.secondary">
                          {t(`next-legal-grade-def-${g}`)}
                        </BodySmall>
                      </Box>
                    </SimpleGrid>
                  ))}
                </VStack>
              </Collapsible.Content>
            </Collapsible.Root>
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
            <BodySmall color="content.tertiary">
              {t("next-bank-scope")}
            </BodySmall>
          </VStack>
        </HStack>

        <FacetFilters
          items={all}
          facets={facets}
          selected={selected}
          onChange={setSelected}
          t={t}
        />

        <RowList>
          {actions.map((a) => {
            const grade = legalGrade(a.legal.score);
            const isOpen = open === a.id;
            return (
              <ExpandableRow
                key={a.id}
                id={a.id}
                open={isOpen}
                onOpenChange={(o) => setOpen(o ? a.id : null)}
                title={pick(a.name, lng)}
                meta={
                  <>
                    <SectorGlyph sector={a.sector} size="12px" />{" "}
                    {pick(SECTOR_LABEL[a.sector], lng)}
                  </>
                }
                aside={
                  <Level tone={legalTone(grade)}>
                    {pick(GRADE_LABEL[grade], lng)}
                  </Level>
                }
              >
                <VStack alignItems="stretch" gap="l">
                  {/* Every part of the old grey subtitle, with its label. */}
                  <HStack gap="xl" flexWrap="wrap" alignItems="flex-start">
                    <VStack alignItems="flex-start" gap="xs">
                      <Overline color="content.tertiary">
                        {t("next-legal-fact-sector")}
                      </Overline>
                      <HStack gap="xs" alignItems="center">
                        <SectorGlyph sector={a.sector} />
                        <BodySmall color="content.primary">
                          {pick(SECTOR_LABEL[a.sector], lng)}
                        </BodySmall>
                      </HStack>
                    </VStack>
                    <VStack alignItems="flex-start" gap="xs">
                      <Overline color="content.tertiary">
                        {t("next-legal-fact-level")}
                      </Overline>
                      <BodySmall color="content.primary">
                        {pick(LEVEL_LABEL[a.legal.responsibleLevel], lng)}
                      </BodySmall>
                    </VStack>
                    <VStack alignItems="flex-start" gap="xs">
                      <Overline color="content.tertiary">
                        {t("next-legal-fact-norms")}
                      </Overline>
                      <BodySmall color="content.primary">
                        {t("next-legal-norms", { count: a.legal.norms.length })}
                      </BodySmall>
                    </VStack>
                  </HStack>
                  <BodyMedium color="content.primary" data-testid="legal-why">
                    {gradeWhy(a)}
                  </BodyMedium>
                  {/* On a phone the two axes move under the norm's name. */}
                  <Table.Root size={{ base: "sm", md: "md" }}>
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>
                          {t("legal-col-norm")}
                        </Table.ColumnHeader>
                        <Table.ColumnHeader
                          display={{ base: "none", sm: "table-cell" }}
                        >
                          {t("legal-col-authority")}
                        </Table.ColumnHeader>
                        <Table.ColumnHeader
                          display={{ base: "none", sm: "table-cell" }}
                        >
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
                                    <Icon as={LuExternalLink} boxSize="12px" />
                                  </HStack>
                                </Link>
                              ) : (
                                <BodySmall color="content.tertiary">
                                  {n.code}
                                </BodySmall>
                              )}
                              <BodySmall
                                color="content.secondary"
                                display={{ base: "block", sm: "none" }}
                              >
                                {t("legal-col-authority")}:{" "}
                                {pick(AUTHORITY_LABEL[n.authority], lng)} ·{" "}
                                {t("legal-col-competence")}:{" "}
                                {pick(COMPETENCE_LABEL[n.competence], lng)}
                              </BodySmall>
                            </VStack>
                          </Table.Cell>
                          <Table.Cell
                            display={{ base: "none", sm: "table-cell" }}
                          >
                            <BodySmall color="content.secondary">
                              {pick(AUTHORITY_LABEL[n.authority], lng)}
                            </BodySmall>
                          </Table.Cell>
                          <Table.Cell
                            display={{ base: "none", sm: "table-cell" }}
                          >
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
                </VStack>
              </ExpandableRow>
            );
          })}
        </RowList>
      </VStack>
    </DemoShell>
  );
}
