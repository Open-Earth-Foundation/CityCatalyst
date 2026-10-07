/**
 * Financing feasibility — methodology §5.2, as revised on Sep 8/15 2026.
 *
 * The lookup below is the document's §5.2.6 table verbatim. The numeric score
 * per tier is PENDING (sign-off item #18); the values here are the obvious
 * evenly-spaced placeholders and are labelled as such in the UI.
 */
import type {
  AdaptationAction,
  CapagGrade,
  CityFixture,
  FundingPathwayKey,
  Localized,
} from "./types";
import { localized as l } from "./localized";

export type CreditScreen = "available" | "not_indicated" | "to_verify";

export function creditScreen(capag: CapagGrade): CreditScreen {
  if (capag === "A" || capag === "B") return "available";
  if (capag === "nd") return "to_verify";
  return "not_indicated";
}

export type PushBucket = "minimal" | "developing" | "established" | "extensive";

export function pushBucket(score: number): PushBucket {
  if (score <= 3) return "minimal";
  if (score <= 6) return "developing";
  if (score <= 9) return "established";
  return "extensive";
}

export const isPushStrong = (score: number) => score >= 7;

export type FundingGap =
  | "self_deliverable"
  | "credit_available"
  | "needs_technical_assistance"
  | "needs_cofinance"
  | "needs_cofinance_and_ta";

export type FundingTier = "T1" | "T2" | "T3" | "T4";

export const GAP_TIER: Record<FundingGap, FundingTier> = {
  self_deliverable: "T1",
  credit_available: "T1",
  needs_technical_assistance: "T2",
  needs_cofinance: "T3",
  needs_cofinance_and_ta: "T4",
};

/** Placeholder numeric score per tier — PENDING sign-off #18. */
export const TIER_SCORE: Record<FundingTier, number> = {
  T1: 1.0,
  T2: 0.75,
  T3: 0.5,
  T4: 0.25,
};

export interface FundingResult {
  gap: FundingGap;
  tier: FundingTier;
  /** For "credit status to verify", the outcome if the screen fails. */
  ifCreditNotIndicated?: FundingGap;
  credit: CreditScreen;
  push: PushBucket;
}

/** §5.2.6 ordered rules. */
function lookup(
  strong: boolean,
  prep: AdaptationAction["preparationComplexity"],
  cost: AdaptationAction["costBand"],
  credit: "available" | "not_indicated",
): FundingGap {
  if (cost === "low") {
    if (strong) return "self_deliverable";
    if (prep !== "high") return "self_deliverable";
    return "needs_technical_assistance";
  }
  if (credit === "available") {
    if (strong) return "credit_available";
    if (prep === "low") return "credit_available";
    return "needs_technical_assistance";
  }
  return strong ? "needs_cofinance" : "needs_cofinance_and_ta";
}

export function fundingResult(
  action: AdaptationAction,
  city: CityFixture,
): FundingResult {
  const credit = creditScreen(city.capag);
  const strong = isPushStrong(city.financePush);
  const push = pushBucket(city.financePush);
  if (credit === "to_verify") {
    const ifYes = lookup(
      strong,
      action.preparationComplexity,
      action.costBand,
      "available",
    );
    const ifNo = lookup(
      strong,
      action.preparationComplexity,
      action.costBand,
      "not_indicated",
    );
    return {
      gap: ifYes,
      tier: GAP_TIER[ifYes],
      ifCreditNotIndicated: ifNo,
      credit,
      push,
    };
  }
  const gap = lookup(
    strong,
    action.preparationComplexity,
    action.costBand,
    credit,
  );
  return { gap, tier: GAP_TIER[gap], credit, push };
}

export const GAP_LABEL: Record<FundingGap, Localized> = {
  self_deliverable: l("Self-deliverable", "Executável pelo município"),
  credit_available: l(
    "Credit pathway available under the preliminary screen",
    "Via de crédito disponível na triagem preliminar",
  ),
  needs_technical_assistance: l(
    "Needs technical assistance",
    "Requer assistência técnica",
  ),
  needs_cofinance: l(
    "Needs external co-finance",
    "Requer cofinanciamento externo",
  ),
  needs_cofinance_and_ta: l(
    "Needs co-finance and technical assistance",
    "Requer cofinanciamento e assistência técnica",
  ),
};

export const GAP_MEANING: Record<FundingGap, Localized> = {
  self_deliverable: l(
    "Start with municipal planning, routine procurement or a small external opportunity, then confirm the project cost.",
    "Comece pelo planejamento municipal, compras de rotina ou uma pequena oportunidade externa e, depois, confirme o custo do projeto.",
  ),
  credit_available: l(
    "Investigate eligible credit or blended finance. Confirm borrowing headroom, lender terms, project fit and guarantee requirements.",
    "Investigue crédito elegível ou financiamento misto. Confirme margem de endividamento, condições do credor, aderência do projeto e exigências de garantia.",
  ),
  needs_technical_assistance: l(
    "Prioritise feasibility work, engineering, safeguards, partnership design or application support before seeking finance.",
    "Priorize estudos de viabilidade, engenharia, salvaguardas, desenho de parcerias ou apoio à candidatura antes de buscar financiamento.",
  ),
  needs_cofinance: l(
    "Build a co-finance package around the non-credit routes and verify programme eligibility and counterpart requirements.",
    "Monte um pacote de cofinanciamento com as vias não creditícias e verifique elegibilidade e contrapartidas.",
  ),
  needs_cofinance_and_ta: l(
    "Pair technical assistance with a grant, transfer, state partner, consortium, accredited entity or other co-finance route.",
    "Combine assistência técnica com subvenção, transferência, parceiro estadual, consórcio, entidade credenciada ou outra via de cofinanciamento.",
  ),
};

export const CREDIT_LABEL: Record<CreditScreen, Localized> = {
  available: l(
    "Credit pathway available under the preliminary screen",
    "Via de crédito disponível na triagem preliminar",
  ),
  not_indicated: l(
    "Credit pathway not indicated under the preliminary screen",
    "Via de crédito não indicada na triagem preliminar",
  ),
  to_verify: l("Credit status to verify", "Situação de crédito a verificar"),
};

export const PUSH_LABEL: Record<PushBucket, Localized> = {
  minimal: l("Minimal (0–3)", "Mínima (0–3)"),
  developing: l("Developing (4–6)", "Em desenvolvimento (4–6)"),
  established: l("Established (7–9)", "Estabelecida (7–9)"),
  extensive: l("Extensive (10–14)", "Ampla (10–14)"),
};

export interface PathwayMeta {
  key: FundingPathwayKey;
  label: Localized;
  access: Localized;
  /** Whether the preliminary credit screen gates this route. */
  creditGated: boolean;
}

export const PATHWAYS: PathwayMeta[] = [
  {
    key: "domestic_grant",
    label: l(
      "Domestic climate and environmental grants",
      "Subvenções nacionais de clima e meio ambiente",
    ),
    access: l(
      "The city applies where eligible or enables a state, consortium or civil-society partner to apply.",
      "O município se candidata quando elegível ou habilita estado, consórcio ou parceiro da sociedade civil a fazê-lo.",
    ),
    creditGated: false,
  },
  {
    key: "domestic_credit",
    label: l(
      "Domestic climate and infrastructure credit",
      "Crédito nacional para clima e infraestrutura",
    ),
    access: l(
      "Reimbursable finance from BNDES, CAIXA/FGTS, a regional fund or state bank.",
      "Financiamento reembolsável do BNDES, CAIXA/FGTS, fundo regional ou banco estadual.",
    ),
    creditGated: true,
  },
  {
    key: "federal_transfer",
    label: l(
      "Federal transfers and public investment programmes",
      "Transferências federais e programas de investimento público",
    ),
    access: l(
      "Project submitted through Transferegov or a Novo PAC selection.",
      "Projeto submetido via Transferegov ou seleção do Novo PAC.",
    ),
    creditGated: false,
  },
  {
    key: "mdb_borrowing",
    label: l(
      "Direct external development-bank borrowing",
      "Empréstimo direto de banco multilateral",
    ),
    access: l(
      "Larger operation through COFIEX with federal authorisation and a Union guarantee.",
      "Operação de maior porte via COFIEX, com autorização federal e garantia da União.",
    ),
    creditGated: true,
  },
  {
    key: "international_grant",
    label: l(
      "International grant facilities",
      "Fundos internacionais não reembolsáveis",
    ),
    access: l(
      "Concept developed with the NDA and an accredited entity (BNDES, FUNBIO, CAIXA); the city does not apply directly.",
      "Proposta desenvolvida com a AND e uma entidade credenciada (BNDES, FUNBIO, CAIXA); o município não se candidata diretamente.",
    ),
    creditGated: false,
  },
  {
    key: "civil_defence",
    label: l(
      "Civil-defence and disaster finance",
      "Financiamento de defesa civil e desastres",
    ),
    access: l(
      "MIDR/Sedec and S2ID process for prevention, response or reconstruction.",
      "Processo MIDR/Sedec e S2ID para prevenção, resposta ou reconstrução.",
    ),
    creditGated: false,
  },
];

export const PATHWAY_BY_KEY: Record<FundingPathwayKey, PathwayMeta> =
  Object.fromEntries(PATHWAYS.map((p) => [p.key, p])) as Record<
    FundingPathwayKey,
    PathwayMeta
  >;

export function formatBrl(amount: number, lng: string): string {
  const millions = amount / 1_000_000;
  return (
    new Intl.NumberFormat(lng === "pt" ? "pt-BR" : "en", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 1,
      notation: "compact",
    }).format(amount) || `R$ ${millions.toFixed(1)}M`
  );
}
