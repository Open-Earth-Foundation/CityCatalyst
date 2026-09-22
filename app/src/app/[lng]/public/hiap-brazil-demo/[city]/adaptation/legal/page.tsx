"use client";
import React from "react";
import {
  Card,
  HStack,
  Icon,
  Link,
  SimpleGrid,
  Table,
  VStack,
} from "@chakra-ui/react";
import { LuExternalLink } from "react-icons/lu";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedFunnelStrip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedFunnelStrip";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { DemoShell } from "../../../_components/DemoShell";
import { cityFromSlug } from "../../../_lib/useTrack";
import { useDemoT } from "../../../_lib/useDemoT";
import { SCREEN_IDS } from "../../../_lib/hrefs";
import { ADAPTATION_ACTIONS } from "../../../_lib/actions";
import {
  AUTHORITY_LABEL,
  COMPETENCE_LABEL,
  GRADE_LABEL,
  GRADE_TONE,
  LEVEL_LABEL,
  legalGrade,
  type LegalGrade,
} from "../../../_lib/legal";
import { pick } from "../../../_lib/localized";
import { SECTOR_LABEL } from "../../../_lib/riskCells";

const GRADES: LegalGrade[] = [
  "highly_feasible",
  "feasible",
  "feasible_with_adjustments",
  "feasible_with_heavy_adjustments",
  "least_feasible",
  "not_feasible",
];

/** BR-A7 — legal feasibility (I Care's Sep 2026 method: authority × competence per norm). */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  const actions = [...ADAPTATION_ACTIONS].sort(
    (a, b) => b.legal.score - a.legal.score,
  );
  const counts = GRADES.map((g) => ({
    g,
    n: actions.filter((a) => legalGrade(a.legal.score) === g).length,
  }));
  const blocked = counts.find((c) => c.g === "not_feasible")?.n ?? 0;

  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="legal"
      screenId={SCREEN_IDS.adaptation.legal}
      title={t("legal-title")}
      description={t("legal-intro")}
      backLabel={t("back-to-home")}
      openPoints={[
        t("open-legal-classification"),
        t("open-legal-method"),
        t("open-legal-filter"),
      ]}
    >
      <Card.Root borderColor="border.overlay">
        <Card.Body>
          <VStack alignItems="stretch" gap="m">
            <MeedFunnelStrip
              steps={[
                {
                  label: t("funnel-bank"),
                  value: actions.length,
                  tone: "neutral",
                  sublabel: t("funnel-bank-sub"),
                },
                {
                  label: t("funnel-legal"),
                  value: actions.length - blocked,
                  tone: "info",
                  sublabel: t("legal-funnel-passed-sub"),
                },
                {
                  label: t("legal-funnel-strong"),
                  value: actions.filter((a) => a.legal.score >= 4).length,
                  tone: "positive",
                  sublabel: t("legal-funnel-strong-sub"),
                },
              ]}
              ariaLabel={t("funnel-aria")}
            />
            <HStack gap="s" flexWrap="wrap">
              {counts.map(({ g, n }) => (
                <MeedStatusTag key={g} tone={GRADE_TONE[g]}>
                  {pick(GRADE_LABEL[g], lng)} · {n}
                </MeedStatusTag>
              ))}
            </HStack>
          </VStack>
        </Card.Body>
      </Card.Root>

      <VStack alignItems="stretch" gap="m">
        <TitleMedium color="content.primary">
          {t("legal-actions-title")}
        </TitleMedium>
        {actions.map((a) => {
          const grade = legalGrade(a.legal.score);
          return (
            <Card.Root
              key={a.id}
              id={a.id}
              borderColor="border.overlay"
              scrollMarginTop="96px"
            >
              <Card.Body>
                <VStack alignItems="stretch" gap="m">
                  <HStack
                    justifyContent="space-between"
                    gap="m"
                    alignItems="flex-start"
                    flexWrap="wrap"
                  >
                    <VStack
                      alignItems="flex-start"
                      gap="xs"
                      flex="1"
                      minW="260px"
                    >
                      <LabelLarge color="content.primary">
                        {pick(a.name, lng)}
                      </LabelLarge>
                      <Caption color="content.tertiary">
                        {pick(SECTOR_LABEL[a.sector], lng)} · {a.id}
                      </Caption>
                    </VStack>
                    <VStack alignItems="flex-end" gap="xs">
                      <MeedStatusTag tone={GRADE_TONE[grade]}>
                        {pick(GRADE_LABEL[grade], lng)}
                      </MeedStatusTag>
                      <Caption color="content.tertiary">
                        {t("legal-score-line", {
                          score: a.legal.score.toFixed(1),
                          level: pick(
                            LEVEL_LABEL[a.legal.responsibleLevel],
                            lng,
                          ),
                        })}
                      </Caption>
                    </VStack>
                  </HStack>
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
                              <LabelMedium color="content.primary">
                                {n.name}
                              </LabelMedium>
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
                                <Caption color="content.tertiary">
                                  {n.code}
                                </Caption>
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
                </VStack>
              </Card.Body>
            </Card.Root>
          );
        })}
      </VStack>
    </DemoShell>
  );
}
