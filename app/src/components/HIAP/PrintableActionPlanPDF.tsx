"use client";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { TFunction } from "i18next";
import { ACTION_TYPES, AdaptationAction, HIAction, MitigationAction } from "@/util/types";

// CityCatalyst brand palette (see src/lib/theme/recipes/app-theme.ts)
const BRAND = "#2351DC";
const BRAND_DARK = "#001EA7";
const INK = "#00001F";
const INK_SECONDARY = "#232640";
const INK_TERTIARY = "#4B4C63";
const BG_NEUTRAL = "#E8EAFB";
const BG_SUBTLE = "#F4F4F5";
const BORDER = "#D7D8FA";
const MUTED = "#888780";
const GREEN_BG = "#EAF3DE";
const GREEN_INK = "#27500A";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 44,
    paddingHorizontal: 32,
    fontSize: 11,
    color: INK,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { width: 104, height: 23 },
  headerMeta: { alignItems: "flex-end" },
  cityName: { fontSize: 12, fontWeight: 700, color: INK_SECONDARY },
  actionType: { fontSize: 10, color: INK_TERTIARY, marginTop: 2 },
  accentRule: {
    height: 2,
    backgroundColor: BRAND,
    marginTop: 10,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  rankChip: {
    backgroundColor: BG_NEUTRAL,
    color: BRAND_DARK,
    fontSize: 11,
    fontWeight: 700,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginRight: 8,
  },
  actionName: { fontSize: 15, fontWeight: 700, color: INK, flex: 1 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  tag: {
    backgroundColor: GREEN_BG,
    color: GREEN_INK,
    fontSize: 9,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  description: { lineHeight: 1.6, color: INK_SECONDARY, marginBottom: 14 },
  section: {
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 12,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: BRAND,
    letterSpacing: 0.4,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  value: { fontSize: 11, color: INK, lineHeight: 1.5, marginBottom: 10 },
  metricRow: { flexDirection: "row", marginBottom: 4 },
  metric: { marginRight: 40 },
  metricLabel: { fontSize: 9, color: MUTED, marginBottom: 2 },
  metricValue: { fontSize: 11, color: INK },
  pillRow: { flexDirection: "row", flexWrap: "wrap" },
  pill: {
    backgroundColor: BG_SUBTLE,
    color: INK_SECONDARY,
    fontSize: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  explanation: { lineHeight: 1.6, color: INK_TERTIARY, fontStyle: "italic" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: MUTED,
  },
});

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function PrintableActionPlanPDF({
  actions,
  t,
  lng,
  cityName,
}: {
  actions: HIAction[];
  t: TFunction;
  lng?: string;
  cityName?: string;
}) {
  return (
    <Document>
      {actions.map((action) => {
        const sectors = action.sectors ?? [];
        const purposes = action.primaryPurposes ?? [];
        const explanations = action.explanation?.explanations ?? {};
        const explanation =
          (lng ? explanations[lng] : undefined) ??
          explanations.en ??
          t("no-explanation-available");

        return (
          <Page key={action.id} size="A4" style={styles.page} wrap>
            <View>
              <View style={styles.header}>
                <Image style={styles.logo} src="/assets/citycatalyst-logo-blue.png" />
                <View style={styles.headerMeta}>
                  {cityName ? <Text style={styles.cityName}>{cityName}</Text> : null}
                  <Text style={styles.actionType}>
                    {t(`actions-of.${action.type}`)}
                  </Text>
                </View>
              </View>
              <View style={styles.accentRule} />
            </View>

            <View style={styles.titleRow}>
              <Text style={styles.rankChip}>#{action.rank}</Text>
              <Text style={styles.actionName}>{action.name}</Text>
            </View>

            {purposes.length > 0 ? (
              <View style={styles.tagRow}>
                {purposes.map((p) => (
                  <Text key={p} style={styles.tag}>
                    {t(`primary-purpose.${p}`)}
                  </Text>
                ))}
              </View>
            ) : null}

            <Text style={styles.description}>{action.description}</Text>

            {sectors.length > 0 ? (
              <Section label={t("sector-label")}>
                <Text style={styles.value}>
                  {sectors.map((s) => t(`sector.${s}`)).join(", ")}
                </Text>
              </Section>
            ) : null}

            {action.type === ACTION_TYPES.Mitigation ? (
              <Section label={t("ghg-reduction")}>
                <View style={styles.pillRow}>
                  {Object.entries((action as MitigationAction).GHGReductionPotential)
                    .filter(([, v]) => v !== null)
                    .map(([sector, val]) => (
                      <Text key={sector} style={styles.pill}>
                        {t(`sector.${sector}`)}: {String(val)}%
                      </Text>
                    ))}
                </View>
              </Section>
            ) : (
              <>
                {(action as AdaptationAction).hazards?.length ? (
                  <Section label={t("hazards-covered")}>
                    <Text style={styles.value}>
                      {(action as AdaptationAction).hazards
                        .map((h) => t(`hazard.${h}`))
                        .join(", ")}
                    </Text>
                  </Section>
                ) : null}
                {(action as AdaptationAction).adaptationEffectiveness ? (
                  <Section label={t("adaptation-effectiveness")}>
                    <Text style={styles.value}>
                      {t(
                        `effectiveness-level.${(action as AdaptationAction).adaptationEffectiveness}`,
                      )}
                    </Text>
                  </Section>
                ) : null}
                {Object.entries(
                  (action as AdaptationAction).adaptationEffectivenessPerHazard || {},
                ).filter(([, v]) => v !== null).length ? (
                  <Section label={t("adaptation-effectiveness-by-hazard")}>
                    <View style={styles.pillRow}>
                      {Object.entries(
                        (action as AdaptationAction).adaptationEffectivenessPerHazard ||
                          {},
                      )
                        .filter(([, v]) => v !== null)
                        .map(([hazard, eff]) => (
                          <Text key={hazard} style={styles.pill}>
                            {t(`hazard.${hazard}`)}:{" "}
                            {t(`effectiveness-level.${String(eff)}`)}
                          </Text>
                        ))}
                    </View>
                  </Section>
                ) : null}
              </>
            )}

            {action.costInvestmentNeeded || action.timelineForImplementation ? (
              <View style={styles.section}>
                <View style={styles.metricRow}>
                  {action.costInvestmentNeeded ? (
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>{t("cost")}</Text>
                      <Text style={styles.metricValue}>
                        {t(`cost-level.${action.costInvestmentNeeded}`)}
                      </Text>
                    </View>
                  ) : null}
                  {action.timelineForImplementation ? (
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>{t("timeline-label")}</Text>
                      <Text style={styles.metricValue}>
                        {t(`timeline.${action.timelineForImplementation}`)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            <Section label={t("action-explanation")}>
              <Text style={styles.explanation}>{explanation}</Text>
            </Section>

            <View style={styles.footer} fixed>
              <Text>{cityName ?? ""}</Text>
              <Text
                render={({ pageNumber, totalPages }) =>
                  `${t("pdf.footer.page")} ${pageNumber} / ${totalPages}`
                }
              />
            </View>
          </Page>
        );
      })}
    </Document>
  );
}

export default PrintableActionPlanPDF;
