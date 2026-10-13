/**
 * Mitigation-track fixture: the one Brazil pattern the mitigation UI adds to
 * MEED — shifts ranked first, interventions listed under each (methodology
 * comparison, "Brazil Mitigation: two-level"). Content is illustrative and the
 * whole tab is marked provisional ahead of the Oct 21 mitigation UI review.
 */
import type { MeedRankedActionResult } from "@/util/types/meed";
import type { MitigationShift } from "./types";
import { localized as l } from "./localized";

export const MITIGATION_SHIFTS: MitigationShift[] = [
  {
    id: "shift_transport_bus",
    name: l(
      "Shift the bus fleet to electric traction",
      "Eletrificar a frota de ônibus",
    ),
    description: l(
      "Replace diesel buses with battery-electric vehicles on municipal and concessioned routes.",
      "Substituir ônibus a diesel por veículos elétricos a bateria nas linhas municipais e concedidas.",
    ),
    sectorTag: "transportation",
    reductionBand: "high",
    impact: 0.82,
    alignment: 0.74,
    interventions: [
      {
        id: "int_bus_procure",
        name: l(
          "Procure electric buses through consortium purchasing",
          "Adquirir ônibus elétricos por compra consorciada",
        ),
        description: l(
          "Joint procurement with neighbouring municipalities to lower unit cost.",
          "Compra conjunta com municípios vizinhos para reduzir o custo unitário.",
        ),
        timeline: "<5 years",
        costBand: "high",
        impact: 0.8,
        feasibility: 0.55,
        alignment: 0.7,
        coBenefits: { air_quality: 2, public_health: 2, mobility: 1 },
      },
      {
        id: "int_bus_depot",
        name: l(
          "Build depot charging infrastructure",
          "Construir infraestrutura de recarga nas garagens",
        ),
        description: l(
          "Grid connection upgrades and chargers at existing depots.",
          "Reforço da conexão à rede e carregadores nas garagens existentes.",
        ),
        timeline: "<5 years",
        costBand: "medium",
        impact: 0.6,
        feasibility: 0.7,
        alignment: 0.65,
        coBenefits: { air_quality: 1, local_economy: 1 },
      },
      {
        id: "int_bus_concession",
        name: l(
          "Write electrification targets into concession contracts",
          "Incluir metas de eletrificação nos contratos de concessão",
        ),
        description: l(
          "Regulatory lever with no capital cost to the city.",
          "Instrumento regulatório sem custo de capital para o município.",
        ),
        timeline: "<5 years",
        costBand: "low",
        impact: 0.5,
        feasibility: 0.9,
        alignment: 0.8,
        coBenefits: { air_quality: 1 },
      },
    ],
  },
  {
    id: "shift_waste_lfg",
    name: l(
      "Capture and use landfill gas",
      "Capturar e aproveitar o gás de aterro",
    ),
    description: l(
      "Collect methane at the municipal landfill for flaring or energy recovery.",
      "Coletar o metano do aterro municipal para queima ou aproveitamento energético.",
    ),
    sectorTag: "waste",
    reductionBand: "medium",
    impact: 0.66,
    alignment: 0.62,
    interventions: [
      {
        id: "int_lfg_capture",
        name: l(
          "Install gas collection and flaring",
          "Instalar coleta e queima de gás",
        ),
        description: l(
          "Wells, headers and an enclosed flare.",
          "Drenos, coletores e flare fechado.",
        ),
        timeline: "<5 years",
        costBand: "medium",
        impact: 0.65,
        feasibility: 0.7,
        alignment: 0.6,
        coBenefits: { air_quality: 1, public_health: 1 },
      },
      {
        id: "int_lfg_energy",
        name: l("Add energy recovery", "Adicionar aproveitamento energético"),
        description: l(
          "Gas engines feeding the grid under a PPA.",
          "Motores a gás injetando na rede sob contrato de venda de energia.",
        ),
        timeline: "5-10 years",
        costBand: "high",
        impact: 0.7,
        feasibility: 0.45,
        alignment: 0.6,
        coBenefits: { local_economy: 1 },
      },
    ],
  },
  {
    id: "shift_buildings_solar",
    name: l(
      "Rooftop solar on public buildings",
      "Solar fotovoltaica em prédios públicos",
    ),
    description: l(
      "Photovoltaic systems on schools, health units and administrative buildings.",
      "Sistemas fotovoltaicos em escolas, unidades de saúde e prédios administrativos.",
    ),
    sectorTag: "stationary_energy",
    reductionBand: "medium",
    impact: 0.48,
    alignment: 0.8,
    interventions: [
      {
        id: "int_solar_schools",
        name: l("Solar on municipal schools", "Solar nas escolas municipais"),
        description: l(
          "Distributed generation under net metering.",
          "Geração distribuída com compensação de energia.",
        ),
        timeline: "<5 years",
        costBand: "medium",
        impact: 0.45,
        feasibility: 0.8,
        alignment: 0.85,
        coBenefits: { local_economy: 1, social_equity: 1 },
      },
      {
        id: "int_solar_ppa",
        name: l(
          "Shared-generation PPA with a local cooperative",
          "PPA de geração compartilhada com cooperativa local",
        ),
        description: l(
          "No capital outlay; long-term supply contract.",
          "Sem desembolso de capital; contrato de fornecimento de longo prazo.",
        ),
        timeline: "<5 years",
        costBand: "low",
        impact: 0.4,
        feasibility: 0.75,
        alignment: 0.7,
        coBenefits: { local_economy: 2 },
      },
    ],
  },
  {
    id: "shift_afolu_restoration",
    name: l(
      "Restore degraded pasture and riparian forest",
      "Restaurar pastagens degradadas e matas ciliares",
    ),
    description: l(
      "Removals through restoration on municipal and partnered private land.",
      "Remoções por restauração em terras municipais e privadas parceiras.",
    ),
    sectorTag: "afolu",
    reductionBand: "low",
    impact: 0.3,
    alignment: 0.9,
    interventions: [
      {
        id: "int_afolu_psa",
        name: l(
          "Payment for ecosystem services programme",
          "Programa de pagamento por serviços ambientais",
        ),
        description: l(
          "Municipal PSA law and fund.",
          "Lei e fundo municipal de PSA.",
        ),
        timeline: "5-10 years",
        costBand: "medium",
        impact: 0.3,
        feasibility: 0.6,
        alignment: 0.9,
        coBenefits: { biodiversity: 2, water_quality: 2, local_economy: 1 },
      },
    ],
  },
];

export const MITIGATION_WEIGHTS = {
  impact: 0.55,
  alignment: 0.22,
  feasibility: 0.23,
};

/** Interventions flattened into ranked results, in shift order. */
export function mitigationRanked(
  shifts: MitigationShift[],
): MeedRankedActionResult[] {
  const rows: MeedRankedActionResult[] = [];
  const w = MITIGATION_WEIGHTS;
  for (const shift of shifts) {
    for (const i of shift.interventions) {
      rows.push({
        action_id: i.id,
        rank: 0,
        final_score:
          w.impact * i.impact +
          w.alignment * i.alignment +
          w.feasibility * i.feasibility,
        impact_score: i.impact,
        alignment_score: i.alignment,
        feasibility_score: i.feasibility,
        evidence_summary: { shift_id: shift.id },
      });
    }
  }
  rows.sort((a, b) => b.final_score - a.final_score);
  rows.forEach((r, idx) => (r.rank = idx + 1));
  return rows;
}
