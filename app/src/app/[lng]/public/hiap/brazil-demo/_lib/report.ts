/**
 * Report chapters from fixtures, in the shape `buildReportPdf` renders — the
 * same eight-chapter structure the methodology specifies (§8.1) and the MEED
 * report already produces, so the download is real even though no LLM ran.
 */
import type { TFunction } from "i18next";
import type { MeedReportActionDocument } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/reportDocument";
import type { TrackData } from "./useTrack";
import { ACTION_BY_ID } from "./actions";
import {
  fundingResult,
  GAP_LABEL,
  GAP_MEANING,
  PATHWAY_BY_KEY,
  formatBrl,
  CREDIT_LABEL,
} from "./finance";
import {
  GRADE_LABEL,
  LEVEL_LABEL,
  legalGrade,
  AUTHORITY_LABEL,
  COMPETENCE_LABEL,
} from "./legal";
import { pick } from "./localized";
import {
  RISK_CELL_BY_KEY,
  SECTOR_LABEL,
  UNCOVERED_HAZARD_LABEL,
} from "./riskCells";
import { componentScore, explainRanking } from "./ranking";
import { CO_BENEFIT_LABEL, suppressedCoBenefits } from "./coBenefits";
import type { CoBenefitKey } from "./types";

function reading(v: number, t: TFunction): string {
  if (v >= 0.8) return t("reading-very-high");
  if (v >= 0.6) return t("reading-high");
  if (v >= 0.4) return t("reading-medium");
  if (v >= 0.2) return t("reading-low");
  return t("reading-very-low");
}

export function buildDemoReport(
  ids: string[],
  data: TrackData,
  lng: string,
  t: TFunction,
): MeedReportActionDocument[] {
  const { city, adaptation, ranked, index } = data;
  return ids.flatMap((id) => {
    const scored = adaptation?.ranked.find((s) => s.action.id === id) ?? null;
    const action = ACTION_BY_ID[id];
    const row = ranked.find((r) => r.action_id === id);
    const name = index.get(id)?.actionName ?? id;
    if (!action || !row) {
      // Mitigation interventions: a short document from the catalog row.
      return [
        {
          actionId: id,
          actionName: name,
          sections: [
            {
              key: "snapshot",
              title: t("report-ch-snapshot"),
              markdown: `**${t("report-ask")}** ${index.get(id)?.description ?? ""}\n\n| ${t("report-col-checked")} | ${t("report-col-reading")} |\n|---|---|\n| ${t("report-row-impact")} | ${row ? row.impact_score.toFixed(2) : "—"} |\n| ${t("report-row-feasibility")} | ${row ? row.feasibility_score.toFixed(2) : "—"} |\n| ${t("report-row-alignment")} | ${row ? row.alignment_score.toFixed(2) : "—"} |`,
              limitations: [t("report-lim-mitigation")],
            },
          ],
        },
      ];
    }

    const funding = fundingResult(action, city);
    const grade = legalGrade(action.legal.score);
    const topCell = scored?.cells[0];
    const sector = pick(SECTOR_LABEL[action.sector], lng);

    const snapshot = [
      `**${t("report-ask")}** ${pick(action.description, lng)}`,
      "",
      scored
        ? t("report-rank-line", {
            city: city.name,
            name,
            rank: scored.rank,
            total: ranked.length,
          })
        : t("report-unranked-line", { city: city.name, name }),
      "",
      `| ${t("report-col-checked")} | ${t("report-col-reading")} | ${t("report-col-detail")} |`,
      "|---|---|---|",
      `| ${t("report-row-climate")} | ${scored ? reading(scored.impact, t) : t("report-na")} | ${topCell ? t("report-detail-climate", { cell: pick(RISK_CELL_BY_KEY[topCell.cell].label, lng) }) : action.uncoveredHazard ? t("report-detail-uncovered", { hazard: pick(UNCOVERED_HAZARD_LABEL[action.uncoveredHazard], lng) }) : t("report-na")} |`,
      `| ${t("report-row-fit")} | ${scored ? reading(scored.feasibility, t) : t("report-na")} | ${t("report-detail-fit", { legal: pick(GRADE_LABEL[grade], lng), funding: pick(GAP_LABEL[funding.gap], lng) })} |`,
      `| ${t("report-row-policy")} | ${reading(action.policy.score / 100, t)} | ${t("report-detail-policy", { score: action.policy.score.toFixed(1), count: action.policy.evidence.length })} |`,
      `| ${t("report-row-legal")} | ${pick(GRADE_LABEL[grade], lng)} | ${t("report-detail-legal", { score: action.legal.score.toFixed(1), level: pick(LEVEL_LABEL[action.legal.responsibleLevel], lng) })} |`,
      `| ${t("report-row-funding")} | ${pick(GAP_LABEL[funding.gap], lng)} | ${pick(CREDIT_LABEL[funding.credit], lng)} |`,
      `| ${t("report-row-track")} | ${action.comparableProjects.length ? t("report-projects-count", { count: action.comparableProjects.length }) : t("report-na")} | ${action.comparableProjects.map((p) => p.city).join(", ") || t("report-na")} |`,
      "",
      scored ? explainRanking(scored, city, lng) : "",
    ].join("\n");

    const impactRows = action.links
      .filter((l) => l.directness === "direct")
      .map((l) => {
        const r = city.risk[l.cell];
        return `| ${pick(RISK_CELL_BY_KEY[l.cell].label, lng)} | ${t(`component-${l.component}`)} | ${t(`effectiveness-${l.effectiveness}`)} / ${t(`confidence-${l.confidence}`)} | ${componentScore(l, action).toFixed(2)} | ${r ? r[l.component].toFixed(2) : "—"} |`;
      });
    const impact = [
      action.uncoveredHazard
        ? t("report-impact-uncovered", {
            hazard: pick(UNCOVERED_HAZARD_LABEL[action.uncoveredHazard], lng),
          })
        : t("report-impact-intro", { sector }),
      "",
      ...(impactRows.length
        ? [
            `| ${t("drawer-col-cell")} | ${t("drawer-col-component")} | ${t("report-col-effectiveness")} | ${t("report-col-score")} | ${t("drawer-col-city-index")} |`,
            "|---|---|---|---:|---:|",
            ...impactRows,
          ]
        : []),
      "",
      scored && topCell
        ? t("drawer-impact-formula", {
            cell: pick(RISK_CELL_BY_KEY[topCell.cell].label, lng),
            raw: topCell.raw.toFixed(2),
            impact: scored.impact.toFixed(2),
          })
        : "",
    ].join("\n");

    const legal = [
      t("report-legal-intro", {
        grade: pick(GRADE_LABEL[grade], lng),
        score: action.legal.score.toFixed(1),
        level: pick(LEVEL_LABEL[action.legal.responsibleLevel], lng),
      }),
      "",
      `| ${t("legal-col-norm")} | ${t("legal-col-authority")} | ${t("legal-col-competence")} |`,
      "|---|---|---|",
      ...action.legal.norms.map(
        (n) =>
          `| ${n.name} (${n.code}) | ${pick(AUTHORITY_LABEL[n.authority], lng)} | ${pick(COMPETENCE_LABEL[n.competence], lng)} |`,
      ),
    ].join("\n");

    const finance = [
      `**${pick(GAP_LABEL[funding.gap], lng)}.** ${pick(GAP_MEANING[funding.gap], lng)}`,
      "",
      `| ${t("finance-col-pathway")} | ${t("finance-col-access")} |`,
      "|---|---|",
      ...action.pathways.map(
        (k) =>
          `| ${pick(PATHWAY_BY_KEY[k].label, lng)} | ${pick(PATHWAY_BY_KEY[k].access, lng)} |`,
      ),
      ...(action.comparableProjects.length
        ? [
            "",
            `### ${t("finance-projects-title")}`,
            "",
            `| ${t("finance-col-project")} | ${t("finance-col-channel")} | ${t("finance-col-amount")} | ${t("finance-col-stage")} |`,
            "|---|---|---:|---|",
            ...action.comparableProjects.map(
              (p) =>
                `| ${p.name} — ${p.city} | ${pick(p.channel, lng)} | ${formatBrl(p.amountBrl, lng)} | ${pick(p.stage, lng)} |`,
            ),
          ]
        : []),
    ].join("\n");

    const policy = action.policy.evidence.length
      ? [
          t("report-policy-intro", {
            score: action.policy.score.toFixed(1),
            count: action.policy.evidence.length,
          }),
          "",
          `| ${t("policy-col-document")} | ${t("policy-col-page")} | ${t("policy-col-match")} | ${t("policy-col-text")} |`,
          "|---|---:|---|---|",
          ...action.policy.evidence.map(
            (e) =>
              `| ${e.document} | p. ${e.page} | ${t(`match-${e.match}`)} · ${t(`strength-${e.strength}`)} | ${e.pt} |`,
          ),
        ].join("\n")
      : t("report-policy-none");

    const suppressed = new Set(suppressedCoBenefits(action));
    const coBenefits = [
      `| ${t("report-col-cobenefit")} | ${t("report-col-score")} |`,
      "|---|---:|",
      ...(Object.entries(action.coBenefits) as [CoBenefitKey, number][]).map(
        ([k, v]) =>
          `| ${pick(CO_BENEFIT_LABEL[k], lng)}${suppressed.has(k) ? ` (${t("report-suppressed")})` : ""} | ${v > 0 ? "+" : ""}${v} |`,
      ),
    ].join("\n");

    const limitations = [
      t("report-lim-illustrative"),
      ...(action.provenance.legalReviewed ? [] : [t("report-lim-legal")]),
      ...(action.coBenefitsAiOnly ? [t("report-lim-cobenefits")] : []),
      ...(scored?.fallbacks.length ? [t("report-lim-fallbacks")] : []),
    ];

    return [
      {
        actionId: id,
        actionName: name,
        sections: [
          {
            key: "snapshot",
            title: t("report-ch-snapshot"),
            markdown: snapshot,
            limitations: [t("report-lim-illustrative")],
          },
          {
            key: "action",
            title: t("report-ch-action"),
            markdown: `${pick(action.description, lng)}\n\n- ${t("report-cost")}: ${t(`cost-${action.costBand}`)}\n- ${t("report-timeline")}: ${action.timeline}\n- ${t("report-scale")}: ${action.scale ? t(`scale-${action.scale}`) : t("report-na")}\n- ${t("report-aim")}: ${action.aimStrategy ? t(`aim-${action.aimStrategy}`) : t("report-na")}`,
            limitations: [],
          },
          {
            key: "impact",
            title: t("report-ch-impact"),
            markdown: impact,
            limitations: [t("report-lim-index")],
          },
          {
            key: "legal",
            title: t("report-ch-legal"),
            markdown: legal,
            limitations: action.provenance.legalReviewed
              ? []
              : [t("report-lim-legal")],
          },
          {
            key: "finance",
            title: t("report-ch-finance"),
            markdown: finance,
            limitations: [t("report-lim-finance")],
          },
          {
            key: "policy",
            title: t("report-ch-policy"),
            markdown: policy,
            limitations: [],
          },
          {
            key: "cobenefits",
            title: t("report-ch-cobenefits"),
            markdown: coBenefits,
            limitations: action.coBenefitsAiOnly
              ? [t("report-lim-cobenefits")]
              : [],
          },
          {
            key: "sources",
            title: t("report-ch-sources"),
            markdown: t("report-sources-body"),
            limitations,
          },
        ],
      },
    ];
  });
}
