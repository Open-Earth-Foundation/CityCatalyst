import { MethodologyBySector } from "./types";

export const STATIONARY_ENERGY: MethodologyBySector = {
  sector: "stationary-energy",
  sector_roman_numeral: "I",
  methodologies: [
    {
      id: "fuel-consumption",
      translations: {
        en: {
          methodology: "Fuel Consumption",
          sector: "Stationary Energy",
          overview:
            "Estimates greenhouse gas (GHG) emissions from stationary energy use by calculating emissions based on the amount of fuel consumed in buildings, industries, and other fixed facilities within the city boundary. This method directly links fuel use in equipment and operations to emissions from combustion, and is commonly used to estimate Scope 1 emissions in the Stationary Energy sector.",
          scope: "Scope 1 emissions",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Fuel consumption data disaggregated by type and subsector (residential, commercial, industrial, etc.)",
          ],
          assumptions: [
            "All reported fuel is combusted within the city boundary in stationary sources (buildings, industries, facilities).",
            "Emissions occur at the point of fuel combustion, not at the point of fuel purchase or storage.",
            "Fuel is used for energy purposes, not as a feedstock in industrial processes (those emissions fall under the IPPU sector).",
            "Emission factors are representative of the fuel type and combustion technology; if local factors are unavailable, IPCC defaults are applied.",
            "Combustion is complete or follows typical efficiency levels (no major methane slip unless specifically accounted for).",
          ],
          advantages: [
            "Direct and accurate—based on actual fuel use, not proxies.",
            "Sector-specific—emissions can be broken down by subsector.",
            "Aligned with national inventory methodologies and GPC guidance.",
            "Supports energy transition planning and fuel-switching scenarios.",
          ],
          limitations: [
            "Requires access to detailed fuel consumption data, which may not always be available at the city level.",
            "If data is not disaggregated by subsector, assumptions must be made about distribution.",
          ],
          equation: {
            label: "Adapted Eq. 5.1",
            formula:
              "\\text{emissions}_\\text{total}=\\sum_{i,j}(\\text{fuel consumed}_\\text{i}*\\text{emission factor}_\\text{i,j})",
          },
          parameters: [
            {
              code: "\\text{fuel consumed}_i",
              description:
                "Quantity of fuel consumed by fuel type (gasoline, diesel, LPG, etc.)",
              units: ["m³", "kg"],
            },
            {
              code: "\\text{emission factors}_{i,j}",
              description:
                "Amount of GHG emitted per unit of fuel combusted (includes CO₂, CH₄, N₂O)",
              units: ["tonnes gas/m³ of fuel", "tonnes gas/kg of fuel"],
            },
          ],
        },
        es: {
          methodology: "Consumo de combustible",
          overview:
            "Estimaciones de las emisiones de gases de efecto invernadero (GEI) procedentes del uso de energía estacionaria mediante el cálculo de las emisiones con base en la cantidad de combustible consumido en edificios, industrias y otras instalaciones fijas dentro de los límites de la ciudad. Este método vincula directamente el uso de combustible en equipos y operaciones con las emisiones por combustión y se utiliza comúnmente para estimar las emisiones de Alcance 1 en el sector de Energía Estacionaria.",
          sector: "Energía estacionaria",
          scope: "Emisiones de Alcance 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Datos de consumo de combustible desagregados por tipo y subsector (residencial, comercial, industrial, etc.)",
          ],
          assumptions: [
            "Todo el combustible reportado se quema dentro de los límites de la ciudad en fuentes estacionarias (edificios, industrias, instalaciones).",
            "Las emisiones ocurren en el punto de combustión del combustible, no en el punto de compra o almacenamiento.",
            "El combustible se utiliza con fines energéticos, no como materia prima en procesos industriales (esas emisiones corresponden al sector IPPU).",
            "Los factores de emisión son representativos del tipo de combustible y la tecnología de combustión; si no hay factores locales disponibles, se aplican los valores predeterminados del IPCC.",
            "La combustión es completa o sigue niveles de eficiencia típicos (sin fugas importantes de metano a menos que se contabilicen específicamente).",
          ],
          advantages: [
            "Directo y preciso: basado en el uso real de combustible, no en proxies.",
            "Específico por sector: las emisiones se pueden desglosar por subsector.",
            "Alineado con las metodologías de inventario nacional y la guía del GPC.",
            "Soporta la planificación de la transición energética y escenarios de cambio de combustible.",
          ],
          limitations: [
            "Requiere acceso a datos detallados de consumo de combustible, que pueden no estar disponibles a nivel de ciudad.",
            "Si los datos no están desagregados por subsector, se deben hacer suposiciones sobre su distribución.",
          ],
          equation: {
            label: "Ecuación adaptada 5.1",
            formula:
              "\\text{emissions}_\\text{total}=\\sum_{i,j}(\\text{fuel consumed}_\\text{i}*\\text{emission factor}_\\text{i,j})",
          },
          parameters: [
            {
              code: "\\text{fuel consumed}_i",
              description:
                "Cantidad de combustible consumido por tipo (gasolina, diésel, GLP, etc.)",
              units: ["m³", "kg"],
            },
            {
              code: "\\text{emission factors}_{i,j}",
              description:
                "Cantidad de GEI emitidos por unidad de combustible quemado (incluye CO₂, CH₄, N₂O)",
              units: ["tonnes gas/m³ of fuel", "tonnes gas/kg of fuel"],
            },
          ],
        },
        de: {
          methodology: "Kraftstoffverbrauch",
          overview:
            "Schätzt die Treibhausgas (THG)-Emissionen durch stationäre Energienutzung, indem die Emissionen anhand der im Stadtgebiet in Gebäuden, Industrieanlagen und anderen festen Einrichtungen verbrauchten Kraftstoffmenge berechnet werden. Diese Methode verknüpft den Kraftstoffverbrauch in Geräten und Abläufen direkt mit den Emissionen aus der Verbrennung und wird häufig zur Schätzung der Scope-1-Emissionen im Sektor Stationäre Energie verwendet.",
          sector: "Stationäre Energie",
          scope: "Scope-1-Emissionen",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Daten zum Kraftstoffverbrauch, aufgeschlüsselt nach Typ und Teilsektor (Wohnbereich, Gewerbe, Industrie, etc.)",
          ],
          assumptions: [
            "Alle gemeldeten Kraftstoffe werden innerhalb der Stadtgrenzen in stationären Quellen (Gebäude, Industrieanlagen, Einrichtungen) verbrannt.",
            "Die Emissionen treten am Ort der Kraftstoffverbrennung auf, nicht am Ort des Kaufs oder der Lagerung.",
            "Der Kraftstoff wird zu Energiezwecken verwendet, nicht als Rohstoff in Industrieprozessen (diese Emissionen fallen in den IPPU-Sektor).",
            "Emissionsfaktoren sind repräsentativ für den Kraftstofftyp und die Verbrennungstechnologie; wenn lokale Faktoren nicht verfügbar sind, werden IPCC-Standardwerte verwendet.",
            "Die Verbrennung ist vollständig oder erfolgt gemäß typischer Wirkungsgrade (kein erheblicher Methanschlupf, es sei denn, er wird speziell berücksichtigt).",
          ],
          advantages: [
            "Direkt und genau – basierend auf dem tatsächlichen Kraftstoffverbrauch, nicht auf Indikatoren.",
            "Branchenspezifisch – Emissionen können nach Teilsektor aufgeschlüsselt werden.",
            "Abgestimmt auf nationale Inventarmethoden und GPC-Richtlinien.",
            "Unterstützt die Planung des Energiewandels und Szenarien für den Kraftstoffwechsel.",
          ],
          limitations: [
            "Erfordert Zugriff auf detaillierte Daten zum Kraftstoffverbrauch, die auf Stadtebene nicht immer verfügbar sind.",
            "Wenn Daten nicht nach Teilsektor aufgeschlüsselt sind, müssen Annahmen zur Verteilung getroffen werden.",
          ],
          equation: {
            label: "Angepasste Gleichung 5.1",
            formula:
              "\\text{emissions}_\\text{total}=\\sum_{i,j}(\\text{fuel consumed}_\\text{i}*\\text{emission factor}_\\text{i,j})",
          },
          parameters: [
            {
              code: "\\text{fuel consumed}_i",
              description:
                "Menge des verbrauchten Kraftstoffs nach Typ (Benzin, Diesel, LPG, etc.)",
              units: ["m³", "kg"],
            },
            {
              code: "\\text{emission factors}_{i,j}",
              description:
                "Menge der freigesetzten THG pro Einheit verbrannten Kraftstoffs (einschließlich CO₂, CH₄, N₂O)",
              units: ["tonnes gas/m³ of fuel", "tonnes gas/kg of fuel"],
            },
          ],
        },
        pt: {
          methodology: "Consumo de combustível",
          overview:
            "Estima as emissões de gases de efeito estufa (GEE) do uso de energia estacionária calculando as emissões com base na quantidade de combustível consumido em edifícios, indústrias e outras instalações fixas dentro dos limites da cidade. Este método vincula diretamente o uso de combustível em equipamentos e operações às emissões provenientes da combustão e é comumente usado para estimar as emissões do Escopo 1 no setor de Energia Estacionária.",
          sector: "Energia estacionária",
          scope: "Emissões do Escopo 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Dados de consumo de combustível desagregados por tipo e subsetor (residencial, comercial, industrial, etc.)",
          ],
          assumptions: [
            "Todo o combustível reportado é queimado dentro dos limites da cidade em fontes estacionárias (edifícios, indústrias, instalações).",
            "As emissões ocorrem no ponto de combustão do combustível, não no ponto de compra ou armazenamento.",
            "O combustível é usado para fins energéticos, não como matéria-prima em processos industriais (essas emissões pertencem ao setor IPPU).",
            "Os fatores de emissão são representativos do tipo de combustível e da tecnologia de combustão; se fatores locais não estiverem disponíveis, aplicam-se os valores padrão do IPCC.",
            "A combustão é completa ou segue níveis de eficiência típicos (sem grandes fugas de metano, a menos que contabilizadas especificamente).",
          ],
          advantages: [
            "Direto e preciso—baseado no uso real de combustível, não em proxies.",
            "Específico por setor—as emissões podem ser detalhadas por subsetor.",
            "Alinhado com metodologias de inventário nacionais e orientações do GPC.",
            "Suporta o planejamento da transição energética e cenários de substituição de combustível.",
          ],
          limitations: [
            "Exige acesso a dados detalhados de consumo de combustível, que podem não estar disponíveis a nível municipal.",
            "Se os dados não estiverem desagregados por subsetor, devem ser feitas suposições sobre a distribuição.",
          ],
          equation: {
            label: "Equação adaptada 5.1",
            formula:
              "\\text{emissions}_\\text{total}=\\sum_{i,j}(\\text{fuel consumed}_\\text{i}*\\text{emission factor}_\\text{i,j})",
          },
          parameters: [
            {
              code: "\\text{fuel consumed}_i",
              description:
                "Quantidade de combustível consumido por tipo (gasolina, diesel, GLP, etc.)",
              units: ["m³", "kg"],
            },
            {
              code: "\\text{emission factors}_{i,j}",
              description:
                "Quantidade de GEE emitida por unidade de combustível queimado (inclui CO₂, CH₄, N₂O)",
              units: ["tonnes gas/m³ of fuel", "tonnes gas/kg of fuel"],
            },
          ],
        },
        fr: {
          methodology: "Consommation de carburant",
          overview:
            "Estime les émissions de gaz à effet de serre (GES) liées à l'utilisation d'énergie stationnaire en calculant les émissions en fonction de la quantité de combustible consommée dans les bâtiments, les industries et autres installations fixes à l'intérieur des limites de la ville. Cette méthode relie directement l'utilisation du carburant dans les équipements et les opérations aux émissions issues de la combustion et est couramment utilisée pour estimer les émissions du Scope 1 dans le secteur de l'énergie stationnaire.",
          sector: "Énergie stationnaire",
          scope: "Émissions du Scope 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Données de consommation de carburant ventilées par type et sous-secteur (résidentiel, commercial, industriel, etc.)",
          ],
          assumptions: [
            "Tout le combustible déclaré est brûlé à l'intérieur des limites de la ville dans des sources stationnaires (bâtiments, industries, installations).",
            "Les émissions se produisent au point de combustion du combustible, et non au point d'achat ou de stockage.",
            "Le combustible est utilisé à des fins énergétiques, et non comme matière première dans les processus industriels (ces émissions relèvent du secteur IPPU).",
            "Les facteurs d'émission sont représentatifs du type de combustible et de la technologie de combustion ; si des facteurs locaux ne sont pas disponibles, les valeurs par défaut du GIEC sont appliquées.",
            "La combustion est complète ou suit les niveaux d'efficacité typiques (sans fuite majeure de méthane, sauf si elle est spécifiquement prise en compte).",
          ],
          advantages: [
            "Direct et précis – basé sur l'utilisation réelle de carburant, pas sur des proxys.",
            "Spécifique au secteur – les émissions peuvent être ventilées par sous-secteur.",
            "Aligné sur les méthodologies d'inventaire national et les directives du GPC.",
            "Soutient la planification de la transition énergétique et les scénarios de changement de carburant.",
          ],
          limitations: [
            "Nécessite l'accès à des données détaillées sur la consommation de carburant, qui peuvent ne pas être disponibles au niveau de la ville.",
            "Si les données ne sont pas ventilées par sous-secteur, des hypothèses doivent être faites sur leur répartition.",
          ],
          equation: {
            label: "Équation adaptée 5.1",
            formula:
              "\\text{emissions}_\\text{total}=\\sum_{i,j}(\\text{fuel consumed}_\\text{i}*\\text{emission factor}_\\text{i,j})",
          },
          parameters: [
            {
              code: "\\text{fuel consumed}_i",
              description:
                "Quantité de carburant consommé par type (essence, diesel, GPL, etc.)",
              units: ["m³", "kg"],
            },
            {
              code: "\\text{emission factors}_{i,j}",
              description:
                "Quantité de GES émise par unité de carburant combusté (inclut CO₂, CH₄, N₂O)",
              units: ["tonnes gas/m³ of fuel", "tonnes gas/kg of fuel"],
            },
          ],
        },
      },
    },
  ],
};
