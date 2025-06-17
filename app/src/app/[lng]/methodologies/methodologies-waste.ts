import { MethodologyBySector } from "./types";

export const WASTE: MethodologyBySector = {
  sector: "waste",
  sector_roman_numeral: "III",
  methodologies: [
    {
      id: "methane-commitment",
      translations: {
        en: {
          methodology: "Methane Commitment",
          overview:
            "The Methane Commitment methodology estimates methane (CH₄) emissions from municipal solid waste (MSW) disposal based on the total methane-generating potential of the organic waste deposited in landfills in a given year. This method assumes that all degradable organic carbon (DOC) in the waste will eventually decompose and release methane, regardless of the time it takes, and therefore attributes 100% of the methane emissions to the year of waste deposition.",
          sector: "Waste",
          scope: "Scope 1 emissions",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          features: [
            "Emissions fully assigned to the reporting year based on waste deposited that year.",
            "No time distribution—simpler than First Order of Decay.",
            "Requires only current-year waste quantity and composition data.",
            "Aligned with IPCC Tier 1 and GPC for city-scale inventories.",
          ],
          limitations: [
            "May overestimate annual emissions since actual methane release spans decades.",
            "Does not account for time lag or mitigation measures over time.",
          ],
          equations: [
            {
              label: "Eq. 8.3 Methane Commitment",
              formula:
                "\\text{emissions}_{CH4} = [\\text{MSW}_x * \\text{L}_o*(1-\\text{f}_{rec})*(1-OX)]",
            },
            {
              label: "Eq. 8.4 Methane Generation Potential",
              formula:
                "\\text{L}_o = \\text{MCF} \\cdot \\text{DOC} \\cdot \\text{DOC}_F \\cdot \\text{F} \\cdot \\frac{16}{12}",
            },
            {
              label: "Eq. 8.1 Degradable Organic Carbon",
              formula:
                "\\text{DOC} = \\sum_i \\text{CC}_i \\cdot \\text{WCF}_i",
            },
          ],
          parameters: [
            {
              code: "MSW_x",
              description: "Mass of wet waste disposed",
              units: ["tonnes/year", "kg/year"],
            },
            {
              code: "L_o",
              description: "Methane Generation Potential",
              units: ["tonnes CH4/tonne waste", "kg CH4/kg waste"],
            },
            {
              code: "f_\\text{rec}",
              description:
                "Methane recovery rate (fraction for flaring or energy use)",
              units: ["fraction"],
            },
            {
              code: "OX",
              description: "Oxidation factor in landfill cover",
              units: ["dimensionless"],
            },
            {
              code: "MCF",
              description: "Methane correction factor by landfill type",
              units: ["fraction"],
            },
            {
              code: "DOC",
              description: "Degradable Organic Carbon content in waste",
              units: ["kg C/kg waste", "tonnes C/tonne waste"],
            },
            {
              code: "DOC_F",
              description: "Fraction of DOC that decomposes (IPCC default=0.5)",
              units: ["fraction"],
            },
            {
              code: "F",
              description:
                "Fraction of methane in landfill gas (IPCC default=0.5)",
              units: ["fraction"],
            },
            {
              code: "16/12",
              description: "Molecular weight ratio C→CH4",
              units: ["dimensionless"],
            },
            {
              code: "CC_i",
              description: "Carbon content by waste type",
              units: ["fraction"],
            },
            {
              code: "WCF_i",
              description: "Waste composition fraction by type",
              units: ["percentage"],
            },
          ],
        },
        es: {
          methodology: "Compromiso de Metano",
          overview:
            "La metodología de Compromiso de Metano estima las emisiones de metano (CH₄) de la disposición de residuos sólidos municipales (MSW) basándose en el potencial total de generación de metano del carbono orgánico degradable (DOC) depositado en vertederos en un año determinado. Este método asume que todo el DOC en los residuos se descompondrá y liberará metano, independientemente del tiempo que lleve, y por lo tanto atribuye el 100 % de las emisiones de metano al año de deposición de los residuos.",
          sector: "Residuos",
          scope: "Emisiones de Alcance 1",
          approach: {
            type: "IPCC Nivel 1",
            guidance: "GPC v.07",
          },
          features: [
            "Emisiones asignadas completamente al año de informe según los residuos depositados ese año.",
            "Sin distribución temporal: más simple que el Método de Primera Orden de Degradación.",
            "Requiere solo datos de cantidad y composición de residuos del año en curso.",
            "Alineado con IPCC Nivel 1 y GPC para inventarios a escala municipal.",
          ],
          limitations: [
            "Puede sobrestimar las emisiones anuales, ya que la liberación real de metano ocurre durante décadas.",
            "No considera el retraso temporal ni las medidas de mitigación con el tiempo.",
          ],
          equations: [
            {
              label: "Ecuación 8.3 Compromiso de Metano",
              formula:
                "\\text{CH}_4 \\text{ emissions} = \\text{MSW}_x \\cdot \\text{L}_o \\cdot (1 - \\text{f}_{\\text{rec}}) \\cdot (1 - \\text{OX})",
            },
            {
              label: "Ecuación 8.4 Potencial de Generación de Metano",
              formula: "L_o = MCF * DOC * DOC_F * F * 16/12",
            },
            {
              label: "Ecuación 8.1 Carbono Orgánico Degradable",
              formula: "DOC = \\sum_i CC_i \\cdot WCF_i",
            },
          ],
          parameters: [
            {
              code: "MSW_x",
              description: "Masa de residuos húmedos dispuestos",
              units: ["toneladas/año", "kg/año"],
            },
            {
              code: "L_o",
              description: "Potencial de Generación de Metano",
              units: ["toneladas CH4/tonelada residuos", "kg CH4/kg residuos"],
            },
            {
              code: "f_\\text{rec}",
              description:
                "Tasa de recuperación de metano (fracción para combustión o uso energético)",
              units: ["fracción"],
            },
            {
              code: "OX",
              description: "Factor de oxidación en la cubierta del vertedero",
              units: ["adimensional"],
            },
            {
              code: "MCF",
              description:
                "Factor de corrección de metano según tipo de vertedero",
              units: ["fracción"],
            },
            {
              code: "DOC",
              description:
                "Contenido de Carbono Orgánico Degradable en residuos",
              units: ["kg C/kg residuos", "toneladas C/tonelada residuos"],
            },
            {
              code: "DOC_F",
              description:
                "Fracción de DOC que se descompone (IPCC defecto=0.5)",
              units: ["fracción"],
            },
            {
              code: "F",
              description:
                "Fracción de metano en gas de vertedero (IPCC defecto=0.5)",
              units: ["fracción"],
            },
            {
              code: "16/12",
              description: "Relación de peso molecular C→CH4",
              units: ["adimensional"],
            },
            {
              code: "CC_i",
              description: "Contenido de carbono por tipo de residuo",
              units: ["fracción"],
            },
            {
              code: "WCF_i",
              description: "Fracción de composición de residuos por tipo",
              units: ["porcentaje"],
            },
          ],
        },
        de: {
          methodology: "Methan-Verpflichtung",
          overview:
            "Die Methan-Verpflichtungs-Methodik schätzt die Methan (CH₄)-Emissionen aus der Entsorgung von kommunalem Siedlungsabfall (MSW) basierend auf dem gesamten Methan-Generierungspotenzial des abgelagerten abbaubaren organischen Kohlenstoffs (DOC) in einer gegebenen Jahr. Diese Methode geht davon aus, dass sich der gesamte DOC zersetzen und Methan freisetzen wird, unabhängig von der Dauer, und schreibt daher 100 % der Methanemissionen dem Jahr der Abfalldeponierung zu.",
          sector: "Abfall",
          scope: "Scope-1-Emissionen",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          features: [
            "Emissionen werden vollständig dem Berichtsjahr zugeordnet, basierend auf den in diesem Jahr deponierten Abfällen.",
            "Keine zeitliche Verteilung – einfacher als das First-Order-Decay-Verfahren.",
            "Erfordert nur Daten zur Abfallmenge und -zusammensetzung des aktuellen Jahres.",
            "Abgestimmt auf IPCC Tier 1 und GPC für städtische Inventare.",
          ],
          limitations: [
            "Kann jährliche Emissionen überschätzen, da die tatsächliche Methanfreisetzung Jahrzehnte dauert.",
            "Berücksichtigt keine zeitlichen Verzögerungen oder Minderungsmaßnahmen über die Zeit.",
          ],
          equations: [
            {
              label: "Gleichung 8.3 Methan-Verpflichtung",
              formula:
                "\\text{emissions}_{CH_4} = MSW_x * L_o * (1 - f_{rec}) * (1 - OX)",
            },
            {
              label: "Gleichung 8.4 Methanerzeugungspotenzial",
              formula: "L_o = MCF * DOC * DOC_F * F * 16/12",
            },
            {
              label: "Gleichung 8.1 Abbaubarer organischer Kohlenstoff",
              formula: "DOC = \\sum_i CC_i \\cdot WCF_i",
            },
          ],
          parameters: [
            {
              code: "MSW_x",
              description: "Masse des deponierten Nassabfalls",
              units: ["Tonnen/Jahr", "kg/Jahr"],
            },
            {
              code: "L_o",
              description: "Methangerierungspotenzial",
              units: ["Tonnen CH4/Tonne Abfall", "kg CH4/kg Abfall"],
            },
            {
              code: "f_\\text{rec}",
              description:
                "Methanrückgewinnungsrate (Fraktion für Verbrennung oder Energienutzung)",
              units: ["Fraktion"],
            },
            {
              code: "OX",
              description: "Oxidationsfaktor in der Deponieabdeckung",
              units: ["dimensionslos"],
            },
            {
              code: "MCF",
              description: "Methankorrekturfaktor nach Deponietyp",
              units: ["Fraktion"],
            },
            {
              code: "DOC",
              description:
                "Gehalt an abbaubarem organischem Kohlenstoff im Abfall",
              units: ["kg C/kg Abfall", "Tonnen C/Tonne Abfall"],
            },
            {
              code: "DOC_F",
              description:
                "Fraktion des sich zersetzenden DOC (IPCC Standard=0,5)",
              units: ["Fraktion"],
            },
            {
              code: "F",
              description:
                "Fraktion von Methan im Deponiegas (IPCC Standard=0,5)",
              units: ["Fraktion"],
            },
            {
              code: "16/12",
              description: "Molekulargewichtsverhältnis C→CH4",
              units: ["dimensionslos"],
            },
            {
              code: "CC_i",
              description: "Kohlenstoffgehalt nach Abfalltyp",
              units: ["Fraktion"],
            },
            {
              code: "WCF_i",
              description: "Abfallzusammensetzungsanteil nach Typ",
              units: ["Prozentsatz"],
            },
          ],
        },
        pt: {
          methodology: "Compromisso de Metano",
          overview:
            "A metodologia de Compromisso de Metano estima as emissões de metano (CH₄) da disposição de resíduos sólidos municipais (MSW) com base no potencial total de geração de metano do carbono orgânico degradável (DOC) depositado em aterros em um determinado ano. Este método assume que todo o DOC nos resíduos se decomporá e liberará metano, independentemente do tempo necessário, e, portanto, atribui 100% das emissões de metano ao ano de deposição dos resíduos.",
          sector: "Resíduos",
          scope: "Emissões do Escopo 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          features: [
            "Emissões atribuídas totalmente ao ano de relatório com base nos resíduos depositados naquele ano.",
            "Sem distribuição temporal—mais simples que o método de primeira ordem.",
            "Requer apenas dados de quantidade e composição de resíduos do ano corrente.",
            "Alinhado com IPCC Tier 1 e GPC para inventários em escala municipal.",
          ],
          limitations: [
            "Pode superestimar as emissões anuais, já que a liberação real de metano ocorre ao longo de décadas.",
            "Não considera o atraso temporal ou medidas de mitigação ao longo do tempo.",
          ],
          equations: [
            {
              label: "Eq. 8.3 Compromisso de Metano",
              formula:
                "\\text{emissions}_{CH_4} = MSW_x * L_o * (1 - f_{rec}) * (1 - OX)",
            },
            {
              label: "Eq. 8.4 Potencial de Geração de Metano",
              formula: "L_o = MCF * DOC * DOC_F * F * 16/12",
            },
            {
              label: "Eq. 8.1 Carbono Orgânico Degradável",
              formula: "DOC = \\sum_i CC_i \\cdot WCF_i",
            },
          ],
          parameters: [
            {
              code: "MSW_x",
              description: "Massa de resíduos úmidos dispostos",
              units: ["toneladas/ano", "kg/ano"],
            },
            {
              code: "L_o",
              description: "Potencial de Geração de Metano",
              units: ["toneladas CH4/tonelada resíduos", "kg CH4/kg resíduos"],
            },
            {
              code: "f_\\text{rec}",
              description:
                "Taxa de recuperação de metano (fração para queima ou uso energético)",
              units: ["fração"],
            },
            {
              code: "OX",
              description: "Fator de oxidação na cobertura do aterro",
              units: ["adimensional"],
            },
            {
              code: "MCF",
              description: "Fator de correção de metano por tipo de aterro",
              units: ["fração"],
            },
            {
              code: "DOC",
              description:
                "Conteúdo de Carbono Orgânico Degradável nos resíduos",
              units: ["kg C/kg resíduos", "toneladas C/tonelada resíduos"],
            },
            {
              code: "DOC_F",
              description: "Fração de DOC que se decompõe (IPCC padrão=0,5)",
              units: ["fração"],
            },
            {
              code: "F",
              description:
                "Fração de metano no gás do aterro (IPCC padrão=0,5)",
              units: ["fração"],
            },
            {
              code: "16/12",
              description: "Relação de peso molecular C→CH4",
              units: ["adimensional"],
            },
            {
              code: "CC_i",
              description: "Teor de carbono por tipo de resíduo",
              units: ["fração"],
            },
            {
              code: "WCF_i",
              description: "Fração de composição de resíduos por tipo",
              units: ["porcentagem"],
            },
          ],
        },
        fr: {
          methodology: "Engagement Méthane",
          overview:
            "La méthodologie Engagement Méthane estime les émissions de méthane (CH₄) provenant de l'élimination des déchets solides municipaux (MSW) en se basant sur le potentiel total de génération de méthane du carbone organique dégradable (DOC) déposé dans les sites d'enfouissement au cours d'une année donnée. Cette méthode suppose que tout le DOC contenu dans les déchets se décomposera et libérera du méthane, quel que soit le temps nécessaire, et attribue donc 100 % des émissions de méthane à l'année de dépôt des déchets.",
          sector: "Déchets",
          scope: "Émissions du Scope 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          features: [
            "Émissions entièrement attribuées à l'année de référence en fonction des déchets déposés cette année-là.",
            "Pas de répartition temporelle—plus simple que la méthode de premier ordre de décomposition.",
            "Nécessite uniquement les données de quantité et de composition des déchets de l'année en cours.",
            "Aligné sur l'IPCC Tier 1 et le GPC pour les inventaires à l'échelle municipale.",
          ],
          limitations: [
            "Peut surestimer les émissions annuelles, car la libération réelle de méthane s'étale sur des décennies.",
            "Ne tient pas compte du décalage temporel ni des mesures d'atténuation au fil du temps.",
          ],
          equations: [
            {
              label: "Équation 8.3 Engagement Méthane",
              formula:
                "\\text{emissions}_{CH_4} = MSW_x * L_o * (1 - f_{rec}) * (1 - OX)",
            },
            {
              label: "Équation 8.4 Potentiel de Génération de Méthane",
              formula: "L_o = MCF * DOC * DOC_F * F * 16/12",
            },
            {
              label: "Équation 8.1 Carbone Organique Dégradable",
              formula: "DOC = \\sum_i CC_i \\cdot WCF_i",
            },
          ],
          parameters: [
            {
              code: "MSW_x",
              description: "Masse de déchets humides éliminés",
              units: ["tonnes/an", "kg/an"],
            },
            {
              code: "L_o",
              description: "Potentiel de génération de méthane",
              units: ["tonnes CH4/tonne déchets", "kg CH4/kg déchets"],
            },
            {
              code: "f_\\text{rec}",
              description:
                "Taux de récupération du méthane (fraction pour torchage ou utilisation énergétique)",
              units: ["fraction"],
            },
            {
              code: "OX",
              description: "Facteur d'oxydation dans le revêtement du site",
              units: ["adimensionnel"],
            },
            {
              code: "MCF",
              description: "Facteur de correction du méthane par type de site",
              units: ["fraction"],
            },
            {
              code: "DOC",
              description:
                "Teneur en carbone organique dégradable dans les déchets",
              units: ["kg C/kg déchets", "tonnes C/tonne déchets"],
            },
            {
              code: "DOC_F",
              description: "Fraction du DOC qui se décompose (IPCC défaut=0,5)",
              units: ["fraction"],
            },
            {
              code: "F",
              description:
                "Fraction de méthane dans le gaz de décharge (IPCC défaut=0,5)",
              units: ["fraction"],
            },
            {
              code: "16/12",
              description: "Rapport de poids moléculaire C→CH4",
              units: ["adimensionnel"],
            },
            {
              code: "CC_i",
              description: "Teneur en carbone par type de déchet",
              units: ["fraction"],
            },
            {
              code: "WCF_i",
              description: "Fraction de composition des déchets par type",
              units: ["pourcentage"],
            },
          ],
        },
      },
    },
    {
      id: "biological-treatment",
      translations: {
        en: {
          methodology: "Biological Treatment",
          overview:
            "The Biological Treatment methodology estimates greenhouse gas (GHG) emissions from the aerobic or anaerobic processing of organic solid waste, such as food scraps, garden trimmings, and other biodegradable materials. This method captures emissions resulting from the decomposition of organic matter in facilities like composting plants and anaerobic digesters, and is used to estimate Scope 1 emissions under the Waste sector.",
          sector: "Waste",
          scope: "Scope 1 emissions",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          facilities:
            "Managed biological facilities (e.g., windrow composting, in-vessel composting, anaerobic digestion).",
          emissions:
            "Methane (CH₄) is produced under anaerobic conditions; nitrous oxide (N₂O) is released during aerobic processes.",
          default_emission_factors: [
            {
              gas: "CH4",
              treatment: "Composting",
              waste_state: "dry waste",
              value: 10,
            },
            {
              gas: "CH4",
              treatment: "Composting",
              waste_state: "wet waste",
              value: 4,
            },
            {
              gas: "CH4",
              treatment: "Anaerobic digestion",
              waste_state: "dry waste",
              value: 2,
            },
            {
              gas: "CH4",
              treatment: "Anaerobic digestion",
              waste_state: "wet waste",
              value: 0.8,
            },
            {
              gas: "N2O",
              treatment: "Composting",
              waste_state: "dry waste",
              value: 0.6,
            },
            {
              gas: "N2O",
              treatment: "Composting",
              waste_state: "wet waste",
              value: 0.24,
            },
          ],
          features: [
            "Easy to apply with minimal data: mass of waste and treatment type.",
            "Enables tracking of emissions reductions from landfill diversion.",
            "Supports planning low-emission waste strategies (composting, biogas).",
            "Fully compatible with IPCC Tier 1 and GPC requirements.",
            "Assumes default emission factors—may not reflect specific facility performance.",
            "Does not account for biogas capture unless reported separately.",
            "Requires distinction of organic waste stream from total MSW.",
            "May miss emissions from informal or backyard composting.",
          ],
          equations: [
            {
              label: "Eq. 8.5 CH₄ Emissions",
              formula:
                "\\text{CH}_4 \\text{ emissions} = \\sum_i [ (\\text{TOW}_i - \\text{S}_i) \\cdot \\text{EF}_{i,j} - \\text{R}_i ]",
            },
            {
              label: "Eq. 8.5 N₂O Emissions",
              formula:
                "\\text{N}_2\\text{O} \\text{ emissions} = \\sum_i [m_i \\cdot (\\text{EF}_{\\text{N}_2\\text{O}_i} \\cdot 10^{-3})]",
            },
          ],
          parameters: [
            {
              code: "m_i",
              description: "Mass of organic waste treated",
              units: ["tonnes/year", "kg/year"],
            },
            {
              code: "EF_{\\text{CH4}i}",
              description: "Methane emission factor by treatment type",
              units: ["g CH4/kg waste"],
            },
            {
              code: "EF_{\\text{N2O}i}",
              description: "Nitrous oxide emission factor by treatment type",
              units: ["g N2O/kg waste"],
            },
            {
              code: "R",
              description: "Mass of CH4 recovered in the inventory year",
              units: ["kg", "tonnes"],
            },
          ],
        },
        es: {
          methodology: "Tratamiento biológico",
          overview:
            "La metodología de Tratamiento Biológico estima las emisiones de gases de efecto invernadero (GEI) derivadas del procesamiento aerobio o anaerobio de residuos orgánicos sólidos, como restos de comida, recortes de jardín y otros materiales biodegradables. Captura las emisiones resultantes de la descomposición de materia orgánica en instalaciones como plantas de compostaje y digestores anaerobios, y se utiliza para estimar las emisiones de Alcance 1 en el sector de Residuos.",
          sector: "Residuos",
          scope: "Emisiones de Alcance 1",
          approach: {
            type: "IPCC Nivel 1",
            guidance: "GPC v.07",
          },
          facilities:
            "Instalaciones biológicas gestionadas (p.ej., compostaje en hilera, compostaje en recipiente, digestión anaerobia).",
          emissions:
            "Metano (CH₄) bajo condiciones anaerobias; óxido nitroso (N₂O) en procesos aerobios.",
          default_emission_factors: [
            {
              gas: "CH4",
              treatment: "Compostaje",
              waste_state: "residuos secos",
              value: 10,
            },
            {
              gas: "CH4",
              treatment: "Compostaje",
              waste_state: "residuos húmedos",
              value: 4,
            },
            {
              gas: "CH4",
              treatment: "Digestión anaerobia",
              waste_state: "residuos secos",
              value: 2,
            },
            {
              gas: "CH4",
              treatment: "Digestión anaerobia",
              waste_state: "residuos húmedos",
              value: 0.8,
            },
            {
              gas: "N2O",
              treatment: "Compostaje",
              waste_state: "residuos secos",
              value: 0.6,
            },
            {
              gas: "N2O",
              treatment: "Compostaje",
              waste_state: "residuos húmedos",
              value: 0.24,
            },
          ],
          features: [
            "Fácil de aplicar con datos mínimos: masa de residuos y tipo de tratamiento.",
            "Permite rastrear reducciones de emisiones al desviar residuos del vertedero.",
            "Apoya la planificación de estrategias de bajo carbono (compostaje, biogás).",
            "Totalmente compatible con IPCC Nivel 1 y requisitos GPC.",
            "Supone factores de emisión predeterminados—puede no reflejar desempeño específico.",
            "No considera captura de biogás salvo informe separado.",
            "Requiere distinguir flujo de residuos orgánicos de MSW total.",
            "Puede omitir emisiones de compostaje informal o doméstico.",
          ],
          equations: [
            {
              label: "Ecuación 8.5 emisiones CH₄",
              formula:
                "Total_CH4 = \\sum_i [m_i \\cdot (\\text{EF}_CH4_i \\cdot 10⁻³)] − R",
            },
            {
              label: "Ecuación 8.5 emisiones N₂O",
              formula:
                "Total_N2O = \\sum_i [m_i \\cdot (\\text{EF}_N2O_i \\cdot 10⁻³)]",
            },
          ],
          parameters: [
            {
              code: "m_i",
              description: "Masa de residuos orgánicos tratados",
              units: ["toneladas/año", "kg/año"],
            },
            {
              code: "EF_{\\text{CH4}i}",
              description:
                "Factor de emisión de metano por tipo de tratamiento",
              units: ["g CH4/kg residuos"],
            },
            {
              code: "EF_{\\text{N2O}i}",
              description:
                "Factor de emisión de óxido nitroso por tipo de tratamiento",
              units: ["g N2O/kg residuos"],
            },
            {
              code: "R",
              description: "Masa de CH4 recuperada en el año del inventario",
              units: ["kg", "toneladas"],
            },
          ],
        },
        de: {
          methodology: "Biologische Behandlung",
          overview:
            "Die Methodik der Biologischen Behandlung schätzt Treibhausgasemissionen (THG) aus der aerobischen oder anaerobischen Verarbeitung organischer Feststoffe, wie Speisereste, Gartenabfälle und andere biologisch abbaubare Materialien. Sie erfasst Emissionen aus der Zersetzung organischer Substanz in Anlagen wie Kompostieranlagen und anaeroben Fermentern und wird zur Schätzung der Scope-1-Emissionen im Abfallsektor verwendet.",
          sector: "Abfall",
          scope: "Scope-1-Emissionen",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          facilities:
            "Gemanagte biologische Anlagen (z. B. Windrow-Kompostierung, Behälter-Kompostierung, anaerobe Vergärung).",
          emissions:
            "Methan (CH₄) unter anaeroben Bedingungen; Distickstoffmonoxid (N₂O) in aeroben Prozessen.",
          default_emission_factors: [
            {
              gas: "CH4",
              treatment: "Kompostierung",
              waste_state: "trockener Abfall",
              value: 10,
            },
            {
              gas: "CH4",
              treatment: "Kompostierung",
              waste_state: "nasser Abfall",
              value: 4,
            },
            {
              gas: "CH4",
              treatment: "Anaerobe Vergärung",
              waste_state: "trockener Abfall",
              value: 2,
            },
            {
              gas: "CH4",
              treatment: "Anaerobe Vergärung",
              waste_state: "nasser Abfall",
              value: 0.8,
            },
            {
              gas: "N2O",
              treatment: "Kompostierung",
              waste_state: "trockener Abfall",
              value: 0.6,
            },
            {
              gas: "N2O",
              treatment: "Kompostierung",
              waste_state: "nasser Abfall",
              value: 0.24,
            },
          ],
          features: [
            "Einfach anzuwenden mit minimalen Daten: Abfallmasse und Behandlungstyp.",
            "Ermöglicht Verfolgung von Emissionsminderungen durch Deponievermeidung.",
            "Unterstützt Planung kohlenstoffarmer Abfallstrategien (Kompost, Biogas).",
            "Voll kompatibel mit IPCC Tier 1 und GPC-Anforderungen.",
            "Nimmt Standard-Emissionsfaktoren an—kann spezifische Leistung nicht abbilden.",
            "Berücksichtigt keine Biogaserfassung ohne separaten Bericht.",
            "Erfordert Trennung organischer Abfälle vom gesamten MSW.",
            "Kann Emissionen informeller oder häuslicher Kompostierung übersehen.",
          ],
          equations: [
            {
              label: "Gleichung 8.5 CH₄-Emissionen",
              formula:
                "\\text{emissions}_{CH_4} = MSW_x * L_o * (1 - f_{rec}) * (1 - OX)",
            },
            {
              label: "Gleichung 8.5 N₂O-Emissionen",
              formula:
                "\\text{emissions}_N2O = \\sum_i [m_i \\cdot (\\text{EF}_N2O_i \\cdot 10⁻³)]",
            },
          ],
          parameters: [
            {
              code: "MSW_x",
              description: "Masse des deponierten Nassabfalls",
              units: ["Tonnen/Jahr", "kg/Jahr"],
            },
            {
              code: "L_o",
              description: "Methangerierungspotenzial",
              units: ["Tonnen CH4/Tonne Abfall", "kg CH4/kg Abfall"],
            },
            {
              code: "f_\\text{rec}",
              description:
                "Methanrückgewinnungsrate (Fraktion für Verbrennung oder Energienutzung)",
              units: ["Fraktion"],
            },
            {
              code: "OX",
              description: "Oxidationsfaktor in der Deponieabdeckung",
              units: ["dimensionslos"],
            },
            {
              code: "MCF",
              description: "Methankorrekturfaktor nach Deponietyp",
              units: ["Fraktion"],
            },
            {
              code: "DOC",
              description:
                "Gehalt an abbaubarem organischem Kohlenstoff im Abfall",
              units: ["kg C/kg Abfall", "Tonnen C/Tonne Abfall"],
            },
            {
              code: "DOC_F",
              description:
                "Fraktion des sich zersetzenden DOC (IPCC Standard=0,5)",
              units: ["Fraktion"],
            },
            {
              code: "F",
              description:
                "Fraktion von Methan im Deponiegas (IPCC Standard=0,5)",
              units: ["Fraktion"],
            },
            {
              code: "16/12",
              description: "Molekulargewichtsverhältnis C→CH4",
              units: ["dimensionslos"],
            },
            {
              code: "CC_i",
              description: "Kohlenstoffgehalt nach Abfalltyp",
              units: ["Fraktion"],
            },
            {
              code: "WCF_i",
              description: "Abfallzusammensetzungsanteil nach Typ",
              units: ["Prozentsatz"],
            },
          ],
        },
        pt: {
          methodology: "Tratamento biológico",
          overview:
            "A metodologia de Tratamento Biológico estima emissões de gases de efeito estufa (GEE) do processamento aeróbio ou anaeróbio de resíduos sólidos orgânicos, como restos de comida, aparas de jardim e outros materiais biodegradáveis. Captura as emissões resultantes da decomposição em instalações como usinas de compostagem e digestores anaeróbios, e é usada para estimar as emissões do Escopo 1 no setor de Resíduos.",
          sector: "Resíduos",
          scope: "Emissões do Escopo 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          facilities:
            "Instalações biológicas gerenciadas (p.ex., compostagem em leiras, compostagem em recipiente, digestão anaeróbia).",
          emissions:
            "Metano (CH₄) em condições anaeróbias; óxido nitroso (N₂O) em processos aeróbios.",
          default_emission_factors: [
            {
              gas: "CH4",
              treatment: "Compostagem",
              waste_state: "resíduo seco",
              value: 10,
            },
            {
              gas: "CH4",
              treatment: "Compostagem",
              waste_state: "resíduo úmido",
              value: 4,
            },
            {
              gas: "CH4",
              treatment: "Digestão anaeróbia",
              waste_state: "resíduo seco",
              value: 2,
            },
            {
              gas: "CH4",
              treatment: "Digestão anaeróbia",
              waste_state: "resíduo úmido",
              value: 0.8,
            },
            {
              gas: "N2O",
              treatment: "Compostagem",
              waste_state: "resíduo seco",
              value: 0.6,
            },
            {
              gas: "N2O",
              treatment: "Compostagem",
              waste_state: "resíduo úmido",
              value: 0.24,
            },
          ],
          features: [
            "Fácil de aplicar com dados mínimos: massa de resíduo e tipo de tratamento.",
            "Permite acompanhar reduções de emissões pela redução de aterro.",
            "Apoia planejamento de estratégias de baixo carbono (compostagem, biogás).",
            "Totalmente compatível com IPCC Tier 1 e requisitos do GPC.",
            "Assume fatores de emissão padrão—pode não refletir desempenho específico.",
            "Não considera captura de biogás sem relatório separado.",
            "Requer distinguir resíduo orgânico do MSW total.",
            "Pode omitir emissões de compostagem informal ou doméstica.",
          ],
          equations: [
            {
              label: "Eq. 8.5 emissões de CH₄",
              formula:
                "Total_CH4 = \\sum_i [m_i \\cdot (\\text{EF}_CH4_i \\cdot 10⁻³)] − R",
            },
            {
              label: "Eq. 8.5 emissões de N₂O",
              formula:
                "Total_N2O = \\sum_i [m_i \\cdot (\\text{EF}_N2O_i \\cdot 10⁻³)]",
            },
          ],
          parameters: [
            {
              code: "m_i",
              description: "Massa de resíduo orgânico tratado",
              units: ["toneladas/ano", "kg/ano"],
            },
            {
              code: "EF_{CH4_i}",
              description: "Fator de emissão de metano por tipo de tratamento",
              units: ["g CH4/kg resíduo"],
            },
            {
              code: "EF_{\\text{N2O}i}",
              description: "Fator de emissão de N2O por tipo de tratamento",
              units: ["g N2O/kg resíduo"],
            },
            {
              code: "R",
              description: "Massa de CH4 recuperada no ano do inventário",
              units: ["kg", "toneladas"],
            },
          ],
        },
        fr: {
          methodology: "Traitement biologique",
          overview:
            "La méthodologie de Traitement biologique estime les émissions de gaz à effet de serre (GES) issues du traitement aérobie ou anaérobie des déchets organiques solides, tels que les restes alimentaires, les tailles de jardin et autres matériaux biodégradables. Elle capture les émissions résultant de la décomposition dans des installations comme les composteurs et les digesteurs anaérobies, et sert à estimer les émissions du Scope 1 dans le secteur des Déchets.",
          sector: "Déchets",
          scope: "Émissions du Scope 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          facilities:
            "Installations biologiques gérées (p.ex., compostage en andains, compostage en cuve, digestion anaérobie).",
          emissions:
            "Méthane (CH₄) en conditions anaérobies ; protoxyde d'azote (N₂O) en processus aérobies.",
          default_emission_factors: [
            {
              gas: "CH4",
              treatment: "Compostage",
              waste_state: "déchet sec",
              value: 10,
            },
            {
              gas: "CH4",
              treatment: "Compostage",
              waste_state: "déchet humide",
              value: 4,
            },
            {
              gas: "CH4",
              treatment: "Digestion anaérobie",
              waste_state: "déchet sec",
              value: 2,
            },
            {
              gas: "CH4",
              treatment: "Digestion anaérobie",
              waste_state: "déchet humide",
              value: 0.8,
            },
            {
              gas: "N2O",
              treatment: "Compostage",
              waste_state: "déchet sec",
              value: 0.6,
            },
            {
              gas: "N2O",
              treatment: "Compostage",
              waste_state: "déchet humide",
              value: 0.24,
            },
          ],
          features: [
            "Facile à appliquer avec peu de données : masse de déchet et type de traitement.",
            "Permet de suivre les réductions d'émissions par la réduction de mise en décharge.",
            "Soutient la planification de stratégies bas carbone (compost, biogaz).",
            "Entièrement compatible IPCC Tier 1 et exigences GPC.",
            "Suppose des facteurs d'émission par défaut—peut ne pas refléter les performances spécifiques.",
            "Ne prend pas en compte la capture de biogaz sans rapport séparé.",
            "Nécessite la distinction du déchet organique du MSW total.",
            "Peut omettre les émissions du compostage informel ou domestique.",
          ],
          equations: [
            {
              label: "Eq. 8.5 émissions de CH₄",
              formula:
                "Total_CH4 = \\sum_i [m_i \\cdot (\\text{EF}_CH4_i \\cdot 10⁻³)] − R",
            },
            {
              label: "Eq. 8.5 émissions de N₂O",
              formula:
                "Total_N2O = \\sum_i [m_i \\cdot (\\text{EF}_N2O_i \\cdot 10⁻³)]",
            },
          ],
          parameters: [
            {
              code: "m_i",
              description: "Masse de déchets organiques traités",
              units: ["tonnes/an", "kg/an"],
            },
            {
              code: "EF_{CH4_i}",
              description:
                "Facteur d'émission de méthane par type de traitement",
              units: ["g CH4/kg déchet"],
            },
            {
              code: "EF_{\\text{N2O}i}",
              description: "Facteur d'émission de N2O par type de traitement",
              units: ["g N2O/kg déchet"],
            },
            {
              code: "R",
              description: "Masse de CH4 récupérée durant l'année d'inventaire",
              units: ["kg", "tonnes"],
            },
          ],
        },
      },
    },
    {
      id: "incineration-open-burning",
      translations: {
        en: {
          methodology: "Incineration and Open Burning",
          overview:
            "The Incineration and Open Burning methodology estimates greenhouse gas (GHG) emissions from the combustion of solid waste, whether in controlled incineration facilities or through uncontrolled open burning. It captures emissions from the oxidation of organic and synthetic materials in municipal solid waste (MSW)—including plastics, textiles, rubber, and biomass-based materials. Emissions include CO₂, CH₄, and N₂O, reported as Scope 1 under the Waste sector. This Tier 1 IPCC method (GPC v.07) applies when cities have data on waste incinerated or burned, with or without energy recovery. Emissions are calculated per mass of waste and composition; CH₄/N₂O are always reported. Energy‐recovery emissions go to Stationary Energy; combustion‐process emissions remain in Waste.",
          sector: "Waste",
          scope: "Scope 1 emissions",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          default_emission_factors: [
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Continuous incineration",
              boiler_type: "stoker",
              value: 0.2,
            },
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Continuous incineration",
              boiler_type: "fluidised bed",
              value: 0,
            },
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Semi-continuous incineration",
              boiler_type: "stoker",
              value: 6,
            },
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Semi-continuous incineration",
              boiler_type: "fluidised bed",
              value: 188,
            },
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Batch incineration",
              boiler_type: "stoker",
              value: 60,
            },
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Batch incineration",
              boiler_type: "fluidised bed",
              value: 237,
            },
            {
              gas: "N2O",
              waste_type: "MSW",
              technology: "Continuous & Semi-continuous incineration",
              value: 50,
            },
            {
              gas: "N2O",
              waste_type: "MSW",
              technology: "Batch incineration",
              value: 60,
            },
            {
              gas: "N2O",
              waste_type: "MSW",
              technology: "Open burning",
              value: 150,
            },
            {
              gas: "N2O",
              waste_type: "Industrial waste",
              technology: "All incineration types",
              value: 100,
            },
            {
              gas: "N2O",
              waste_type: "Sludge (excl. sewage)",
              technology: "All incineration types",
              value: 450,
            },
            {
              gas: "N2O",
              waste_type: "Sewage sludge",
              technology: "Incineration",
              value: 990,
            },
          ],
          features: [
            "Applicable when cities have basic waste-flow data on incineration or open burning.",
            "Tracks emissions from disposal methods beyond landfill, including harmful open burning.",
            "Supports monitoring of waste-to-energy, separating combustion vs. energy emissions.",
          ],
          limitations: [
            "Assumes average combustion conditions; may not capture local variability or facility efficiency.",
            "Requires estimates of fossil vs. biogenic content to calculate CO₂ correctly.",
            "Open burning data often incomplete or based on assumptions.",
          ],
          equations: [
            {
              label: "Eq. 8.6 CO₂ emissions",
              formula:
                "\\text{CO}_2 \\text{ emissions} = m \\cdot \\sum_i(\\text{WF}_i \\cdot \\text{dm}_i \\cdot \\text{CF}_i \\cdot \\text{FCF}_i \\cdot \\text{OF}_i) \\cdot \\frac{44}{12}",
            },
            {
              label: "Eq. 8.7 CH₄ emissions",
              formula:
                "\\text{CH}_4 \\text{ emissions} = \\sum_i m_i \\cdot (\\text{EF}_i \\cdot 10^{-6})",
            },
            {
              label: "Eq. 8.8 N₂O emissions",
              formula:
                "\\text{N}_2\\text{O} \\text{ emissions} = \\sum_i (m_i \\cdot \\text{EF}_i) \\cdot 10^{-3}",
            },
          ],
          parameters: [
            {
              code: "m",
              description: "Mass of waste incinerated",
              units: ["kg", "tonnes"],
            },
            {
              code: "WF_i",
              description: "Fraction of waste consisting of type i matter",
              units: ["dimensionless"],
            },
            {
              code: "dm_i",
              description: "Dry matter content in type i matter",
              units: ["dimensionless"],
            },
            {
              code: "CF_i",
              description: "Fraction of carbon in the dry matter of type i",
              units: ["dimensionless"],
            },
            {
              code: "FCF_i",
              description:
                "Fraction of fossil carbon in total carbon of type i",
              units: ["dimensionless"],
            },
            {
              code: "OF_i",
              description:
                "Oxidation fraction (incineration=1, open burning=0.58)",
              units: ["dimensionless"],
            },
            {
              code: "44/12",
              description: "C→CO₂ molecular weight conversion",
              units: ["dimensionless"],
            },
            {
              code: "m_i",
              description: "Mass of waste incinerated by type i",
              units: ["kg", "tonnes"],
            },
            {
              code: "EF_i",
              description: "Aggregate emission factor (CH₄ or N₂O)",
              units: ["g gas/tonnes of waste"],
            },
            {
              code: "10^{-6}",
              description: "Conversion g CH₄/tonne waste → kg CH₄/kg waste",
              units: ["dimensionless"],
            },
          ],
        },
        es: {
          methodology: "Incineración y quema abierta",
          overview:
            "La metodología de Incineración y Quema Abierta estima las emisiones de gases de efecto invernadero (GEI) derivadas de la combustión de residuos sólidos, ya sea en instalaciones de incineración controlada o mediante quema abierta no controlada. Captura emisiones de la oxidación de materiales orgánicos y sintéticos en residuos sólidos municipales (RSM), incluidos plásticos, textiles, caucho y materiales biogénicos. Las emisiones (CO₂, CH₄, N₂O) se reportan como Alcance 1 en el sector de Residuos. Este método de Nivel 1 del IPCC (GPC v.07) se aplica cuando las ciudades disponen de datos sobre residuos incinerados o quemados, con o sin recuperación de energía. Las emisiones se calculan según masa y composición de residuos; CH₄ y N₂O siempre se informan. Las emisiones por recuperación de energía van a Energía Estacionaria; las de combustión permanecen en Residuos.",
          sector: "Residuos",
          scope: "Emisiones de Alcance 1",
          approach: {
            type: "IPCC Nivel 1",
            guidance: "GPC v.07",
          },
          default_emission_factors: [
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineración continua",
              boiler_type: "alimentador de parrilla",
              value: 0.2,
            },
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineración continua",
              boiler_type: "lecho fluidizado",
              value: 0,
            },
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineración semicontinua",
              boiler_type: "alimentador de parrilla",
              value: 6,
            },
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineración semicontinua",
              boiler_type: "lecho fluidizado",
              value: 188,
            },
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineración por lotes",
              boiler_type: "alimentador de parrilla",
              value: 60,
            },
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineración por lotes",
              boiler_type: "lecho fluidizado",
              value: 237,
            },
            {
              gas: "N2O",
              waste_type: "RSM",
              technology: "Incineración continua y semicontinua",
              value: 50,
            },
            {
              gas: "N2O",
              waste_type: "RSM",
              technology: "Incineración por lotes",
              value: 60,
            },
            {
              gas: "N2O",
              waste_type: "RSM",
              technology: "Quema abierta",
              value: 150,
            },
            {
              gas: "N2O",
              waste_type: "Residuos industriales",
              technology: "Todos los tipos de incineración",
              value: 100,
            },
            {
              gas: "N2O",
              waste_type: "Lodos (excl. residuales)",
              technology: "Todos los tipos de incineración",
              value: 450,
            },
            {
              gas: "N2O",
              waste_type: "Lodos de aguas residuales",
              technology: "Incineración",
              value: 990,
            },
          ],
          features: [
            "Aplicable cuando las ciudades tienen datos básicos de flujo de residuos sobre incineración o quema abierta.",
            "Rastrea emisiones de métodos distintos al vertedero, incluidas prácticas nocivas de quema abierta.",
            "Apoya el monitoreo de sistemas de valorización energética, separando emisiones de combustión de las asociadas a la energía.",
          ],
          limitations: [
            "Asume condiciones promedio de combustión y puede no capturar la variabilidad local o la eficiencia de las instalaciones.",
            "Requiere estimar contenido fósil vs. biogénico para calcular CO₂ correctamente.",
            "Los datos de quema abierta suelen estar incompletos o basados en suposiciones.",
          ],
          equations: [
            {
              label: "Ecuación 8.6 emisiones de CO₂",
              formula:
                "CO₂ Emisiones = m \\cdot \\sum_i(WF_i \\cdot dm_i \\cdot CF_i \\cdot \\text{FCF}_i \\cdot \\text{OF}_i) \\cdot (44/12)",
            },
            {
              label: "Ecuación 8.7 emisiones de CH₄",
              formula:
                "CH₄ Total = \\sum_i m_i \\cdot (\\text{EF}_i \\cdot 10^{-6})",
            },
            {
              label: "Ecuación 8.8 emisiones de N₂O",
              formula:
                "N₂O Total = \\sum_i (m_i \\cdot \\text{EF}_i) \\cdot 10^{-3}",
            },
          ],
          parameters: [
            {
              code: "m",
              description: "Masa de residuos incinerados",
              units: ["kg", "toneladas"],
            },
            {
              code: "WF_i",
              description: "Fracción de residuos del tipo i",
              units: ["adimensional"],
            },
            {
              code: "dm_i",
              description: "Contenido de materia seca en tipo i",
              units: ["adimensional"],
            },
            {
              code: "CF_i",
              description: "Fracción de carbono en materia seca tipo i",
              units: ["adimensional"],
            },
            {
              code: "FCF_i",
              description: "Fracción de carbono fósil en carbono total tipo i",
              units: ["adimensional"],
            },
            {
              code: "OF_i",
              description:
                "Fracción de oxidación (incineración=1, quema abierta=0.58)",
              units: ["adimensional"],
            },
            {
              code: "44/12",
              description: "Conversión C→CO₂",
              units: ["adimensional"],
            },
            {
              code: "m_i",
              description: "Masa de residuos incinerados por tipo i",
              units: ["kg", "toneladas"],
            },
            {
              code: "EF_i",
              description: "Factor de emisión agregado (CH₄ o N₂O)",
              units: ["g gas/tonelada residuos"],
            },
            {
              code: "10^{-6}",
              description: "Convierte g CH₄/ton a kg CH₄/kg",
              units: ["adimensional"],
            },
          ],
        },
        de: {
          methodology: "Verbrennung und Freiluftverbrennung",
          overview:
            "Die Methodik zur Verbrennung und Freiluftverbrennung schätzt Treibhausgasemissionen (THG) aus der Verbrennung fester Abfälle in kontrollierten Verbrennungsanlagen oder bei unkontrollierter Freiluftverbrennung. Sie erfasst Emissionen aus der Oxidation organischer und synthetischer Materialien in kommunalen Siedlungsabfällen (MSW) – einschließlich Kunststoffe, Textilien, Gummi und biogene Stoffe. Emissionen (CO₂, CH₄, N₂O) werden als Scope 1 im Abfallsektor gemeldet. Dieser Tier 1-Ansatz des IPCC (GPC v.07) gilt, wenn Städte Daten zu verbrannten Abfällen haben, mit oder ohne Energierückgewinnung. Emissionen werden nach Masse und Zusammensetzung berechnet; CH₄/N₂O werden immer erfasst. Energiebezogene Emissionen gehen in den Sektor Stationäre Energie; Prozessemissionen verbleiben im Abfallsektor.",
          sector: "Abfall",
          scope: "Scope 1-Emissionen",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          default_emission_factors: [
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Kontinuierliche Verbrennung",
              boiler_type: "Rostfeuerung",
              value: 0.2,
            },
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Kontinuierliche Verbrennung",
              boiler_type: "Wirbelschicht",
              value: 0,
            },
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Halbkontinuierliche Verbrennung",
              boiler_type: "Rostfeuerung",
              value: 6,
            },
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Halbkontinuierliche Verbrennung",
              boiler_type: "Wirbelschicht",
              value: 188,
            },
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Batch-Verbrennung",
              boiler_type: "Rostfeuerung",
              value: 60,
            },
            {
              gas: "CH4",
              waste_type: "MSW",
              technology: "Batch-Verbrennung",
              boiler_type: "Wirbelschicht",
              value: 237,
            },
            {
              gas: "N2O",
              waste_type: "MSW",
              technology: "Kontinuierlich & Halbkontinuierlich",
              value: 50,
            },
            {
              gas: "N2O",
              waste_type: "MSW",
              technology: "Batch-Verbrennung",
              value: 60,
            },
            {
              gas: "N2O",
              waste_type: "MSW",
              technology: "Freiluftverbrennung",
              value: 150,
            },
            {
              gas: "N2O",
              waste_type: "Industrieabfälle",
              technology: "Alle Verbrennungsarten",
              value: 100,
            },
            {
              gas: "N2O",
              waste_type: "Schlamm (exkl. Abwasser)",
              technology: "Alle Verbrennungsarten",
              value: 450,
            },
            {
              gas: "N2O",
              waste_type: "Abwasserschlamm",
              technology: "Verbrennung",
              value: 990,
            },
          ],
          features: [
            "Anwendbar bei grundlegenden Abfallflussdaten zu Verbrennung oder Freiluftverbrennung.",
            "Erfasst Emissionen von Entsorgungsmethoden jenseits der Deponie, inkl. schädlicher Freiluftverbrennung.",
            "Unterstützt Überwachung von Abfall-zu-Energie-Systemen, trennt Verbrennungs- und Energieemissionen.",
          ],
          limitations: [
            "Setzt durchschnittliche Verbrennungsbedingungen voraus; lokale Variabilität oder Effizienz werden evtl. nicht erfasst.",
            "Erfordert Schätzung von fossilen vs. biogenen Anteilen zur korrekten CO₂-Berechnung.",
            "Daten zur Freiluftverbrennung sind oft unvollständig oder Annahmen-basiert.",
          ],
          equations: [
            {
              label: "Gleichung 8.6 CO₂-Emissionen",
              formula:
                "CO₂ Emissionen = m \\cdot \\sum_i(WF_i \\cdot dm_i \\cdot CF_i \\cdot \\text{FCF}_i \\cdot \\text{OF}_i) \\cdot (44/12)",
            },
            {
              label: "Gleichung 8.7 CH₄-Emissionen",
              formula:
                "CH₄ Gesamt = \\sum_i m_i \\cdot (\\text{EF}_i \\cdot 10^{-6})",
            },
            {
              label: "Gleichung 8.8 N₂O-Emissionen",
              formula:
                "N₂O Gesamt = \\sum_i (m_i \\cdot \\text{EF}_i) \\cdot 10^{-3}",
            },
          ],
          parameters: [
            {
              code: "m",
              description: "Masse des verbrannten Abfalls",
              units: ["kg", "Tonnen"],
            },
            {
              code: "WF_i",
              description: "Fraktion von Abfall des Typs i",
              units: ["dimensionslos"],
            },
            {
              code: "dm_i",
              description: "Trockenmasseanteil in Typ i",
              units: ["dimensionslos"],
            },
            {
              code: "CF_i",
              description: "Kohlenstoffanteil in Trockenmasse Typ i",
              units: ["dimensionslos"],
            },
            {
              code: "FCF_i",
              description:
                "Fraktion fossilen Kohlenstoffs im Gesamt-Kohlenstoff",
              units: ["dimensionslos"],
            },
            {
              code: "OF_i",
              description: "Oxidationsfraktion (Verbrennung=1, Freiluft=0.58)",
              units: ["dimensionslos"],
            },
            {
              code: "44/12",
              description: "C→CO₂ Umrechnungsverhältnis",
              units: ["dimensionslos"],
            },
            {
              code: "m_i",
              description: "Masse des Abfalls Typ i",
              units: ["kg", "Tonnen"],
            },
            {
              code: "EF_i",
              description: "Summierter Emissionsfaktor (CH₄ oder N₂O)",
              units: ["g Gas/Tonne Abfall"],
            },
            {
              code: "10^{-6}",
              description: "Umrechnung g CH₄/Tonne → kg CH₄/kg",
              units: ["dimensionslos"],
            },
          ],
        },
        pt: {
          methodology: "Incineração e Queima Aberta",
          overview:
            "A metodologia de Incineração e Queima Aberta estima emissões de gases de efeito estufa (GEE) da combustão de resíduos sólidos, seja em instalações de incineração controlada ou por queima aberta não controlada. Captura emissões da oxidação de materiais orgânicos e sintéticos em resíduos sólidos municipais (RSM), incluindo plásticos, têxteis, borracha e materiais biogênicos. As emissões (CO₂, CH₄, N₂O) são reportadas como Escopo 1 no setor de Resíduos. Este método IPCC Tier 1 (GPC v.07) aplica-se quando as cidades têm dados de resíduos incinerados ou queimados, com ou sem recuperação de energia. As emissões são calculadas por massa e composição de resíduos; CH₄/N₂O são sempre reportados. Emissões de recuperação de energia vão a Energia Estacionária; de combustão permanecem em Resíduos.",
          sector: "Resíduos",
          scope: "Emissões do Escopo 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          default_emission_factors: [
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineração contínua",
              boiler_type: "alimentador de grelha",
              value: 0.2,
            },
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineração contínua",
              boiler_type: "leito fluidizado",
              value: 0,
            },
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineração semicontínua",
              boiler_type: "alimentador de grelha",
              value: 6,
            },
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineração semicontínua",
              boiler_type: "leito fluidizado",
              value: 188,
            },
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineração em lotes",
              boiler_type: "alimentador de grelha",
              value: 60,
            },
            {
              gas: "CH4",
              waste_type: "RSM",
              technology: "Incineração em lotes",
              boiler_type: "leito fluidizado",
              value: 237,
            },
            {
              gas: "N2O",
              waste_type: "RSM",
              technology: "Contínuo & Semicontínuo",
              value: 50,
            },
            {
              gas: "N2O",
              waste_type: "RSM",
              technology: "Incineração em lotes",
              value: 60,
            },
            {
              gas: "N2O",
              waste_type: "RSM",
              technology: "Queima aberta",
              value: 150,
            },
            {
              gas: "N2O",
              waste_type: "Resíduos industriais",
              technology: "Todos os tipos de incineração",
              value: 100,
            },
            {
              gas: "N2O",
              waste_type: "Lodo (exceto lodo de esgoto)",
              technology: "Todos os tipos de incineração",
              value: 450,
            },
            {
              gas: "N2O",
              waste_type: "Lodo de esgoto",
              technology: "Incineração",
              value: 990,
            },
          ],
          features: [
            "Aplicável quando cidades têm dados básicos de fluxo de resíduos sobre incineração ou queima aberta.",
            "Rastreia emissões de métodos além de aterro, incluindo queima aberta nociva.",
            "Apoia monitoramento de sistemas resíduos-para-energia, separando emissões de combustão e de energia.",
          ],
          limitations: [
            "Presume condições médias de combustão; pode não capturar variabilidade local ou eficiência de instalações.",
            "Requer estimativa de fração fóssil vs. biogênica para calcular CO₂ corretamente.",
            "Dados de queima aberta frequentemente incompletos ou baseados em suposições.",
          ],
          equations: [
            {
              label: "Eq. 8.6 emissões de CO₂",
              formula:
                "CO₂ Emissões = m \\cdot \\sum_i(WF_i \\cdot dm_i \\cdot CF_i \\cdot \\text{FCF}_i \\cdot \\text{OF}_i) \\cdot (44/12)",
            },
            {
              label: "Eq. 8.7 emissões de CH₄",
              formula:
                "CH₄ Total = \\sum_i m_i \\cdot (\\text{EF}_i \\cdot 10^{-6})",
            },
            {
              label: "Eq. 8.8 emissões de N₂O",
              formula:
                "N₂O Total = \\sum_i (m_i \\cdot \\text{EF}_i) \\cdot 10^{-3}",
            },
          ],
          parameters: [
            {
              code: "m",
              description: "Massa de resíduos incinerados",
              units: ["kg", "toneladas"],
            },
            {
              code: "WF_i",
              description: "Fração de resíduos do tipo i",
              units: ["adimensional"],
            },
            {
              code: "dm_i",
              description: "Conteúdo de matéria seca no tipo i",
              units: ["adimensional"],
            },
            {
              code: "CF_i",
              description: "Fração de carbono na matéria seca do tipo i",
              units: ["adimensional"],
            },
            {
              code: "FCF_i",
              description:
                "Fração de carbono fóssil no carbono total do tipo i",
              units: ["adimensional"],
            },
            {
              code: "OF_i",
              description:
                "Fração de oxidação (incineração=1, queima aberta=0.58)",
              units: ["adimensional"],
            },
            {
              code: "44/12",
              description: "Conversão C→CO₂",
              units: ["adimensional"],
            },
            {
              code: "m_i",
              description: "Massa de resíduos incinerados por tipo i",
              units: ["kg", "toneladas"],
            },
            {
              code: "EF_i",
              description: "Fator de emissão agregado (CH₄ ou N₂O)",
              units: ["g gás/tonelada de resíduo"],
            },
            {
              code: "10^{-6}",
              description: "Conversão g CH₄/ton → kg CH₄/kg",
              units: ["adimensional"],
            },
          ],
        },
        fr: {
          methodology: "Incinération et brûlage à l'air libre",
          overview:
            "La méthodologie d'Incinération et de Brûlage à l'Air Libre estime les émissions de gaz à effet de serre (GES) issues de la combustion des déchets solides, en installations contrôlées ou par brûlage à l'air libre non contrôlé. Elle capture les émissions de l'oxydation de matériaux organiques et synthétiques dans les déchets solides municipaux (DSM) – plastiques, textiles, caoutchouc, biomasse. Les émissions (CO₂, CH₄, N₂O) sont déclarées en Scope 1 dans le secteur des Déchets. Cette méthode IPCC Tier 1 (GPC v.07) s'applique lorsque les villes disposent de données sur les déchets incinérés ou brûlés, avec ou sans valorisation énergétique. Les émissions sont calculées par masse et composition des déchets ; CH₄/N₂O sont toujours rapportés. Les émissions liées à l'énergie vont au secteur Énergie Stationnaire ; les émissions de combustion restent en Déchets.",
          sector: "Déchets",
          scope: "Émissions du Scope 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          default_emission_factors: [
            {
              gas: "CH4",
              waste_type: "DSM",
              technology: "Incinération continue",
              boiler_type: "alimentation par grille",
              value: 0.2,
            },
            {
              gas: "CH4",
              waste_type: "DSM",
              technology: "Incinération continue",
              boiler_type: "lit fluidisé",
              value: 0,
            },
            {
              gas: "CH4",
              waste_type: "DSM",
              technology: "Incinération semi-continue",
              boiler_type: "alimentation par grille",
              value: 6,
            },
            {
              gas: "CH4",
              waste_type: "DSM",
              technology: "Incinération semi-continue",
              boiler_type: "lit fluidisé",
              value: 188,
            },
            {
              gas: "CH4",
              waste_type: "DSM",
              technology: "Incinération discontinue",
              boiler_type: "alimentation par grille",
              value: 60,
            },
            {
              gas: "CH4",
              waste_type: "DSM",
              technology: "Incinération discontinue",
              boiler_type: "lit fluidisé",
              value: 237,
            },
            {
              gas: "N2O",
              waste_type: "DSM",
              technology: "Continue & semi-continue",
              value: 50,
            },
            {
              gas: "N2O",
              waste_type: "DSM",
              technology: "Incinération discontinue",
              value: 60,
            },
            {
              gas: "N2O",
              waste_type: "DSM",
              technology: "Brûlage à l'air libre",
              value: 150,
            },
            {
              gas: "N2O",
              waste_type: "Déchets industriels",
              technology: "Tous types d'incinération",
              value: 100,
            },
            {
              gas: "N2O",
              waste_type: "Boues (sauf eaux usées)",
              technology: "Tous types d'incinération",
              value: 450,
            },
            {
              gas: "N2O",
              waste_type: "Boues d'eaux usées",
              technology: "Incinération",
              value: 990,
            },
          ],
          features: [
            "Applicable dès qu'il existe des données de flux de déchets sur incinération ou brûlage à l'air libre.",
            "Suit les émissions de méthodes autres que la mise en décharge, y compris le brûlage ouvert nocif.",
            "Prend en charge le suivi des systèmes valorisation énergétique, séparant émissions de combustion et émissions d'énergie.",
          ],
          limitations: [
            "Suppose des conditions moyennes de combustion ; peut ne pas capturer la variabilité locale ou l'efficacité des installations.",
            "Nécessite d'estimer la part fossile vs. biogénique pour calculer correctement le CO₂.",
            "Les données sur le brûlage à l'air libre sont souvent incomplètes ou basées sur des hypothèses.",
          ],
          equations: [
            {
              label: "Équation 8.6 émissions de CO₂",
              formula:
                "CO₂ Émissions = m \\cdot \\sum_i(WF_i \\cdot dm_i \\cdot CF_i \\cdot \\text{FCF}_i \\cdot \\text{OF}_i) \\cdot (44/12)",
            },
            {
              label: "Équation 8.7 émissions de CH₄",
              formula:
                "CH₄ Total = \\sum_i m_i \\cdot (\\text{EF}_i \\cdot 10^{-6})",
            },
            {
              label: "Équation 8.8 émissions de N₂O",
              formula:
                "N₂O Total = \\sum_i (m_i \\cdot \\text{EF}_i) \\cdot 10^{-3}",
            },
          ],
          parameters: [
            {
              code: "m",
              description: "Masse de déchets incinérés",
              units: ["kg", "tonnes"],
            },
            {
              code: "WF_i",
              description: "Fraction de déchets de type i",
              units: ["sans unité"],
            },
            {
              code: "dm_i",
              description: "Teneur en matière sèche du type i",
              units: ["sans unité"],
            },
            {
              code: "CF_i",
              description: "Fraction de carbone dans la matière sèche type i",
              units: ["sans unité"],
            },
            {
              code: "FCF_i",
              description:
                "Fraction de carbone fossile dans le carbone total type i",
              units: ["sans unité"],
            },
            {
              code: "OF_i",
              description:
                "Fraction d'oxydation (incinération=1, brûlage=0.58)",
              units: ["sans unité"],
            },
            {
              code: "44/12",
              description: "Conversion moléculaire C→CO₂",
              units: ["sans unité"],
            },
            {
              code: "m_i",
              description: "Masse de déchets incinérés par type i",
              units: ["kg", "tonnes"],
            },
            {
              code: "EF_i",
              description: "Facteur d'émission agrégé (CH₄ ou N₂O)",
              units: ["g gaz/tonne de déchets"],
            },
            {
              code: "10^{-6}",
              description: "Conversion g CH₄/tonne → kg CH₄/kg",
              units: ["sans unité"],
            },
          ],
        },
      },
    },
    {
      id: "wastewater-treatment",
      translations: {
        en: {
          methodology: "Wastewater Treatment and Discharge",
          overview:
            "This methodology estimates GHG emissions (CH₄ and N₂O) from the treatment and disposal of domestic and industrial wastewater—sewage and sludge—using an IPCC Tier 1 approach (GPC v.07). Scope 1 covers treatment within the city boundary, Scope 3 when treated elsewhere. It is based on wastewater volume or organic load (BOD/COD), treatment type, and default emission factors; CO₂ is biogenic and excluded. Methane recovered via biogas is subtracted and reported under Stationary Energy.",
          sector: "Waste",
          scope: {
            within_boundary: "Scope 1 emissions",
            outside_boundary: "Scope 3 emissions",
          },
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          features: [
            "Estimates CH₄ and N₂O from domestic and industrial wastewater using default Tier 1 factors",
            "Based on volume, population or flow, BOD/COD load, and treatment/discharge systems",
            "Subtracts recovered methane (biogas) and reports it under Stationary Energy",
            "Compatible with GPC guidance where detailed monitoring data are unavailable",
            "Highlights climate impact of untreated wastewater and advantages of biogas recovery",
          ],
          limitations: [
            "Relies on proxies and assumptions when actual plant data are missing",
            "Industrial wastewater emissions may be hard to estimate without sector data",
            "Default factors may not reflect local management or system performance",
            "Biogenic CO₂ is excluded per IPCC guidance",
            "Data gaps often exist for protein consumption, nitrogen discharge, or BOD/COD levels",
          ],
          equations: [
            {
              label: "Eq. 8.9 CH₄ emissions",
              formula:
                "\\text{CH}_4 \\text{ emissions} = \\sum_i [ (\\text{TOW}_i - \\text{S}_i) \\cdot  \\text{EF}_{i,j} - R_i ]",
            },
            {
              label: "Adapted Eq. 8.11 Organic content and emission factors",
              formula:
                "\\text{TOW}_i = P_i \\cdot \\text{BOD} \\cdot I \\cdot 365;  P_i = P / U_i;   \\text{EF}_{i,j} = B_o \\cdot \\text{MCF}_j \\cdot U_i \\cdot T_{i,j}",
            },
            {
              label: "Eq. 8.12 Indirect N₂O emissions",
              formula:
                "\\text{N2O emissions} = [(Pi\\times{Protein}\\times{F_{NPR}\\times{F_{NON-CON}\\times{F_{IND-COM}}}})-N_{sludge}]\\times{EF_{efluent}\\times{44/28}}",
            },
          ],
          parameters: [
            {
              code: "\\text{TOW}_i",
              description:
                "Organic load in wastewater by income group and system",
              units: "kg BOD/yr",
            },
            {
              code: "S_i",
              description: "BOD removed as sludge",
              units: "kg BOD/yr",
            },
            {
              code: "EF_{i,j}",
              description: "CH₄ emission factor by group and system",
              units: "kg CH4/kg BOD",
            },
            {
              code: "R_i",
              description: "Fraction of CH₄ recovered (biogas capture)",
              units: "dimensionless",
            },
            {
              code: "P_i",
              description: "Population by income group",
              units: "capita",
            },
            {
              code: "P",
              description: "Total city population",
              units: "capita",
            },
            {
              code: "U_i",
              description: "Utilization fraction by income group",
              units: "dimensionless",
            },
            {
              code: "BOD",
              description: "Per capita BOD generation",
              units: "g BOD/person/day",
            },
            {
              code: "I",
              description: "Industrial BOD correction factor (1 or 1.25)",
              units: "dimensionless",
            },
            {
              code: "B_o",
              description: "Maximum CH₄ production capacity",
              units: "kg CH4/kg BOD",
            },
            {
              code: "MCF_j",
              description: "Methane correction factor for system j",
              units: "dimensionless",
            },
            {
              code: "T_{i,j}",
              description: "Treatment/discharge pathway utilization ratio",
              units: "dimensionless",
            },
            {
              code: "Protein",
              description: "Per capita protein consumption",
              units: "kg/person/yr",
            },
            {
              code: "F_{NPR}",
              description: "Non-consumed protein adjustment factor",
              units: "dimensionless",
            },
            {
              code: "F_{NON−CON}",
              description: "Fraction of N in protein",
              units: "kg N/kg protein",
            },
            {
              code: "F_{IND−COM}",
              description: "Industrial/commercial co-discharge factor",
              units: "dimensionless",
            },
            {
              code: "N_\\text{sludge}",
              description: "Nitrogen removed with sludge",
              units: "kg N/yr",
            },
            {
              code: "EF_\\text{efluent}",
              description: "N₂O-N emission factor for effluent",
              units: "kg N2O-N/kg N",
            },
            {
              code: "44/28",
              description: "Conversion factor N₂O-N → N₂O",
              units: "dimensionless",
            },
          ],
        },
        es: {
          methodology: "Tratamiento y descarga de aguas residuales",
          overview:
            "Esta metodología estima las emisiones de GEI (CH₄ y N₂O) del tratamiento y disposición de aguas residuales domésticas e industriales—aguas negras y lodos—siguiendo un enfoque IPCC Nivel 1 (GPC v.07). Las emisiones Alcance 1 cubren tratamiento dentro del límite de la ciudad, Alcance 3 cuando se trata fuera. Se basa en el volumen o la carga orgánica (DBO/COD), el tipo de tratamiento y factores de emisión predeterminados; el CO₂ es biogénico y se excluye. El metano recuperado como biogás se resta y se reporta en Energía Estacionaria.",
          sector: "Residuos",
          scope: {
            within_boundary: "Emisiones de Alcance 1",
            outside_boundary: "Emisiones de Alcance 3",
          },
          approach: {
            type: "IPCC Nivel 1",
            guidance: "GPC v.07",
          },
          features: [
            "Estima CH₄ y N₂O de aguas residuales domésticas e industriales con factores predeterminados Nivel 1",
            "Basado en volumen, población o caudal, carga DBO/COD y sistemas de tratamiento/descarga",
            "Resta el metano recuperado (biogás) y lo reporta en Energía Estacionaria",
            "Compatible con GPC donde no hay datos detallados de monitoreo",
            "Destaca el impacto climático de aguas residuales sin tratar y los beneficios del biogás",
          ],
          limitations: [
            "Depende de proxies y suposiciones cuando faltan datos de plantas reales",
            "Emisiones industriales pueden ser difíciles de estimar sin datos sectoriales",
            "Los factores predeterminados pueden no reflejar la gestión local",
            "El CO₂ biogénico se excluye según el IPCC",
            "Faltan datos de consumo de proteínas, nitrógeno o niveles de DBO/COD",
          ],
          equations: [
            {
              label: "Ecuación 8.9 emisiones de CH₄",
              formula:
                "CH4_emissions = \\sum_{i} [ (\\text{TOW}_i - S_i) \\cdot  \\text{EF}_{i,j} - R_i ]",
            },
            {
              label: "Ecuación adaptada 8.11 Contenido orgánico y factores",
              formula:
                "\\text{TOW}_i = P_i \\cdot \\text{BOD} \\cdot I \\cdot 365;  P_i = P / U_i;   \\text{EF}_{i,j} = B_o \\cdot \\text{MCF}_j \\cdot U_i \\cdot T_{i,j}",
            },
            {
              label: "Ecuación 8.12 emisiones indirectas de N₂O",
              formula:
                "N2O_emissions = [ (P_i \\cdot \\text{Protein} \\cdot F_{NPR} \\cdot F_{NON−CON} \\cdot F_{IND−COM) - \\text{N_\\text{sludge}} ] \\cdot  \\text{EF}_{efluent} \\cdot (44/28)}",
            },
          ],
          parameters: [
            {
              code: "\\text{TOW}_i",
              description:
                "Carga orgánica en aguas residuales por grupo y sistema",
              units: "kg DBO/yr",
            },
            {
              code: "S_i",
              description: "DBO eliminada como lodo",
              units: "kg DBO/yr",
            },
            {
              code: "EF_{i,j}",
              description: "Factor de emisión de CH₄ por grupo y sistema",
              units: "kg CH4/kg DBO",
            },
            {
              code: "R_i",
              description: "Fracción de CH₄ recuperado (biogás)",
              units: "adimensional",
            },
            {
              code: "P_i",
              description: "Población por grupo de ingresos",
              units: "habitantes",
            },
            {
              code: "P",
              description: "Población total de la ciudad",
              units: "habitantes",
            },
            {
              code: "U_i",
              description: "Fracción de utilización por grupo de ingresos",
              units: "adimensional",
            },
            {
              code: "BOD",
              description: "Generación per cápita de DBO",
              units: "g DBO/persona/día",
            },
            {
              code: "I",
              description: "Factor de corrección de DBO industrial (1 o 1.25)",
              units: "adimensional",
            },
            {
              code: "B_o",
              description: "Capacidad máxima de producción de CH₄",
              units: "kg CH4/kg DBO",
            },
            {
              code: "MCF_j",
              description: "Factor de corrección de metano para sistema j",
              units: "adimensional",
            },
            {
              code: "T_{i,j}",
              description: "Ratio de utilización del sistema de tratamiento",
              units: "adimensional",
            },
            {
              code: "Protein",
              description: "Consumo per cápita de proteínas",
              units: "kg/persona/yr",
            },
            {
              code: "F_{NPR}",
              description: "Factor de ajuste de proteínas no consumidas",
              units: "adimensional",
            },
            {
              code: "F_{NON−CON}",
              description: "Fracción de N en proteínas",
              units: "kg N/kg proteína",
            },
            {
              code: "F_{IND−COM}",
              description: "Factor de co-vertido industrial/comercial",
              units: "adimensional",
            },
            {
              code: "N_\\text{sludge}",
              description: "Nitrógeno eliminado con lodos",
              units: "kg N/yr",
            },
            {
              code: "EF_\\text{efluent}",
              description: "Factor de emisión de N₂O-N en efluente",
              units: "kg N2O-N/kg N",
            },
            {
              code: "44/28",
              description: "Conversión N₂O-N → N₂O",
              units: "adimensional",
            },
          ],
        },
        de: {
          methodology: "Abwasserbehandlung und Einleitung",
          overview:
            "Diese Methodik schätzt THG-Emissionen (CH₄ und N₂O) aus der Behandlung und Ableitung von kommunalem und industriellem Abwasser—Kanalwasser und Schlamm—mit einem IPCC Tier 1-Ansatz (GPC v.07). Scope 1 gilt für Behandlung innerhalb der Stadtgrenze, Scope 3 für Behandlung außerhalb. Basierend auf Volumen oder organischer Last (BSB/COD), Behandlungssystem und Standard-Emissionsfaktoren; biogenes CO₂ wird ausgeschlossen. Rückgewonnenes CH₄ (Biogas) wird abgezogen und in Stationäre Energie berichtet.",
          sector: "Abfall",
          scope: {
            within_boundary: "Scope 1-Emissionen",
            outside_boundary: "Scope 3-Emissionen",
          },
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          features: [
            "Schätzt CH₄ und N₂O aus kommunalem und industriellem Abwasser mit Tier 1-Faktoren",
            "Basierend auf Volumen, Bevölkerung oder Durchfluss, BSB/COD und Behandlungssystemen",
            "Zieht rückgewonnenes Methan (Biogas) ab und berichtet es in Stationäre Energie",
            "Kompatibel mit GPC bei fehlenden detaillierten Messdaten",
            "Betont Klimawirkung unbehandelter Abwässer und Vorteile der Biogasnutzung",
          ],
          limitations: [
            "Verwendet Proxy-Annahmen bei fehlenden Anlagendaten",
            "Industrielle Abwasseremissionen schwer abzuschätzen ohne sektorspezifische Daten",
            "Standardfaktoren spiegeln möglicherweise nicht lokale Abläufe wider",
            "Biogenes CO₂ ist gemäß IPCC ausgeschlossen",
            "Datenlücken bei Proteinkonsum, Stickstoffeintrag oder BSB/COD häufig",
          ],
          equations: [
            {
              label: "Gleichung 8.9 CH₄-Emissionen",
              formula:
                "CH4_emissions = \\sum_{i} [ (\\text{TOW}_i - S_i) \\cdot  \\text{EF}_{i,j} - R_i ]",
            },
            {
              label:
                "Angepasste Gleichung 8.11 Organischer Gehalt und Faktoren",
              formula:
                "\\text{TOW}_i = P_i \\cdot \\text{BOD} \\cdot I \\cdot 365;  P_i = P / U_i;   \\text{EF}_{i,j} = B_o \\cdot \\text{MCF}_j \\cdot U_i \\cdot T_{i,j}",
            },
            {
              label: "Gleichung 8.12 indirekte N₂O-Emissionen",
              formula:
                "N2O_emissions = [ (P_i \\cdot \\text{Protein} \\cdot F_{NPR} \\cdot F_{NON−CON} \\cdot F_{IND−COM) - \\text{N_\\text{sludge}} ] \\cdot  \\text{EF}_{efluent} \\cdot (44/28)}",
            },
          ],
          parameters: [
            {
              code: "\\text{TOW}_i",
              description: "Organische Last im Abwasser nach Gruppe und System",
              units: "kg BSB/yr",
            },
            {
              code: "S_i",
              description: "BSB als Schlamm entfernt",
              units: "kg BSB/yr",
            },
            {
              code: "EF_{i,j}",
              description: "CH₄-Emissionsfaktor nach Gruppe und System",
              units: "kg CH4/kg BSB",
            },
            {
              code: "R_i",
              description: "Anteil rückgewonnenes CH₄ (Biogas)",
              units: "dimensionslos",
            },
            {
              code: "P_i",
              description: "Bevölkerung nach Einkommensgruppe",
              units: "Einw.",
            },
            {
              code: "P",
              description: "Gesamtbevölkerung der Stadt",
              units: "Einw.",
            },
            {
              code: "U_i",
              description: "Nutzungsanteil nach Einkommensgruppe",
              units: "dimensionslos",
            },
            {
              code: "BOD",
              description: "BSB-Erzeugung pro Kopf",
              units: "g BSB/Einw./Tag",
            },
            {
              code: "I",
              description: "Industrie-BSB-Korrekturfaktor (1 oder 1,25)",
              units: "dimensionslos",
            },
            {
              code: "B_o",
              description: "Maximale CH₄-Produktionskapazität",
              units: "kg CH4/kg BSB",
            },
            {
              code: "MCF_j",
              description: "Methankorrekturfaktor für System j",
              units: "dimensionslos",
            },
            {
              code: "T_{i,j}",
              description: "Nutzungsverhältnis des Behandlungssystems",
              units: "dimensionslos",
            },
            {
              code: "Protein",
              description: "Proteinkonsum pro Kopf",
              units: "kg/Einw./Jahr",
            },
            {
              code: "F_{NPR}",
              description: "Anpassungsfaktor für nicht konsumiertes Protein",
              units: "dimensionslos",
            },
            {
              code: "F_{NON−CON}",
              description: "Anteil N in Protein",
              units: "kg N/kg Protein",
            },
            {
              code: "F_{IND−COM}",
              description: "Industrie/Handel Mit-Einleitungsfaktor",
              units: "dimensionslos",
            },
            {
              code: "N_\\text{sludge}",
              description: "Mit Schlamm entfernte Stickstoffmenge",
              units: "kg N/yr",
            },
            {
              code: "EF_\\text{efluent}",
              description: "N₂O-N-Emissionsfaktor für Abwasser",
              units: "kg N2O-N/kg N",
            },
            {
              code: "44/28",
              description: "Umrechnungsfaktor N₂O-N → N₂O",
              units: "dimensionslos",
            },
          ],
        },
        pt: {
          methodology: "Tratamento e descarga de águas residuais",
          overview:
            "Esta metodologia estima emissões de GEE (CH₄ e N₂O) do tratamento e disposição de águas residuais domésticas e industriais—esgoto e lodo—usando abordagem IPCC Tier 1 (GPC v.07). Escopo 1 cobre tratamento dentro dos limites municipais, Escopo 3 quando tratado fora. Baseia-se em volume ou carga orgânica (DBO/COD), tipo de sistema e fatores padrão; CO₂ biogênico é excluído. Metano recuperado como biogás é subtraído e reportado em Energia Estacionária.",
          sector: "Resíduos",
          scope: {
            within_boundary: "Emissões do Escopo 1",
            outside_boundary: "Emissões do Escopo 3",
          },
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          features: [
            "Estimativa de CH₄ e N₂O em águas residuais domésticas e industriais com fatores Tier 1",
            "Baseado em volume, população ou vazão, carga DBO/COD e sistemas de tratamento",
            "Subtrai metano recuperado (biogás) e reporta em Energia Estacionária",
            "Compatível com GPC quando faltam dados detalhados de monitoramento",
            "Destaca impacto climático de águas residuais não tratadas e benefícios do biogás",
          ],
          limitations: [
            "Depende de suposições quando faltam dados reais de estações de tratamento",
            "Emissões de águas residuais industriais difíceis de estimar sem dados setoriais",
            "Fatores padrão podem não refletir operações locais",
            "CO₂ biogênico é excluído conforme IPCC",
            "Faltam dados de consumo proteico, descarga de nitrogênio ou níveis de DBO/COD",
          ],
          equations: [
            {
              label: "Eq. 8.9 emissões de CH₄",
              formula:
                "CH4_emissions = \\sum_{i} [ (\\text{TOW}_i - S_i) \\cdot  \\text{EF}_{i,j} - R_i ]",
            },
            {
              label: "Eq. adaptada 8.11 carga orgânica e fatores",
              formula:
                "\\text{TOW}_i = P_i \\cdot \\text{BOD} \\cdot I \\cdot 365;  P_i = P / U_i;   \\text{EF}_{i,j} = B_o \\cdot \\text{MCF}_j \\cdot U_i \\cdot T_{i,j}",
            },
            {
              label: "Eq. 8.12 emissões indiretas de N₂O",
              formula:
                "N2O_emissions = [ (P_i \\cdot \\text{Protein} \\cdot F_{NPR} \\cdot F_{NON−CON} \\cdot F_{IND−COM) - \\text{N_\\text{sludge}} ] \\cdot  \\text{EF}_{efluent} \\cdot (44/28)}",
            },
          ],
          parameters: [
            {
              code: "\\text{TOW}_i",
              description:
                "Carga orgânica nas águas residuais por grupo e sistema",
              units: "kg DBO/yr",
            },
            {
              code: "S_i",
              description: "DBO removida como lodo",
              units: "kg DBO/yr",
            },
            {
              code: "EF_{i,j}",
              description: "Fator de emissão de CH₄ por grupo e sistema",
              units: "kg CH4/kg DBO",
            },
            {
              code: "R_i",
              description: "Fração de CH₄ recuperado (biogás)",
              units: "adimensional",
            },
            {
              code: "P_i",
              description: "População por grupo de renda",
              units: "habitantes",
            },
            {
              code: "P",
              description: "População total da cidade",
              units: "habitantes",
            },
            {
              code: "U_i",
              description: "Fração de utilização por grupo de renda",
              units: "adimensional",
            },
            {
              code: "BOD",
              description: "DBO per capita gerada",
              units: "g DBO/pessoa/dia",
            },
            {
              code: "I",
              description: "Fator de correção de DBO industrial (1 ou 1,25)",
              units: "adimensional",
            },
            {
              code: "B_o",
              description: "Capacidade máxima de produção de CH₄",
              units: "kg CH4/kg DBO",
            },
            {
              code: "MCF_j",
              description: "Fator de correção de metano para sistema j",
              units: "adimensional",
            },
            {
              code: "T_{i,j}",
              description: "Razão de utilização do sistema de tratamento",
              units: "adimensional",
            },
            {
              code: "Protein",
              description: "Consumo per capita de proteína",
              units: "kg/pessoa/ano",
            },
            {
              code: "F_{NPR}",
              description: "Fator de ajuste de proteína não consumida",
              units: "adimensional",
            },
            {
              code: "F_{NON−CON}",
              description: "Fração de N na proteína",
              units: "kg N/kg proteína",
            },
            {
              code: "F_{IND−COM}",
              description: "Fator de co-lançamento industrial/comercial",
              units: "adimensional",
            },
            {
              code: "N_\\text{sludge}",
              description: "Nitrogênio removido com lodo",
              units: "kg N/yr",
            },
            {
              code: "EF_\\text{efluent}",
              description: "Fator de emissão de N₂O-N no efluente",
              units: "kg N2O-N/kg N",
            },
            {
              code: "44/28",
              description: "Fator de conversão N₂O-N → N₂O",
              units: "adimensional",
            },
          ],
        },
        fr: {
          methodology: "Traitement et rejet des eaux usées",
          overview:
            "Cette méthodologie estime les émissions de GES (CH₄ et N₂O) issues du traitement et du rejet des eaux usées domestiques et industrielles—eaux noires et boues—selon l'approche IPCC Tier 1 (GPC v.07). Le Scope 1 couvre le traitement à l'intérieur des limites de la ville, le Scope 3 celui à l'extérieur. Basée sur le volume ou la charge organique (DBO/COD), le type de système et des facteurs d'émission par défaut ; le CO₂ biogénique est exclu. Le méthane récupéré (biogaz) est déduit et déclaré dans Énergie Stationnaire.",
          sector: "Déchets",
          scope: {
            within_boundary: "Émissions du Scope 1",
            outside_boundary: "Émissions du Scope 3",
          },
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          features: [
            "Estime CH₄ et N₂O des eaux usées domestiques et industrielles avec facteurs Tier 1",
            "Basée sur volume, population ou débit, charge DBO/COD et systèmes de traitement",
            "Déduit le méthane récupéré (biogaz) et le déclare en Énergie Stationnaire",
            "Compatible avec le GPC en l'absence de données détaillées",
            "Met en évidence l'impact climatique des eaux usées non traitées et les bénéfices du biogaz",
          ],
          limitations: [
            "Repose sur des hypothèses lorsque les données d'usines manquent",
            "Émissions d'eaux usées industrielles difficiles à estimer sans données sectorielles",
            "Les facteurs par défaut peuvent ne pas refléter les pratiques locales",
            "Le CO₂ biogénique est exclu selon le GIEC",
            "Données manquantes sur consommation de protéines, rejet d'azote ou niveaux DBO/COD",
          ],
          equations: [
            {
              label: "Équation 8.9 émissions de CH₄",
              formula:
                "CH4_emissions = \\sum_{i} [ (\\text{TOW}_i - S_i) \\cdot  \\text{EF}_{i,j} - R_i ]",
            },
            {
              label: "Équation adaptée 8.11 charge organique et facteurs",
              formula:
                "\\text{TOW}_i = P_i \\cdot \\text{BOD} \\cdot I \\cdot 365;  P_i = P / U_i;   \\text{EF}_{i,j} = B_o \\cdot \\text{MCF}_j \\cdot U_i \\cdot T_{i,j}",
            },
            {
              label: "Équation 8.12 émissions indirectes de N₂O",
              formula:
                "N2O_emissions = [ (P_i \\cdot \\text{Protein} \\cdot F_{NPR} \\cdot F_{NON−CON} \\cdot F_{IND−COM) - \\text{N_\\text{sludge}} ] \\cdot  \\text{EF}_{efluent} \\cdot (44/28)}",
            },
          ],
          parameters: [
            {
              code: "\\text{TOW}_i",
              description:
                "Charge organique des eaux usées par groupe et système",
              units: "kg DBO/yr",
            },
            {
              code: "S_i",
              description: "DBO éliminée en boues",
              units: "kg DBO/yr",
            },
            {
              code: "EF_{i,j}",
              description: "Facteur d'émission CH₄ par groupe et système",
              units: "kg CH4/kg DBO",
            },
            {
              code: "R_i",
              description: "Fraction de CH₄ récupéré (biogaz)",
              units: "sans unité",
            },
            {
              code: "P_i",
              description: "Population par groupe de revenu",
              units: "habitants",
            },
            {
              code: "P",
              description: "Population totale de la ville",
              units: "habitants",
            },
            {
              code: "U_i",
              description: "Taux d'utilisation par groupe de revenu",
              units: "sans unité",
            },
            {
              code: "BOD",
              description: "Production de DBO par habitant",
              units: "g DBO/habitant/jour",
            },
            {
              code: "I",
              description: "Facteur de correction DBO industriel (1 ou 1,25)",
              units: "sans unité",
            },
            {
              code: "B_o",
              description: "Capacité maximale de production de CH₄",
              units: "kg CH4/kg DBO",
            },
            {
              code: "MCF_j",
              description: "Facteur de correction méthane pour système j",
              units: "sans unité",
            },
            {
              code: "T_{i,j}",
              description: "Taux d'utilisation du système de traitement",
              units: "sans unité",
            },
            {
              code: "Protein",
              description: "Consommation de protéines par habitant",
              units: "kg/habitant/yr",
            },
            {
              code: "F_{NPR}",
              description: "Facteur d'ajustement des protéines non consommées",
              units: "sans unité",
            },
            {
              code: "F_{NON−CON}",
              description: "Fraction de N dans la protéine",
              units: "kg N/kg protéine",
            },
            {
              code: "F_{IND−COM}",
              description: "Facteur de co-décharge industriel/commercial",
              units: "sans unité",
            },
            {
              code: "N_\\text{sludge}",
              description: "Azote éliminé avec les boues",
              units: "kg N/yr",
            },
            {
              code: "EF_\\text{efluent}",
              description: "Facteur d'émission N₂O-N dans l'effluent",
              units: "kg N2O-N/kg N",
            },
            {
              code: "44/28",
              description: "Conversion N₂O-N → N₂O",
              units: "sans unité",
            },
          ],
        },
      },
    },
  ],
};
