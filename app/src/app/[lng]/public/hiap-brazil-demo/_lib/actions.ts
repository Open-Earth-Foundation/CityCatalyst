/**
 * A slice of the adaptation action bank — 14 of the 37 actions under review.
 *
 * From the methodology document: the seven actions of the illustrative ranking
 * table (§4.8), the watershed action's water-stress link (Medium / High /
 * 5–10 yr, §4.7), the five-action policy pilot scores (§6.2, ecosystem-based
 * adaptation 81.7, drainage 66.4, shelters 40.0, coastal protection 19.3,
 * shading 0.0), the drainage comparable projects (§5.2.7) and the ENA 2025
 * evidence point (§6.2.8). The sea-level-rise and public-shading actions are
 * the document's own examples of hazards outside AdaptaBrasil scope.
 *
 * Everything else — the other risk links, legal norms, co-benefit scores,
 * relationships — is illustrative and marked as unreviewed where the pilot
 * status would be. Two enabling actions are included because the Sep 8 review
 * decided indirect actions surface as complementary rather than scored.
 */
import type { AdaptationAction, LegalNorm } from "./types";
import { localized as l } from "./localized";

const CF88_30: LegalNorm = {
  name: "Constituição Federal, art. 30, I e VIII",
  code: "CF/1988",
  authority: "total",
  competence: "exclusive",
  url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
  validation: l(
    "Constitutional text; in force",
    "Texto constitucional; em vigor",
  ),
};
const CF88_23: LegalNorm = {
  name: "Constituição Federal, art. 23, VI e IX",
  code: "CF/1988",
  authority: "partial",
  competence: "concurrent",
  url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
  validation: l(
    "Constitutional text; in force",
    "Texto constitucional; em vigor",
  ),
};
const PNPDEC: LegalNorm = {
  name: "Política Nacional de Proteção e Defesa Civil",
  code: "Lei 12.608/2012",
  authority: "partial",
  competence: "supplementary",
  url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12608.htm",
  validation: l(
    "Checked against Planalto text, Sep 2026",
    "Verificada no texto do Planalto, set. 2026",
  ),
};
const SANEAMENTO: LegalNorm = {
  name: "Marco Legal do Saneamento Básico",
  code: "Lei 11.445/2007 (alt. Lei 14.026/2020)",
  authority: "partial",
  competence: "supplementary",
  url: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/lei/l11445.htm",
  validation: l(
    "Checked against Planalto text, Sep 2026",
    "Verificada no texto do Planalto, set. 2026",
  ),
};
const PNRH: LegalNorm = {
  name: "Política Nacional de Recursos Hídricos",
  code: "Lei 9.433/1997",
  authority: "partial",
  competence: "concurrent",
  url: "https://www.planalto.gov.br/ccivil_03/leis/l9433.htm",
  validation: l(
    "Checked against Planalto text, Sep 2026",
    "Verificada no texto do Planalto, set. 2026",
  ),
};
const SUS: LegalNorm = {
  name: "Lei Orgânica da Saúde",
  code: "Lei 8.080/1990",
  authority: "partial",
  competence: "supplementary",
  url: "https://www.planalto.gov.br/ccivil_03/leis/l8080.htm",
  validation: l(
    "Checked against Planalto text, Sep 2026",
    "Verificada no texto do Planalto, set. 2026",
  ),
};
const ESTATUTO: LegalNorm = {
  name: "Estatuto da Cidade",
  code: "Lei 10.257/2001",
  authority: "total",
  competence: "exclusive",
  url: "https://www.planalto.gov.br/ccivil_03/leis/leis_2001/l10257.htm",
  validation: l(
    "Checked against Planalto text, Sep 2026",
    "Verificada no texto do Planalto, set. 2026",
  ),
};
const CODIGO_FLORESTAL: LegalNorm = {
  name: "Código Florestal",
  code: "Lei 12.651/2012",
  authority: "partial",
  competence: "concurrent",
  url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651.htm",
  validation: l(
    "Checked against Planalto text, Sep 2026",
    "Verificada no texto do Planalto, set. 2026",
  ),
};
const GERCO: LegalNorm = {
  name: "Plano Nacional de Gerenciamento Costeiro",
  code: "Lei 7.661/1988",
  authority: "partial",
  competence: "concurrent",
  url: "https://www.planalto.gov.br/ccivil_03/leis/l7661.htm",
  validation: l(
    "Checked against Planalto text, Sep 2026",
    "Verificada no texto do Planalto, set. 2026",
  ),
};
const PNMC: LegalNorm = {
  name: "Política Nacional sobre Mudança do Clima",
  code: "Lei 12.187/2009",
  authority: "partial",
  competence: "concurrent",
  url: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l12187.htm",
  validation: l(
    "Checked against Planalto text, Sep 2026",
    "Verificada no texto do Planalto, set. 2026",
  ),
};

const PILOT_LEGAL = {
  placeholder: true,
};

export const ADAPTATION_ACTIONS: AdaptationAction[] = [
  {
    id: "icare_0104",
    source: "icare",
    name: l(
      "Protect and enhance water sources and watersheds",
      "Proteger e recuperar mananciais e bacias hidrográficas",
    ),
    description: l(
      "Protect springs, riparian zones and recharge areas that supply the municipality, and restore degraded watershed land, so that water availability, storage and supply alternatives improve during dry periods.",
      "Proteger nascentes, matas ciliares e áreas de recarga que abastecem o município e recuperar áreas degradadas das bacias, para melhorar a disponibilidade, o armazenamento e as alternativas de abastecimento em períodos secos.",
    ),
    sector: "water_resources",
    kind: "direct",
    timeline: "5-10 years",
    costBand: "medium",
    preparationComplexity: "high",
    scale: "regional",
    aimStrategy: "preventive",
    links: [
      {
        cell: "water_stress",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "medium",
        confidence: "high",
        rationale: l(
          "Increases water availability, storage and supply alternatives, which the AdaptaBrasil vulnerability indicators for water stress measure directly.",
          "Aumenta a disponibilidade, o armazenamento e as alternativas de abastecimento, que os indicadores de vulnerabilidade do AdaptaBrasil para estresse hídrico medem diretamente.",
        ),
      },
      {
        cell: "water_stress",
        component: "exposure",
        directness: "out_of_scope",
        rationale: l(
          "Does not reduce population density or the number and demand of exposed water users.",
          "Não reduz a densidade populacional nem o número e a demanda de usuários de água expostos.",
        ),
      },
      {
        cell: "food_availability",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "low",
        confidence: "medium",
        rationale: l(
          "Secondary link: more reliable irrigation water during drought.",
          "Vínculo secundário: água de irrigação mais confiável durante a seca.",
        ),
      },
    ],
    coBenefits: {
      water_quality: 2,
      biodiversity: 2,
      local_economy: 1,
      social_equity: 1,
    },
    coBenefitsAiOnly: false,
    relationships: [
      {
        kind: "prerequisite",
        actionId: "icare_0176",
        rationale: l(
          "The adaptation plan sets the watershed priorities and the governance the protection programme is delivered through.",
          "O plano de adaptação define as prioridades de bacias e a governança pela qual o programa de proteção é executado.",
        ),
      },
      {
        kind: "synergistic",
        actionId: "c40_0038",
        rationale: l(
          "Slope and watershed restoration and source protection work on the same land; together they hold water and soil better than either alone.",
          "A restauração de encostas e bacias e a proteção de mananciais atuam no mesmo território; juntas retêm água e solo melhor do que isoladas.",
        ),
      },
    ],
    legal: {
      score: 3.4,
      responsibleLevel: "shared",
      norms: [CF88_23, PNRH, CODIGO_FLORESTAL],
      ...PILOT_LEGAL,
    },
    pathways: ["domestic_grant", "federal_transfer", "international_grant"],
    comparableProjects: [
      {
        name: "Produtor de Água no PCJ",
        city: "Extrema, MG",
        channel: l(
          "Domestic climate and environmental grants",
          "Subvenções nacionais de clima e meio ambiente",
        ),
        instrument: l(
          "ANA payment for ecosystem services",
          "Pagamento por serviços ambientais (ANA)",
        ),
        amountBrl: 18_400_000,
        stage: l("Implemented", "Implementado"),
      },
    ],
    policy: {
      score: 58.2,
      evidence: [
        {
          document: "Plano Setorial de Adaptação — Recursos Hídricos",
          documentTier: "sectoral",
          page: 41,
          recordType: "action",
          match: "direct",
          strength: "committed",
          explicit: true,
          confidence: "high",
          pt: "Implementar programas de proteção e recuperação de mananciais e áreas de recarga em bacias sob estresse hídrico.",
          en: "Implement programmes to protect and restore water sources and recharge areas in basins under water stress.",
        },
        {
          document: "Estratégia Nacional de Adaptação (ENA 2025)",
          documentTier: "national",
          page: 63,
          recordType: "objective",
          match: "partial",
          strength: "enabling",
          explicit: false,
          confidence: "medium",
          pt: "Fortalecer a segurança hídrica por meio de soluções baseadas na natureza.",
          en: "Strengthen water security through nature-based solutions.",
        },
      ],
    },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  {
    id: "c40_0062",
    source: "c40",
    name: l(
      "Increase water-use efficiency and demand management",
      "Aumentar a eficiência no uso da água e gerir a demanda",
    ),
    description: l(
      "Reduce losses in the distribution network, introduce tariff and metering measures, and run demand-reduction programmes for households and large users.",
      "Reduzir perdas na rede de distribuição, adotar medidas tarifárias e de medição e executar programas de redução de demanda para domicílios e grandes consumidores.",
    ),
    sector: "water_resources",
    kind: "direct",
    timeline: "<5 years",
    costBand: "low",
    preparationComplexity: "low",
    scale: "regional",
    aimStrategy: "preventive",
    links: [
      {
        cell: "water_stress",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "low",
        confidence: "high",
        rationale: l(
          "Reduces losses and per-capita demand, improving supply reliability under scarcity.",
          "Reduz perdas e a demanda per capita, melhorando a confiabilidade do abastecimento sob escassez.",
        ),
      },
      {
        cell: "water_stress",
        component: "exposure",
        directness: "direct",
        effectiveness: "low",
        confidence: "medium",
        rationale: l(
          "Demand management lowers the volume of demand exposed to shortage.",
          "A gestão da demanda reduz o volume de demanda exposto à escassez.",
        ),
      },
    ],
    coBenefits: { water_quality: 1, local_economy: 1, social_equity: 0 },
    coBenefitsAiOnly: true,
    relationships: [
      {
        kind: "synergistic",
        actionId: "icare_0104",
        rationale: l(
          "Lower demand keeps the protected sources within their safe yield, so the two reinforce each other in dry years.",
          "Uma demanda menor mantém os mananciais protegidos dentro da vazão segura, e as duas ações se reforçam em anos secos.",
        ),
      },
    ],
    legal: {
      score: 4.2,
      responsibleLevel: "municipal",
      norms: [CF88_30, SANEAMENTO],
      ...PILOT_LEGAL,
    },
    pathways: ["domestic_credit", "federal_transfer"],
    comparableProjects: [],
    policy: {
      score: 44.7,
      evidence: [
        {
          document: "Plano Setorial de Adaptação — Recursos Hídricos",
          documentTier: "sectoral",
          page: 37,
          recordType: "target",
          match: "partial",
          strength: "targeted",
          explicit: true,
          confidence: "high",
          pt: "Reduzir o índice de perdas na distribuição de água para 25% até 2033.",
          en: "Reduce water distribution losses to 25% by 2033.",
        },
      ],
    },
    provenance: {
      linksReviewed: false,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  {
    id: "icare_0088",
    source: "icare",
    name: l(
      "Strengthen healthcare capacity, continuity and environmental health surveillance",
      "Fortalecer a capacidade, a continuidade e a vigilância em saúde ambiental",
    ),
    description: l(
      "Expand vector surveillance, guarantee continuity of primary care during climate events and train health teams on climate-sensitive diseases.",
      "Ampliar a vigilância de vetores, garantir a continuidade da atenção primária durante eventos climáticos e capacitar equipes de saúde em doenças sensíveis ao clima.",
    ),
    sector: "health",
    kind: "direct",
    timeline: "<5 years",
    costBand: "medium",
    preparationComplexity: "medium",
    scale: "regional",
    aimStrategy: "preventive",
    links: [
      {
        cell: "malaria",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "high",
        confidence: "medium",
        rationale: l(
          "Surveillance and care capacity are the adaptive-capacity indicators of the malaria cell.",
          "Vigilância e capacidade de atendimento são os indicadores de capacidade adaptativa da célula de malária.",
        ),
      },
      {
        cell: "arboviruses",
        component: "vulnerability",
        directness: "indirect",
        rationale: l(
          "Care capacity helps only once a vector-control programme follows; classified indirect so the §4.8 dynamic holds.",
          "A capacidade de atendimento ajuda apenas quando um programa de controle de vetores a acompanha; classificado como indireto para manter a dinâmica do §4.8.",
        ),
      },
      {
        cell: "visceral_leishmaniasis",
        component: "vulnerability",
        directness: "indirect",
        rationale: l(
          "Benefits depend on a later vector-control programme.",
          "Os benefícios dependem de um programa posterior de controle de vetores.",
        ),
      },
    ],
    coBenefits: { public_health: 2, social_equity: 2, local_economy: 0 },
    coBenefitsAiOnly: false,
    relationships: [
      {
        kind: "synergistic",
        actionId: "icare_0201",
        rationale: l(
          "Early-warning data lets health services stage surveillance and capacity before an outbreak or heat episode arrives.",
          "Os dados de alerta precoce permitem aos serviços de saúde preparar vigilância e capacidade antes de um surto ou episódio de calor.",
        ),
      },
    ],
    legal: {
      score: 3.8,
      responsibleLevel: "shared",
      norms: [CF88_23, SUS],
      ...PILOT_LEGAL,
    },
    pathways: ["federal_transfer", "domestic_grant"],
    comparableProjects: [],
    policy: {
      score: 52.5,
      evidence: [
        {
          document: "Plano Setorial de Adaptação — Saúde",
          documentTier: "sectoral",
          page: 29,
          recordType: "action",
          match: "direct",
          strength: "committed",
          explicit: true,
          confidence: "high",
          pt: "Fortalecer a vigilância em saúde ambiental para doenças sensíveis ao clima nos municípios prioritários.",
          en: "Strengthen environmental health surveillance for climate-sensitive diseases in priority municipalities.",
        },
      ],
    },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  {
    id: "ipcc_0096",
    source: "ipcc",
    name: l(
      "Strengthen climate resilience in agriculture and livestock systems",
      "Fortalecer a resiliência climática dos sistemas agrícolas e pecuários",
    ),
    description: l(
      "Support drought-tolerant crops, agroforestry, soil-moisture management and extension services for family farmers.",
      "Apoiar cultivos tolerantes à seca, sistemas agroflorestais, manejo da umidade do solo e assistência técnica para a agricultura familiar.",
    ),
    sector: "food_security",
    kind: "direct",
    timeline: "5-10 years",
    costBand: "medium",
    preparationComplexity: "medium",
    scale: "regional",
    aimStrategy: "transformative",
    links: [
      {
        cell: "food_availability",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "medium",
        confidence: "medium",
        rationale: l(
          "Diversified, drought-tolerant production is a sensitivity indicator in the food-availability cell.",
          "A produção diversificada e tolerante à seca é um indicador de sensibilidade na célula de disponibilidade de alimentos.",
        ),
      },
      {
        cell: "food_availability",
        component: "exposure",
        directness: "direct",
        effectiveness: "low",
        confidence: "low",
        rationale: l(
          "Marginal effect on the cropped area exposed to drought.",
          "Efeito marginal sobre a área cultivada exposta à seca.",
        ),
      },
      {
        cell: "biome_integrity",
        component: "vulnerability",
        directness: "indirect",
        rationale: l(
          "Agroforestry helps only where later land-use decisions follow.",
          "A agrofloresta contribui apenas quando decisões posteriores de uso do solo a acompanham.",
        ),
      },
    ],
    coBenefits: {
      local_economy: 2,
      social_equity: 1,
      biodiversity: 1,
      water_quality: 1,
    },
    coBenefitsAiOnly: true,
    relationships: [
      {
        kind: "synergistic",
        actionId: "icare_0112",
        rationale: l(
          "Resilient production only reaches households if storage and distribution survive the same events.",
          "A produção resiliente só chega às famílias se o armazenamento e a distribuição resistirem aos mesmos eventos.",
        ),
      },
    ],
    legal: {
      score: 2.9,
      responsibleLevel: "shared",
      norms: [CF88_23, PNMC],
      ...PILOT_LEGAL,
    },
    pathways: ["domestic_grant", "federal_transfer", "international_grant"],
    comparableProjects: [],
    policy: {
      score: 34.6,
      evidence: [
        {
          // Methodology §6.2.8 worked example — a single evidence point.
          document: "Estratégia Nacional de Adaptação (ENA 2025)",
          documentTier: "national",
          page: 79,
          recordType: "target",
          match: "direct",
          strength: "targeted",
          explicit: true,
          confidence: "high",
          pt: "Até 2030, ampliar a adoção de sistemas de produção agropecuária diversificados, sustentáveis e resilientes, em 72,68 milhões de hectares.",
          en: "By 2030, expand the adoption of diversified, sustainable and resilient agricultural production systems to 72.68 million hectares.",
        },
      ],
    },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  {
    id: "icare_0112",
    source: "icare",
    name: l(
      "Strengthen climate-resilient food storage and distribution infrastructure",
      "Fortalecer a infraestrutura resiliente de armazenamento e distribuição de alimentos",
    ),
    description: l(
      "Build and retrofit municipal storage, cold chain and market infrastructure so that food supply continues through droughts and floods.",
      "Construir e adequar infraestrutura municipal de armazenamento, cadeia de frio e abastecimento para que a oferta de alimentos continue durante secas e inundações.",
    ),
    sector: "food_security",
    kind: "direct",
    timeline: "<5 years",
    costBand: "high",
    preparationComplexity: "high",
    scale: "neighbourhood",
    aimStrategy: "preventive",
    links: [
      {
        cell: "food_availability",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "high",
        confidence: "high",
        rationale: l(
          "Storage and distribution capacity are adaptive-capacity indicators of the food-availability cell.",
          "Capacidade de armazenamento e distribuição são indicadores de capacidade adaptativa da célula de disponibilidade de alimentos.",
        ),
      },
      {
        cell: "food_availability",
        component: "exposure",
        directness: "direct",
        effectiveness: "medium",
        confidence: "medium",
        rationale: l(
          "Reduces the share of supply exposed to loss during events.",
          "Reduz a parcela da oferta exposta a perdas durante eventos.",
        ),
      },
      {
        cell: "food_access",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "medium",
        confidence: "medium",
        rationale: l(
          "Distribution infrastructure sustains access in affected neighbourhoods.",
          "A infraestrutura de distribuição sustenta o acesso em bairros afetados.",
        ),
      },
    ],
    coBenefits: {
      local_economy: 2,
      social_equity: 1,
      public_health: 1,
      mobility: 0,
    },
    coBenefitsAiOnly: false,
    relationships: [
      {
        kind: "prerequisite",
        actionId: "icare_0176",
        rationale: l(
          "The plan identifies the critical food routes and depots the resilient infrastructure is built for.",
          "O plano identifica as rotas e os entrepostos de alimentos críticos para os quais a infraestrutura resiliente é construída.",
        ),
      },
      {
        kind: "synergistic",
        actionId: "ipcc_0096",
        rationale: l(
          "Resilient production only reaches households if storage and distribution survive the same events.",
          "A produção resiliente só chega às famílias se o armazenamento e a distribuição resistirem aos mesmos eventos.",
        ),
      },
    ],
    legal: {
      score: 4.6,
      responsibleLevel: "municipal",
      norms: [CF88_30, ESTATUTO],
      ...PILOT_LEGAL,
    },
    pathways: ["federal_transfer", "domestic_credit", "mdb_borrowing"],
    comparableProjects: [
      {
        name: "Central de Abastecimento Resiliente",
        city: "Juazeiro, BA",
        channel: l(
          "Federal transfers and public investment programmes",
          "Transferências federais e programas de investimento público",
        ),
        instrument: l(
          "Novo PAC — OGU transfer",
          "Novo PAC — transferência OGU",
        ),
        amountBrl: 42_500_000,
        stage: l("Selected", "Selecionado"),
      },
    ],
    policy: {
      score: 61.3,
      evidence: [
        {
          document: "Plano Setorial de Adaptação — Segurança Alimentar",
          documentTier: "sectoral",
          page: 52,
          recordType: "action",
          match: "direct",
          strength: "funded",
          explicit: true,
          confidence: "high",
          pt: "Financiar a modernização de estruturas de armazenamento e abastecimento alimentar em municípios com risco climático elevado.",
          en: "Fund the modernisation of food storage and supply structures in municipalities with high climate risk.",
        },
      ],
    },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: false,
    },
  },
  {
    id: "icare_0115",
    source: "icare",
    name: l(
      "Strengthen sustainable territorial food value chains from production to consumption",
      "Fortalecer cadeias alimentares territoriais sustentáveis da produção ao consumo",
    ),
    description: l(
      "Connect local producers to school meals, public procurement and municipal markets, shortening supply chains that break during climate events.",
      "Conectar produtores locais à alimentação escolar, às compras públicas e aos mercados municipais, encurtando cadeias que se rompem durante eventos climáticos.",
    ),
    sector: "food_security",
    kind: "direct",
    timeline: "5-10 years",
    costBand: "low",
    preparationComplexity: "medium",
    scale: "regional",
    aimStrategy: "transformative",
    links: [
      {
        cell: "food_availability",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "low",
        confidence: "medium",
        rationale: l(
          "Shorter chains improve local availability but do not change production capacity.",
          "Cadeias mais curtas melhoram a disponibilidade local, mas não alteram a capacidade de produção.",
        ),
      },
      {
        cell: "food_access",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "medium",
        confidence: "medium",
        rationale: l(
          "Public procurement and school meals are access indicators in the cell.",
          "Compras públicas e alimentação escolar são indicadores de acesso na célula.",
        ),
      },
    ],
    coBenefits: { local_economy: 2, social_equity: 2, public_health: 1 },
    coBenefitsAiOnly: true,
    relationships: [
      {
        kind: "synergistic",
        actionId: "icare_0112",
        rationale: l(
          "Territorial value chains depend on resilient storage and distribution to keep food moving after an event.",
          "As cadeias territoriais dependem de armazenamento e distribuição resilientes para manter o abastecimento após um evento.",
        ),
      },
    ],
    legal: {
      score: 4.0,
      responsibleLevel: "municipal",
      norms: [CF88_30],
      ...PILOT_LEGAL,
    },
    pathways: ["domestic_grant", "federal_transfer"],
    comparableProjects: [],
    policy: {
      score: 47.9,
      evidence: [
        {
          document: "Plano Setorial de Adaptação — Segurança Alimentar",
          documentTier: "sectoral",
          page: 48,
          recordType: "action",
          match: "partial",
          strength: "committed",
          explicit: true,
          confidence: "medium",
          pt: "Ampliar a participação da agricultura familiar nas compras públicas de alimentos.",
          en: "Expand family farming's share of public food procurement.",
        },
      ],
    },
    provenance: {
      linksReviewed: false,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  {
    id: "c40_0042",
    source: "c40",
    name: l(
      "Develop and implement an extreme weather preparedness and emergency response plan",
      "Elaborar e implementar um plano de preparação e resposta a eventos climáticos extremos",
    ),
    description: l(
      "A municipal contingency plan with alert protocols, evacuation routes, shelters and trained civil-defence teams, exercised every year.",
      "Um plano municipal de contingência com protocolos de alerta, rotas de evacuação, abrigos e equipes de defesa civil treinadas, exercitado anualmente.",
    ),
    sector: "geohydrological_disasters",
    kind: "direct",
    timeline: "<5 years",
    costBand: "low",
    preparationComplexity: "medium",
    scale: "regional",
    aimStrategy: "reactive",
    links: [
      {
        cell: "floods",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "medium",
        confidence: "high",
        rationale: l(
          "Risk-management actions are a base indicator of flood adaptive capacity.",
          "Ações de gestão de risco são um indicador básico da capacidade adaptativa a inundações.",
        ),
      },
      {
        cell: "landslide",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "medium",
        confidence: "high",
        rationale: l(
          "The same civil-defence capacity applies to landslide response.",
          "A mesma capacidade de defesa civil se aplica à resposta a deslizamentos.",
        ),
      },
      {
        cell: "food_availability",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "low",
        confidence: "low",
        rationale: l(
          "Emergency supply protocols marginally reduce food-availability sensitivity.",
          "Protocolos de abastecimento emergencial reduzem marginalmente a sensibilidade da disponibilidade de alimentos.",
        ),
      },
    ],
    coBenefits: { public_health: 2, social_equity: 1, housing: 1 },
    coBenefitsAiOnly: false,
    relationships: [
      {
        kind: "prerequisite",
        actionId: "icare_0176",
        rationale: l(
          "The emergency plan is a chapter of the adaptation plan: it inherits its risk scenarios and responsibilities.",
          "O plano de emergência é um capítulo do plano de adaptação: herda seus cenários de risco e responsabilidades.",
        ),
      },
      {
        kind: "corequisite",
        actionId: "icare_0201",
        rationale: l(
          "A response plan without monitoring has no trigger, and monitoring without a plan has no response; they are delivered together.",
          "Um plano de resposta sem monitoramento não tem gatilho, e monitoramento sem plano não tem resposta; são executados juntos.",
        ),
      },
    ],
    legal: {
      score: 4.8,
      responsibleLevel: "municipal",
      norms: [CF88_30, PNPDEC],
      ...PILOT_LEGAL,
    },
    pathways: ["civil_defence", "federal_transfer"],
    comparableProjects: [],
    policy: {
      score: 70.1,
      evidence: [
        {
          document: "Plano Setorial de Adaptação — Riscos e Desastres",
          documentTier: "sectoral",
          page: 18,
          recordType: "action",
          match: "direct",
          strength: "operational",
          explicit: true,
          confidence: "high",
          pt: "Apoiar a elaboração e a implementação de planos de contingência municipais para desastres hidrológicos.",
          en: "Support the preparation and implementation of municipal contingency plans for hydrological disasters.",
        },
        {
          document: "Estratégia Nacional de Adaptação (ENA 2025)",
          documentTier: "national",
          page: 88,
          recordType: "target",
          match: "partial",
          strength: "targeted",
          explicit: true,
          confidence: "medium",
          pt: "Até 2030, garantir que todos os municípios com áreas de risco mapeadas disponham de plano de contingência.",
          en: "By 2030, ensure every municipality with mapped risk areas has a contingency plan.",
        },
      ],
    },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  {
    id: "c40_0048",
    source: "c40",
    name: l(
      "Upgrade and maintain urban drainage systems",
      "Ampliar e manter os sistemas de drenagem urbana",
    ),
    description: l(
      "Upgrade, expand and maintain drainage networks and stormwater assets, including detention basins and permeable surfaces in flood-prone neighbourhoods.",
      "Ampliar, expandir e manter redes de drenagem e ativos de águas pluviais, incluindo bacias de detenção e superfícies permeáveis em bairros sujeitos a alagamentos.",
    ),
    sector: "geohydrological_disasters",
    kind: "direct",
    timeline: "5-10 years",
    costBand: "high",
    preparationComplexity: "high",
    scale: "neighbourhood",
    aimStrategy: "preventive",
    links: [
      {
        cell: "floods",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "high",
        confidence: "high",
        rationale: l(
          "Drainage capacity is a base indicator under flood adaptive capacity (risk management).",
          "A capacidade de drenagem é um indicador básico da capacidade adaptativa a inundações (gestão de risco).",
        ),
      },
      {
        cell: "floods",
        component: "exposure",
        directness: "direct",
        effectiveness: "medium",
        confidence: "medium",
        rationale: l(
          "Detention and conveyance reduce the built area that floods in a given event.",
          "Detenção e escoamento reduzem a área construída que alaga em um dado evento.",
        ),
      },
    ],
    coBenefits: {
      public_health: 1,
      housing: 1,
      water_quality: 1,
      mobility: 1,
      biodiversity: -1,
    },
    coBenefitsAiOnly: false,
    relationships: [
      {
        kind: "prerequisite",
        actionId: "icare_0176",
        rationale: l(
          "The plan's flood scenarios set the design standard the drainage upgrade is sized to.",
          "Os cenários de inundação do plano definem o padrão de projeto para o qual a drenagem é dimensionada.",
        ),
      },
      {
        kind: "synergistic",
        actionId: "c40_0038",
        rationale: l(
          "Restored slopes and watersheds slow runoff, so the drainage network handles smaller peaks.",
          "Encostas e bacias restauradas retardam o escoamento, e a rede de drenagem passa a lidar com picos menores.",
        ),
      },
    ],
    legal: {
      score: 4.4,
      responsibleLevel: "municipal",
      norms: [CF88_30, SANEAMENTO],
      ...PILOT_LEGAL,
    },
    pathways: [
      "federal_transfer",
      "domestic_credit",
      "mdb_borrowing",
      "civil_defence",
    ],
    comparableProjects: [
      // Methodology §5.2.7.
      {
        name: "Sistema de Macrodrenagem da bacia do Córrego Embira",
        city: "Belo Horizonte, MG",
        channel: l(
          "Federal transfers and public investment programmes",
          "Transferências federais e programas de investimento público",
        ),
        instrument: l(
          "Novo PAC — FGTS/CAIXA domestic financing",
          "Novo PAC — financiamento FGTS/CAIXA",
        ),
        amountBrl: 215_900_000,
        stage: l("Selected", "Selecionado"),
      },
      {
        name: "Urban drainage proposal",
        city: "Fortaleza, CE",
        channel: l(
          "Federal transfers and public investment programmes",
          "Transferências federais e programas de investimento público",
        ),
        instrument: l(
          "Novo PAC — OGU grant or transfer",
          "Novo PAC — transferência OGU",
        ),
        amountBrl: 103_300_000,
        stage: l("Selected", "Selecionado"),
      },
      {
        name: "Urban drainage proposal",
        city: "Camaçari, BA",
        channel: l(
          "Federal transfers and public investment programmes",
          "Transferências federais e programas de investimento público",
        ),
        instrument: l(
          "Novo PAC — OGU and FGTS selection lists",
          "Novo PAC — listas OGU e FGTS",
        ),
        amountBrl: 239_700_000,
        stage: l("Selected", "Selecionado"),
      },
    ],
    policy: {
      // Methodology §6.2 five-action pilot.
      score: 66.4,
      evidence: [
        {
          document: "Plano Setorial de Adaptação — Cidades",
          documentTier: "sectoral",
          page: 33,
          recordType: "action",
          match: "direct",
          strength: "funded",
          explicit: true,
          confidence: "high",
          pt: "Financiar obras de macrodrenagem e drenagem sustentável em áreas urbanas com histórico de inundações.",
          en: "Fund macro-drainage and sustainable drainage works in urban areas with a history of flooding.",
        },
        {
          document: "Plano Setorial de Adaptação — Riscos e Desastres",
          documentTier: "sectoral",
          page: 22,
          recordType: "context",
          match: "adjacent",
          strength: "context",
          explicit: false,
          confidence: "medium",
          pt: "A infraestrutura urbana é o principal vetor de perdas em desastres hidrológicos.",
          en: "Urban infrastructure is the main driver of losses in hydrological disasters.",
        },
      ],
    },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  {
    id: "c40_0038",
    source: "c40",
    name: l(
      "Implement ecosystem-based adaptation on slopes and in watersheds",
      "Implementar adaptação baseada em ecossistemas em encostas e bacias",
    ),
    description: l(
      "Reforest slopes, restore riparian buffers and create green infrastructure that slows runoff and stabilises soils.",
      "Reflorestar encostas, recuperar matas ciliares e criar infraestrutura verde que reduz o escoamento e estabiliza o solo.",
    ),
    sector: "geohydrological_disasters",
    kind: "direct",
    timeline: "5-10 years",
    costBand: "medium",
    preparationComplexity: "high",
    scale: "neighbourhood",
    aimStrategy: "transformative",
    links: [
      {
        cell: "landslide",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "high",
        confidence: "medium",
        rationale: l(
          "Vegetation cover on slopes is a sensitivity indicator of the landslide cell.",
          "A cobertura vegetal em encostas é um indicador de sensibilidade da célula de deslizamentos.",
        ),
      },
      {
        cell: "floods",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "medium",
        confidence: "medium",
        rationale: l(
          "Reduced runoff lowers flood sensitivity downstream.",
          "O menor escoamento reduz a sensibilidade a inundações a jusante.",
        ),
      },
      {
        cell: "biome_integrity",
        component: "vulnerability",
        directness: "direct",
        effectiveness: "medium",
        confidence: "high",
        rationale: l(
          "Restoration improves native cover, a base indicator of biome integrity.",
          "A restauração melhora a cobertura nativa, um indicador básico da integridade do bioma.",
        ),
      },
    ],
    coBenefits: {
      biodiversity: 2,
      water_quality: 2,
      air_quality: 1,
      public_health: 1,
      housing: -1,
    },
    coBenefitsAiOnly: false,
    relationships: [
      {
        kind: "synergistic",
        actionId: "c40_0048",
        rationale: l(
          "Restored slopes and watersheds slow runoff, so the drainage network handles smaller peaks.",
          "Encostas e bacias restauradas retardam o escoamento, e a rede de drenagem passa a lidar com picos menores.",
        ),
      },
    ],
    legal: {
      score: 3.6,
      responsibleLevel: "shared",
      norms: [CF88_23, CODIGO_FLORESTAL, ESTATUTO],
      ...PILOT_LEGAL,
    },
    pathways: ["domestic_grant", "international_grant", "federal_transfer"],
    comparableProjects: [
      {
        name: "Recuperação de encostas e nascentes — Serra do Mar",
        city: "Cubatão, SP",
        channel: l(
          "Domestic climate and environmental grants",
          "Subvenções nacionais de clima e meio ambiente",
        ),
        instrument: l(
          "Fundo Clima — grant window",
          "Fundo Clima — modalidade não reembolsável",
        ),
        amountBrl: 27_800_000,
        stage: l("Contracted", "Contratado"),
      },
    ],
    policy: {
      // Methodology §6.2 five-action pilot.
      score: 81.7,
      evidence: [
        {
          document: "Estratégia Nacional de Adaptação (ENA 2025)",
          documentTier: "national",
          page: 54,
          recordType: "action",
          match: "direct",
          strength: "operational",
          explicit: true,
          confidence: "high",
          pt: "Implementar soluções baseadas na natureza e adaptação baseada em ecossistemas como eixo estruturante da adaptação urbana.",
          en: "Implement nature-based solutions and ecosystem-based adaptation as a structuring axis of urban adaptation.",
        },
        {
          document: "Plano Setorial de Adaptação — Biodiversidade",
          documentTier: "sectoral",
          page: 27,
          recordType: "target",
          match: "direct",
          strength: "targeted",
          explicit: true,
          confidence: "high",
          pt: "Restaurar 12 milhões de hectares de vegetação nativa até 2030, priorizando áreas de risco.",
          en: "Restore 12 million hectares of native vegetation by 2030, prioritising risk areas.",
        },
      ],
    },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  {
    id: "c40_0044",
    source: "c40",
    name: l(
      "Build and maintain climate shelters and evacuation infrastructure",
      "Construir e manter abrigos climáticos e infraestrutura de evacuação",
    ),
    description: l(
      "Designated, equipped shelters and signed evacuation routes for households in mapped risk areas, with relocation support where homes cannot be made safe.",
      "Abrigos designados e equipados e rotas de evacuação sinalizadas para famílias em áreas de risco mapeadas, com apoio à realocação quando as moradias não puderem ser protegidas.",
    ),
    sector: "geohydrological_disasters",
    kind: "direct",
    timeline: "<5 years",
    costBand: "medium",
    preparationComplexity: "high",
    scale: "neighbourhood",
    aimStrategy: "reactive",
    links: [
      {
        cell: "floods",
        component: "exposure",
        directness: "direct",
        effectiveness: "medium",
        confidence: "medium",
        maladaptation: true,
        rationale: l(
          "Reduces the population exposed during events. Flagged: relocation without tenure support can displace households into other risk areas.",
          "Reduz a população exposta durante eventos. Sinalizado: realocação sem apoio fundiário pode deslocar famílias para outras áreas de risco.",
        ),
      },
      {
        cell: "landslide",
        component: "exposure",
        directness: "direct",
        effectiveness: "medium",
        confidence: "medium",
        maladaptation: true,
        rationale: l(
          "Same exposure reduction and the same displacement caveat.",
          "Mesma redução de exposição e mesma ressalva sobre deslocamento.",
        ),
      },
    ],
    coBenefits: { public_health: 1, social_equity: 1, housing: -1 },
    coBenefitsAiOnly: true,
    relationships: [
      {
        kind: "corequisite",
        actionId: "c40_0042",
        rationale: l(
          "Shelters are opened and evacuations ordered by the emergency plan; without it the infrastructure has no protocol.",
          "Os abrigos são abertos e as evacuações ordenadas pelo plano de emergência; sem ele a infraestrutura não tem protocolo.",
        ),
      },
    ],
    legal: {
      score: 4.1,
      responsibleLevel: "municipal",
      norms: [CF88_30, PNPDEC, ESTATUTO],
      ...PILOT_LEGAL,
    },
    pathways: ["civil_defence", "federal_transfer"],
    comparableProjects: [],
    policy: {
      // Methodology §6.2 five-action pilot.
      score: 40.0,
      evidence: [
        {
          document: "Plano Setorial de Adaptação — Riscos e Desastres",
          documentTier: "sectoral",
          page: 24,
          recordType: "enabling_condition",
          match: "partial",
          strength: "enabling",
          explicit: true,
          confidence: "medium",
          pt: "Estruturar a rede municipal de abrigos temporários integrada ao sistema de alerta.",
          en: "Structure the municipal network of temporary shelters, integrated with the alert system.",
        },
      ],
    },
    provenance: {
      linksReviewed: false,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  {
    id: "c40_0046",
    source: "c40",
    name: l(
      "Strengthen coastal protection against sea-level rise",
      "Reforçar a proteção costeira contra a elevação do nível do mar",
    ),
    description: l(
      "Coastal protection infrastructure and integrated coastal zone management for shorelines, ports and low-lying neighbourhoods.",
      "Infraestrutura de proteção costeira e gerenciamento costeiro integrado para a orla, portos e bairros de baixa altitude.",
    ),
    sector: "geohydrological_disasters",
    kind: "direct",
    uncoveredHazard: "sea_level_rise",
    timeline: ">10 years",
    costBand: "high",
    preparationComplexity: "high",
    scale: "regional",
    aimStrategy: "preventive",
    links: [],
    coBenefits: { local_economy: 1, housing: 1, biodiversity: -1 },
    coBenefitsAiOnly: true,
    relationships: [
      {
        kind: "prerequisite",
        actionId: "icare_0176",
        rationale: l(
          "Coastal works are committed through the plan's shoreline strategy and its long-term financing.",
          "As obras costeiras são assumidas por meio da estratégia de orla do plano e de seu financiamento de longo prazo.",
        ),
      },
    ],
    legal: {
      score: 2.3,
      responsibleLevel: "national",
      norms: [CF88_23, GERCO],
      ...PILOT_LEGAL,
    },
    pathways: ["mdb_borrowing", "international_grant"],
    comparableProjects: [],
    policy: {
      // Methodology §6.2 five-action pilot.
      score: 19.3,
      evidence: [
        {
          document: "Estratégia Nacional de Adaptação (ENA 2025)",
          documentTier: "national",
          page: 71,
          recordType: "context",
          match: "adjacent",
          strength: "context",
          explicit: false,
          confidence: "medium",
          pt: "A zona costeira concentra parcela significativa da população e dos ativos expostos.",
          en: "The coastal zone concentrates a significant share of the exposed population and assets.",
        },
      ],
    },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  {
    id: "c40_0051",
    source: "c40",
    name: l(
      "Provide public shading in heat hotspots",
      "Oferecer sombreamento público em ilhas de calor",
    ),
    description: l(
      "Shade structures, canopies and drought-tolerant trees in public spaces where heat stress is highest.",
      "Estruturas de sombreamento, coberturas e árvores tolerantes à seca em espaços públicos onde o estresse térmico é maior.",
    ),
    sector: "health",
    kind: "direct",
    uncoveredHazard: "extreme_heat",
    timeline: "<5 years",
    costBand: "low",
    preparationComplexity: "low",
    scale: "streets",
    aimStrategy: "preventive",
    links: [],
    coBenefits: {
      public_health: 2,
      air_quality: 1,
      biodiversity: 1,
      mobility: 1,
      social_equity: 1,
    },
    coBenefitsAiOnly: false,
    relationships: [],
    legal: {
      score: 5,
      responsibleLevel: "municipal",
      norms: [CF88_30],
      ...PILOT_LEGAL,
    },
    pathways: ["domestic_grant", "federal_transfer"],
    comparableProjects: [],
    policy: {
      // Methodology §6.2 five-action pilot.
      score: 0,
      evidence: [],
    },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: true,
    },
  },
  // ── Enabling actions: surfaced as complementary, never scored on Impact. ──
  {
    id: "icare_0176",
    source: "icare",
    name: l(
      "Develop a municipal climate adaptation plan",
      "Elaborar um plano municipal de adaptação climática",
    ),
    description: l(
      "A formally adopted municipal plan that sets adaptation priorities, responsibilities and budget lines — the instrument most funding channels ask for first.",
      "Um plano municipal formalmente adotado que define prioridades, responsabilidades e dotações de adaptação — o instrumento que a maioria dos canais de financiamento exige primeiro.",
    ),
    sector: "geohydrological_disasters",
    kind: "enabling",
    timeline: "<5 years",
    costBand: "low",
    preparationComplexity: "low",
    aimStrategy: "preventive",
    links: [
      {
        cell: "floods",
        component: "vulnerability",
        directness: "indirect",
        rationale: l(
          "A plan changes indicators only through the actions it later triggers.",
          "Um plano só altera indicadores por meio das ações que vier a desencadear.",
        ),
      },
    ],
    coBenefits: { social_equity: 1 },
    coBenefitsAiOnly: true,
    relationships: [],
    legal: {
      score: 5,
      responsibleLevel: "municipal",
      norms: [CF88_30, PNMC],
      ...PILOT_LEGAL,
    },
    pathways: ["domestic_grant"],
    comparableProjects: [],
    policy: { score: 55.0, evidence: [] },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: false,
    },
  },
  {
    id: "icare_0201",
    source: "icare",
    name: l(
      "Establish a climate risk monitoring and early-warning data system",
      "Estabelecer um sistema de dados de monitoramento de risco climático e alerta precoce",
    ),
    description: l(
      "Rain gauges, river sensors and a municipal data platform that feeds alerts to civil defence and health surveillance.",
      "Pluviômetros, sensores fluviais e uma plataforma municipal de dados que alimenta alertas para a defesa civil e a vigilância em saúde.",
    ),
    sector: "geohydrological_disasters",
    kind: "enabling",
    timeline: "<5 years",
    costBand: "medium",
    preparationComplexity: "medium",
    aimStrategy: "preventive",
    links: [
      {
        cell: "floods",
        component: "vulnerability",
        directness: "indirect",
        rationale: l(
          "Monitoring improves indicators only when a response plan acts on the alerts.",
          "O monitoramento melhora indicadores apenas quando um plano de resposta atua sobre os alertas.",
        ),
      },
    ],
    coBenefits: { public_health: 1 },
    coBenefitsAiOnly: true,
    relationships: [],
    legal: {
      score: 4.5,
      responsibleLevel: "municipal",
      norms: [CF88_30, PNPDEC],
      ...PILOT_LEGAL,
    },
    pathways: ["civil_defence", "domestic_grant"],
    comparableProjects: [],
    policy: { score: 62.0, evidence: [] },
    provenance: {
      linksReviewed: true,
      legalReviewed: false,
      policyReviewed: false,
    },
  },
];

export const ACTION_BY_ID: Record<string, AdaptationAction> =
  Object.fromEntries(ADAPTATION_ACTIONS.map((action) => [action.id, action]));
