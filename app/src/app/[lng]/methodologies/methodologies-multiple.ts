import { MethodologyBySector } from "./types";

export const MULTIPLE: MethodologyBySector = {
  sector: "multiple",
  methodologies: [
    {
      id: "direct-emission-entry",
      translations: {
        en: {
          methodology: "Direct Emission Entry",
          overview:
            "Enables reporting of measured or previously estimated GHG emissions (CO₂, CH₄, N₂O) without requiring activity data or emission factors. Useful when emissions are audited or disclosed elsewhere and need only be recorded in the inventory. Fully compatible with GPC v.07's allowance for direct data entry.",
          features: [
            "Report verified emissions values in mass units (e.g., tonnes) directly",
            "No conversion or underlying activity data required",
            "Compatible with diverse data sources (audits, utility reports, corporate disclosures, third-party tools)",
            "Prevents the need to reconstruct detailed calculations when data is proprietary or unavailable",
          ],
          advantages: [
            "Saves time for stakeholders with existing emissions totals",
            "Increases flexibility by integrating multiple reporting systems",
            "Fills data gaps when upstream activity drivers cannot be accessed",
            "Eliminates uncertainty in factor-based estimation when reliable measurements exist",
          ],
          limitations: [
            "No validation or recalculation possible without activity data",
            "Reduced transparency and traceability across sectors and years",
            "Hinders strategy development when underlying drivers are unknown",
            "Risk of double counting if not carefully coordinated with other methods",
          ],
          guidance: "GPC v.07 (IPCC Tier 1 direct data allowance)",
        },
        es: {
          methodology: "Entrada Directa de Emisiones",
          overview:
            "Permite reportar emisiones de GEI (CO₂, CH₄, N₂O) ya medidas o estimadas previamente sin requerir datos de actividad ni factores de emisión. Útil cuando las emisiones han sido auditadas o divulgadas externamente y solo necesitan registrarse en el inventario. Totalmente compatible con la GPC v.07.",
          features: [
            "Registro directo de valores de emisiones verificadas en unidades de masa (p. ej., toneladas)",
            "No requiere conversión ni datos de actividad subyacentes",
            "Compatible con diversas fuentes (auditorías, informes de servicios, reportes corporativos, herramientas de terceros)",
            "Evita reconstruir cálculos detallados cuando los datos son propietarios o no están disponibles",
          ],
          advantages: [
            "Ahorra tiempo a las partes con totales de emisiones ya existentes",
            "Incrementa la flexibilidad al integrar múltiples sistemas de reporte",
            "Cubre vacíos de datos cuando no es posible acceder a los impulsores de actividad",
            "Elimina incertidumbre en estimaciones basadas en factores cuando existen mediciones fiables",
          ],
          limitations: [
            "No permite validación ni recálculo sin datos de actividad",
            "Menor transparencia y trazabilidad entre sectores y años",
            "Dificulta el diseño de estrategias si no se conocen los impulsores subyacentes",
            "Riesgo de doble conteo si no se coordina con otros métodos",
          ],
          guidance: "GPC v.07 (permite ingreso directo de datos)",
        },
        de: {
          methodology: "Direkte Emissionseingabe",
          overview:
            "Ermöglicht das Reporting von gemessenen oder zuvor geschätzten THG-Emissionen (CO₂, CH₄, N₂O) ohne Aktivitätsdaten oder Emissionsfaktoren. Nützlich, wenn Emissionen bereits auditiert oder offengelegt wurden und nur ins Inventar übernommen werden müssen. Vollständig kompatibel mit GPC v.07.",
          features: [
            "Direkte Erfassung verifizierter Emissionswerte in Masseeinheiten (z. B. Tonnen)",
            "Keine Umrechnung oder zugrundeliegenden Aktivitätsdaten nötig",
            "Kompatibel mit verschiedenen Datenquellen (Audits, Versorgungsberichte, Unternehmensangaben, Dritt-Tools)",
            "Vermeidet detaillierte Nachkalkulationen, wenn Daten proprietär oder nicht verfügbar sind",
          ],
          advantages: [
            "Spart Zeit für Akteure mit bereits vorliegenden Emissionssummen",
            "Erhöht Flexibilität durch Integration mehrerer Berichtssysteme",
            "Schließt Datenlücken, wenn Aktivitätstreiber nicht zugänglich sind",
            "Eliminiert Unsicherheit bei faktor-basierten Schätzungen, wenn verlässliche Messungen vorliegen",
          ],
          limitations: [
            "Keine Validierung oder Neuberechnung ohne Aktivitätsdaten möglich",
            "Geringere Transparenz und Rückverfolgbarkeit zwischen Sektoren und Jahren",
            "Erschwert Strategieentwicklung, wenn zugrundeliegende Treiber unbekannt sind",
            "Risiko doppelter Erfassung, wenn nicht mit anderen Methoden koordiniert",
          ],
          guidance: "GPC v.07 (Erlaubnis für direkte Dateneingabe)",
        },
        pt: {
          methodology: "Lançamento Direto de Emissões",
          overview:
            "Permite reportar emissões de GEE (CO₂, CH₄, N₂O) já medidas ou estimadas previamente sem exigir dados de atividade ou fatores de emissão. Útil quando emissões já foram auditadas ou divulgadas e precisam apenas ser registradas no inventário. Totalmente compatível com a GPC v.07.",
          features: [
            "Registro direto de valores verificados de emissões em unidades de massa (ex.: toneladas)",
            "Não requer conversão nem dados de atividade subjacentes",
            "Compatível com múltiplas fontes de dados (auditorias, relatórios de serviços, divulgação corporativa, ferramentas de terceiros)",
            "Evita refazer cálculos detalhados quando dados são proprietários ou indisponíveis",
          ],
          advantages: [
            "Economiza tempo para partes que já dispõem dos totais de emissões",
            "Aumenta a flexibilidade ao integrar diversos sistemas de reporte",
            "Preenche lacunas de dados quando não é possível acessar os motores de atividade",
            "Elimina incertezas em estimativas baseadas em fatores quando há medições confiáveis",
          ],
          limitations: [
            "Não permite validação ou recálculo sem dados de atividade",
            "Menor transparência e rastreabilidade entre setores e anos",
            "Dificulta o desenvolvimento de estratégias sem conhecer os fatores subjacentes",
            "Risco de dupla contagem se não for coordenado com outros métodos",
          ],
          guidance: "GPC v.07 (permite entrada direta de dados)",
        },
        fr: {
          methodology: "Saisie Directe des Émissions",
          overview:
            "Permet de déclarer des émissions de GES (CO₂, CH₄, N₂O) mesurées ou estimées précédemment sans nécessiter de données d'activité ni de facteurs d'émission. Utile lorsque les émissions ont déjà été auditées ou divulguées et doivent simplement être inscrites dans l'inventaire. Entièrement compatible avec la GPC v.07.",
          features: [
            "Enregistrement direct de valeurs d'émissions vérifiées en unités de masse (ex. tonnes)",
            "Aucune conversion ni données d'activité sous-jacentes requises",
            "Compatible avec diverses sources (audits, rapports de services, déclarations d'entreprises, outils tiers)",
            "Évite de reconstituer des calculs détaillés lorsque les données sont propriétaires ou indisponibles",
          ],
          advantages: [
            "Gain de temps pour les parties disposant déjà des totaux d'émissions",
            "Flexibilité accrue grâce à l'intégration de plusieurs systèmes de reporting",
            "Comble les lacunes de données lorsque les facteurs d'activité ne sont pas accessibles",
            "Élimine l'incertitude des estimations basées sur des facteurs lorsqu'il existe des mesures fiables",
          ],
          limitations: [
            "Pas de validation ni de recalcul possible sans données d'activité",
            "Transparence et traçabilité réduites entre secteurs et années",
            "Difficulté à élaborer des stratégies si les facteurs sous-jacents sont inconnus",
            "Risque de double comptage si non coordonné avec d'autres méthodes",
          ],
          guidance: "GPC v.07 (autorisation de saisie directe de données)",
        },
      },
    },
    {
      id: "energy-consumption",
      translations: {
        en: {
          methodology: "Grid Electricity Consumption",
          overview:
            "Estimates greenhouse gas (GHG) emissions (Scope 2) from electricity purchased from the grid by households, businesses, industries, transport systems (e.g., electric trains, buses, trams, EV charging) and other facilities within the city boundary. Emissions are attributed to the city though they occur at the power generation source.",
          sector: "Stationary Energy",
          scope: "Scope 2 emissions",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Electricity consumption data by subsector (residential, commercial, industrial, transport).",
            "Grid emission factor (national, regional, or utility-specific).",
          ],
          assumptions: [
            "All reported electricity is consumed within the city boundary during the reporting year.",
            "The grid emission factor reflects the average GHG intensity of the electricity mix.",
            "No self-generated or exported electricity is included.",
          ],
          advantages: [
            "Easy to apply when utility or national consumption data are available.",
            "Enables cities to monitor and manage the climate impact of grid electricity use.",
            "Supports disaggregation by subsector for targeted energy efficiency policies.",
            "Fully compatible with Tier 1 and GPC Scope 2 reporting.",
          ],
          limitations: [
            "Requires an accurate and up-to-date grid emission factor.",
            "May not reflect the exact generation mix for every consumer in an interconnected grid.",
            "Emission factor may vary over time as the grid decarbonizes.",
          ],
          equation: {
            label: "Adapted Eq. 5.1",
            formula:
              "\\text{emissions}_{\\text{total}} = \\sum_{i,j}(\\text{fuel}_{\\text{consumed}_i} \\cdot \\text{EF}_{i,j})",
          },
          parameters: [
            {
              code: "\\text{energy consumed}_i",
              description:
                "Amount of electricity consumed in the city by subsector",
              units: ["kWh"],
            },
            {
              code: "\\text{EF}_{i,j}",
              description:
                "GHG emissions per unit of electricity supplied (based on electricity mix)",
              units: ["kg gas/kWh"],
            },
          ],
        },
        es: {
          methodology: "Consumo de electricidad de la red",
          overview:
            "Estima las emisiones de gases de efecto invernadero (GEI) (Alcance 2) de la electricidad comprada a la red por hogares, empresas, industrias, sistemas de transporte (tren eléctrico, autobuses, tranvías, carga de VE) y otras instalaciones dentro de los límites de la ciudad. Las emisiones se atribuyen a la ciudad aunque ocurran en la fuente de generación.",
          sector: "Energía estacionaria",
          scope: "Emisiones de Alcance 2",
          approach: {
            type: "IPCC Nivel 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Datos de consumo de electricidad por subsector (residencial, comercial, industrial, transporte).",
            "Factor de emisión de la red (nacional, regional o por compañía eléctrica).",
          ],
          assumptions: [
            "Toda la electricidad reportada se consume dentro de los límites de la ciudad durante el año de informe.",
            "El factor de emisión de la red refleja la intensidad media de GEI de la mezcla eléctrica.",
            "No se incluyen electricidad autoproducida ni exportada.",
          ],
          advantages: [
            "Fácil de aplicar con datos de consumo de la compañía eléctrica o fuentes nacionales.",
            "Permite a las ciudades monitorear y gestionar el impacto climático del uso de electricidad de la red.",
            "Soporta desagregación por subsector para políticas de eficiencia energética.",
            "Totalmente compatible con el Nivel 1 y el informe de Alcance 2 del GPC.",
          ],
          limitations: [
            "Requiere un factor de emisión de la red preciso y actualizado.",
            "Puede no reflejar la mezcla exacta de generación para cada consumidor en una red interconectada.",
            "El factor de emisión puede cambiar con el tiempo a medida que la red se descarboniza.",
          ],
          equation: {
            label: "Ecuación adaptada 5.1",
            formula:
              "\\text{emissions}_{\\text{total}} = \\sum_{i,j}(\\text{fuel}_{\\text{consumed}_i} \\cdot \\text{EF}_{i,j})",
          },
          parameters: [
            {
              code: "\\text{energy consumed}_i",
              description:
                "Cantidad de electricidad consumida en la ciudad por subsector",
              units: ["kWh"],
            },
            {
              code: "\\text{EF}_{i,j}",
              description:
                "Emisiones de GEI por unidad de electricidad suministrada (basado en la mezcla)",
              units: ["kg gas/kWh"],
            },
          ],
        },
        de: {
          methodology: "Netzstromverbrauch",
          overview:
            "Schätzt Treibhausgasemissionen (THG) (Scope 2) der aus dem Netz bezogenen Elektrizität, die von Haushalten, Unternehmen, Industrie, Transportsystemen (z. B. Elektrozüge, Busse, Straßenbahnen, E-Ladesäulen) und weiteren Einrichtungen innerhalb der Stadtgrenze verbraucht wird. Die Emissionen werden der Stadt zugeschrieben, obwohl sie an der Erzeugungsquelle entstehen.",
          sector: "Stationäre Energie",
          scope: "Scope 2-Emissionen",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Stromverbrauchsdaten nach Teilsektor (Wohnen, Gewerbe, Industrie, Verkehr).",
            "Netz-Emissionsfaktor (national, regional oder versorgungsspezifisch).",
          ],
          assumptions: [
            "Der gemeldete Stromverbrauch erfolgte innerhalb der Stadtgrenze im Berichtsjahr.",
            "Der Netz-Emissionsfaktor bildet die durchschnittliche THG-Intensität der Stromerzeugung ab.",
            "Eigen- oder Exportstrom ist nicht enthalten.",
          ],
          advantages: [
            "Einfach anwendbar bei Vorliegen von Versorger- oder nationalen Verbrauchsdaten.",
            "Ermöglicht Städten, den Klimaeinfluss des Netzstromverbrauchs zu überwachen und zu steuern.",
            "Unterstützt Teilsektordisaggregation für gezielte Energieeffizienzmaßnahmen.",
            "Voll kompatibel mit Tier 1 und GPC Scope 2-Berichterstattung.",
          ],
          limitations: [
            "Benötigt einen genauen und aktuellen Netz-Emissionsfaktor.",
            "Spiegelt möglicherweise nicht die tatsächliche Erzeugungsmischung für jeden Verbraucher wider.",
            "Der Emissionsfaktor kann sich mit der Dekarbonisierung des Netzes ändern.",
          ],
          equation: {
            label: "Angepasste Gleichung 5.1",
            formula:
              "\\text{emissions}_{\\text{total}} = \\sum_{i,j}(\\text{fuel}_{\\text{consumed}_i} \\cdot \\text{EF}_{i,j})",
          },
          parameters: [
            {
              code: "\\text{energy consumed}_i",
              description:
                "Menge des in der Stadt verbrauchten Stroms nach Teilsektor",
              units: ["kWh"],
            },
            {
              code: "\\text{EF}_{i,j}",
              description:
                "THG-Emissionen pro Einheit gelieferten Stroms (basierend auf der Mischungsintensität)",
              units: ["kg Gas/kWh"],
            },
          ],
        },
        pt: {
          methodology: "Consumo de eletricidade da rede",
          overview:
            "Estima emissões de gases de efeito estufa (GEE) (Escopo 2) da eletricidade comprada na rede por residências, empresas, indústrias, sistemas de transporte (trens elétricos, ônibus, bondes, carregamento de VE) e outras instalações dentro do limite da cidade. As emissões são atribuídas à cidade, embora ocorram na fonte de geração.",
          sector: "Energia estacionária",
          scope: "Emissões do Escopo 2",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Dados de consumo de eletricidade por subsetor (residencial, comercial, industrial, transporte).",
            "Fator de emissão da rede (nacional, regional ou por distribuidora).",
          ],
          assumptions: [
            "Toda eletricidade reportada é consumida dentro dos limites da cidade no ano de relatório.",
            "O fator de emissão da rede reflete a intensidade média de GEE da matriz elétrica.",
            "Não inclui eletricidade autogerada ou exportada.",
          ],
          advantages: [
            "Fácil aplicação quando há dados de consumo de utilitárias ou fontes nacionais.",
            "Permite às cidades monitorar e gerir o impacto climático do uso de eletricidade da rede.",
            "Suporta desagregação por subsetor para políticas de eficiência energética.",
            "Totalmente compatível com Tier 1 e relatórios de Escopo 2 do GPC.",
          ],
          limitations: [
            "Requer fator de emissão da rede preciso e atualizado.",
            "Pode não refletir a matriz exata para cada consumidor em uma rede interconectada.",
            "O fator de emissão pode variar com o tempo conforme a rede se descarboniza.",
          ],
          equation: {
            label: "Equação adaptada 5.1",
            formula:
              "\\text{emissions}_{\\text{total}} = \\sum_{i,j}(\\text{fuel}_{\\text{consumed}_i} \\cdot \\text{EF}_{i,j})",
          },
          parameters: [
            {
              code: "\\text{energy consumed}_i",
              description:
                "Quantidade de eletricidade consumida na cidade por subsetor",
              units: ["kWh"],
            },
            {
              code: "\\text{EF}_{i,j}",
              description:
                "Emissões de GEE por unidade de eletricidade fornecida (baseado na matriz)",
              units: ["kg gás/kWh"],
            },
          ],
        },
        fr: {
          methodology: "Consommation d'électricité du réseau",
          overview:
            "Estime les émissions de gaz à effet de serre (GES) (Scope 2) de l'électricité achetée sur le réseau par les ménages, entreprises, industries, systèmes de transport (trains électriques, bus, tramways, recharge VE) et autres infrastructures dans les limites de la ville. Les émissions sont attribuées à la ville, bien qu'elles se produisent à la source de production.",
          sector: "Énergie stationnaire",
          scope: "Émissions du Scope 2",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Données de consommation d'électricité par sous-secteur (résidentiel, commercial, industriel, transport).",
            "Facteur d'émission du réseau (national, régional ou fournisseur).",
          ],
          assumptions: [
            "Toute l'électricité déclarée est consommée dans les limites de la ville durant l'année de référence.",
            "Le facteur d'émission du réseau reflète l'intensité moyenne de GES du mix électrique.",
            "N'inclut pas l'électricité autoproduite ou exportée.",
          ],
          advantages: [
            "Facile à appliquer lorsqu'on dispose de données de consommation de l'opérateur ou nationales.",
            "Permet aux villes de suivre et gérer l'impact climatique de l'électricité du réseau.",
            "Supporte la ventilation par sous-secteur pour des politiques d'efficacité énergétique.",
            "Entièrement compatible avec Tier 1 et le reporting Scope 2 du GPC.",
          ],
          limitations: [
            "Nécessite un facteur d'émission du réseau précis et à jour.",
            "Peut ne pas refléter le mix exact pour chaque consommateur dans un réseau interconnecté.",
            "Le facteur d'émission peut évoluer avec la décarbonation du réseau.",
          ],
          equation: {
            label: "Équation adaptée 5.1",
            formula:
              "\\text{emissions}_{\\text{total}} = \\sum_{i,j}(\\text{fuel}_{\\text{consumed}_i} \\cdot \\text{EF}_{i,j})",
          },
          parameters: [
            {
              code: "\\text{energy consumed}_i",
              description:
                "Quantité d'électricité consommée dans la ville par sous-secteur",
              units: ["kWh"],
            },
            {
              code: "\\text{EF}_{i,j}",
              description:
                "Émissions de GES par unité d'électricité fournie (basé sur le mix)",
              units: ["kg gaz/kWh"],
            },
          ],
        },
      },
    },
  ],
};
