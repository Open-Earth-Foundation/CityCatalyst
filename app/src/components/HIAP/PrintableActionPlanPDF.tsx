"use client";
import React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import type { TFunction } from "i18next";
import { ACTION_TYPES, AdaptationAction, HIAction, MitigationAction } from "@/util/types";

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 11,
  },
  header: {
    fontSize: 18,
    fontWeight: 700,
  },
  subHeader: {
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#CCCCCC',
    marginTop: 4,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    marginTop: 12,
    marginBottom: 8,
    fontWeight: 700,
  },
  row: { marginBottom: 6 },
  text: { lineHeight: 1.6 },
  label: { fontWeight: 700 },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    fontSize: 10,
    color: '#666666',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export function PrintableActionPlanPDF({
  actions,
  t,
  cityName,
}: {
  actions: HIAction[];
  t: TFunction;
  cityName?: string;
}) {
  return (
    <Document>
      {actions.map((action) => (
        <Page key={action.id} size="A4" style={styles.page} wrap>
          <View>
            {cityName ? <Text style={[styles.subHeader, styles.text]}>{cityName}</Text> : null}
            <Text style={styles.text}>{t(`actions-of.${action.type}`)}</Text>
            <View style={styles.divider} />
          </View>

          <View>
              <Text style={styles.sectionTitle}>
                {`#${action.rank} ${action.name}`}
              </Text>

            <Text style={styles.text}>{action.description}</Text>

            {action.type === ACTION_TYPES.Mitigation ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.text}>
                    <Text style={styles.label}>{t("sector-label")}: </Text>
                    {(action as MitigationAction).sectors
                      .map((s) => t(`sector.${s}`))
                      .join(", ")}
                  </Text>
                </View>
                <View>
                  <Text style={styles.label}>{t("ghg-reduction")}</Text>
                  {Object.entries(
                    (action as MitigationAction).GHGReductionPotential,
                  )
                    .filter(([, v]) => v !== null)
                    .map(([sector, val]) => (
                      <Text key={sector} style={styles.text}>
                        {t(`sector.${sector}`)}: {String(val)}%
                      </Text>
                    ))}
                </View>
              </>
            ) : (
              <>
                <View style={styles.row}>
                  <Text style={styles.text}>
                    <Text style={styles.label}>{t("hazards-covered")}: </Text>
                    {(action as AdaptationAction).hazards
                      ?.map((h) => t(`hazard.${h}`))
                      .join(", ")}
                  </Text>
                </View>
                {(action as AdaptationAction).adaptationEffectiveness ? (
                  <View style={styles.row}>
                    <Text style={styles.text}>
                      <Text style={styles.label}>
                        {t("adaptation-effectiveness")}:{" "}
                      </Text>
                      {t(
                        `effectiveness-level.${(action as AdaptationAction).adaptationEffectiveness}`,
                      )}
                    </Text>
                  </View>
                ) : null}
                {Object.entries(
                  (action as AdaptationAction)
                    .adaptationEffectivenessPerHazard || {},
                )
                  .filter(([, v]) => v !== null)
                  .map(([hazard, eff]) => (
                    <Text key={hazard} style={styles.text}>
                      {t(`hazard.${hazard}`)}:{" "}
                      {t(`effectiveness-level.${String(eff)}`)}
                    </Text>
                  ))}
              </>
            )}

            {action.costInvestmentNeeded || action.timelineForImplementation ? (
              <>
                {action.costInvestmentNeeded ? (
                  <Text style={styles.text}>
                    <Text style={styles.label}>{t("cost")}: </Text>
                    {t(`cost-level.${action.costInvestmentNeeded}`)}
                  </Text>
                ) : null}
                {action.timelineForImplementation ? (
                  <Text style={styles.text}>
                    <Text style={styles.label}>{t("timeline-label")}: </Text>
                    {t(`timeline.${action.timelineForImplementation}`)}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>

          <View style={styles.footer} fixed>
            <Text>{cityName ?? ""}</Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} / ${totalPages}`
              }
            />
          </View>
        </Page>
      ))}
    </Document>
  );
}

export default PrintableActionPlanPDF;


