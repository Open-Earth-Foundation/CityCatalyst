import { MethodologyBySector } from "./types";

export const TRANSPORT: MethodologyBySector = {
  sector: "transportation",
  sector_roman_numeral: "II",
  methodologies: [
    {
      id: "fuel-sales",
      translations: {
        en: {
          methodology: "Fuel Sales",
          overview:
            "The Fuel Sales methodology estimates greenhouse gas (GHG) emissions from transportation based on the total volume of fuel sold within the city boundary during the reporting year. This method assumes that fuels sold in the city are used within the city, and that the emissions from their combustion can be attributed to local activity. It is a practical and widely used Tier 1 approach, especially in city-level GHG inventories where direct data on vehicle activity, distances traveled, or engine technologies may not be available. The methodology is supported by the GPC v.07 and is consistent with IPCC guidelines for national and subnational inventories.",
          sector: "Transportation",
          scope: "Scope 1 emissions",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Fuel sales data disaggregated by type (gasoline, diesel, LPG, CNG, etc.)",
          ],
          assumptions: [
            "All fuel sold within the city boundary is assumed to be consumed within the boundary.",
          ],
          advantages: [
            "Easy to apply and requires minimal data (fuel sales by type).",
            "Avoids the complexity of tracking vehicle types, routes, or mileage.",
            "Aligns with national energy statistics and can be scaled to city-level inventories.",
            "Accepted by GPC for on-road transportation when activity data is unavailable.",
          ],
          limitations: [
            "Assumes all fuel is used within the city, which may overestimate or underestimate actual emissions if significant fuel is used elsewhere.",
            "Does not provide detailed insight into emissions by vehicle type or mode, limiting policy targeting.",
            "Not appropriate for cities where large volumes of fuel are exported or consumed outside city limits.",
          ],
          equation: {
            label: "Adapted Eq. 5.1",
            formula:
              "\\text{emissions}_{\\text{total}} = \\sum_{i,j}(\\text{fuel}_{\\text{consumed}_i} \\cdot \\text{EF}_{i,j})",
          },
          parameters: [
            {
              code: "\\text{fuel sold}_i",
              description:
                "Quantity of fuel sold by fuel type (gasoline, diesel, LPG, CNG, etc.)",
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
          methodology: "Ventas de combustible",
          overview:
            "La metodología de Ventas de Combustible estima las emisiones de gases de efecto invernadero (GEI) del transporte basándose en el volumen total de combustible vendido dentro de los límites de la ciudad durante el año de informe. Este método asume que los combustibles vendidos en la ciudad se utilizan dentro de la ciudad y que las emisiones de su combustión pueden atribuirse a la actividad local. Es un enfoque práctico y ampliamente utilizado de Nivel 1, especialmente en inventarios de GEI a nivel municipal cuando no se dispone de datos directos sobre la actividad de los vehículos, las distancias recorridas o las tecnologías de motor. La metodología cuenta con el respaldo del GPC v.07 y es coherente con las directrices del IPCC para inventarios nacionales y subnacionales.",
          sector: "Transporte",
          scope: "Emisiones de Alcance 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Datos de ventas de combustible desagregados por tipo (gasolina, diésel, GLP, GNC, etc.)",
          ],
          assumptions: [
            "Todo el combustible vendido dentro de los límites de la ciudad se asume consumido dentro de esos límites.",
          ],
          advantages: [
            "Fácil de aplicar y requiere datos mínimos (ventas de combustible por tipo).",
            "Evita la complejidad de rastrear tipos de vehículos, rutas o kilometraje.",
            "Se alinea con las estadísticas energéticas nacionales y puede escalarse a inventarios a nivel de ciudad.",
            "Aceptado por el GPC para transporte por carretera cuando no se dispone de datos de actividad.",
          ],
          limitations: [
            "Asume que todo el combustible se utiliza dentro de la ciudad, lo que puede sobrestimar o subestimar las emisiones reales si se utiliza en otro lugar.",
            "No ofrece información detallada sobre las emisiones según el tipo o modo de vehículo, limitando la focalización de políticas.",
            "No es apropiado para ciudades donde grandes volúmenes de combustible se exportan o consumen fuera de los límites de la ciudad.",
          ],
          equation: {
            label: "Ecuación adaptada 5.1",
            formula:
              "\\text{emissions}_{\\text{total}} = \\sum_{i,j}(\\text{fuel}_{\\text{consumed}_i} \\cdot \\text{EF}_{i,j})",
          },
          parameters: [
            {
              code: "\\text{fuel sold}_i",
              description:
                "Cantidad de combustible vendido por tipo (gasolina, diésel, GLP, GNC, etc.)",
              units: ["m³", "kg"],
            },
            {
              code: "\\text{emission factors}_{i,j}",
              description:
                "Cantidad de GEI emitidos por unidad de combustible quemado (incluye CO₂, CH₄ y N₂O)",
              units: ["tonnes gas/m³ of fuel", "tonnes gas/kg of fuel"],
            },
          ],
        },
        de: {
          methodology: "Kraftstoffverkauf",
          overview:
            "Die Kraftstoffverkaufs-Methodik schätzt die Treibhausgas (THG)-Emissionen aus dem Verkehr basierend auf dem gesamten innerhalb der Stadtgrenzen während des Berichtsjahres verkauften Kraftstoffvolumen. Diese Methode geht davon aus, dass der in der Stadt verkaufte Kraftstoff innerhalb der Stadt verwendet wird und dass die Emissionen aus seiner Verbrennung der lokalen Aktivität zugeschrieben werden können. Es handelt sich um einen praktischen und weit verbreiteten Tier-1-Ansatz, insbesondere in städtischen THG-Inventaren, wenn keine direkten Daten zu Fahrzeugbewegungen, zurückgelegten Distanzen oder Motorentechnologien vorliegen. Die Methodik wird vom GPC v.07 unterstützt und entspricht den IPCC-Richtlinien für nationale und subnationale Inventare.",
          sector: "Transport",
          scope: "Scope-1-Emissionen",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Daten zu Kraftstoffverkäufen, aufgeschlüsselt nach Typ (Benzin, Diesel, LPG, CNG, etc.)",
          ],
          assumptions: [
            "Es wird angenommen, dass der gesamte innerhalb der Stadtgrenzen verkaufte Kraftstoff auch dort verbraucht wird.",
          ],
          advantages: [
            "Einfach anzuwenden und erfordert minimale Daten (Kraftstoffverkäufe nach Typ).",
            "Vermeidet die Komplexität der Nachverfolgung von Fahrzeugtypen, Routen oder Fahrleistung.",
            "Entspricht den nationalen Energiedaten und kann auf städtische Inventare skaliert werden.",
            "Vom GPC für den Straßenverkehr akzeptiert, wenn keine Aktivitätsdaten verfügbar sind.",
          ],
          limitations: [
            "Geht davon aus, dass der gesamte Kraftstoff innerhalb der Stadt verbraucht wird, was die tatsächlichen Emissionen überschätzen oder unterschätzen kann, wenn erhebliche Mengen anderswo verwendet werden.",
            "Bietet keine detaillierten Einblicke in Emissionen nach Fahrzeugtyp oder -art, was die politische Steuerung erschwert.",
            "Nicht geeignet für Städte, in denen große Mengen an Kraftstoff exportiert oder außerhalb der Stadtgrenzen verbraucht werden.",
          ],
          equation: {
            label: "Angepasste Gleichung 5.1",
            formula:
              "\\text{emissions}_{\\text{total}} = \\sum_{i,j}(\\text{fuel}_{\\text{consumed}_i} \\cdot \\text{EF}_{i,j})",
          },
          parameters: [
            {
              code: "\\text{fuel sold}_i",
              description:
                "Menge des verkauften Kraftstoffs nach Typ (Benzin, Diesel, LPG, CNG, etc.)",
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
          methodology: "Vendas de combustível",
          overview:
            "A metodologia de Vendas de Combustível estima as emissões de gases de efeito estufa (GEE) do transporte com base no volume total de combustível vendido dentro dos limites da cidade durante o ano de relatório. Este método assume que os combustíveis vendidos na cidade são usados dentro da cidade e que as emissões de sua combustão podem ser atribuídas à atividade local. É uma abordagem prática e amplamente utilizada de Nível 1, especialmente em inventários de GEE a nível municipal quando não há dados diretos sobre a atividade de veículos, distâncias percorridas ou tecnologias de motor. A metodologia é apoiada pelo GPC v.07 e está em conformidade com as diretrizes do IPCC para inventários nacionais e subnacionais.",
          sector: "Transporte",
          scope: "Emissões do Escopo 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Dados de vendas de combustível desagregados por tipo (gasolina, diesel, GLP, GNC, etc.)",
          ],
          assumptions: [
            "Assume-se que todo o combustível vendido dentro dos limites da cidade é consumido dentro desses limites.",
          ],
          advantages: [
            "Fácil de aplicar e requer dados mínimos (vendas de combustível por tipo).",
            "Evita a complexidade de rastrear tipos de veículos, rotas ou quilometragem.",
            "Alinha-se às estatísticas energéticas nacionais e pode ser dimensionado para inventários a nível municipal.",
            "Aceito pelo GPC para transporte rodoviário quando não há dados de atividade disponíveis.",
          ],
          limitations: [
            "Assume que todo o combustível é usado dentro da cidade, o que pode superestimar ou subestimar as emissões reais se for usado em outro lugar.",
            "Não fornece insights detalhados sobre emissões por tipo ou modo de veículo, limitando o direcionamento de políticas.",
            "Não é apropriado para cidades onde grandes volumes de combustível são exportados ou consumidos fora dos limites da cidade.",
          ],
          equation: {
            label: "Equação adaptada 5.1",
            formula:
              "\\text{emissions}_{\\text{total}} = \\sum_{i,j}(\\text{fuel}_{\\text{consumed}_i} \\cdot \\text{EF}_{i,j})",
          },
          parameters: [
            {
              code: "\\text{fuel sold}_i",
              description:
                "Quantidade de combustível vendido por tipo (gasolina, diesel, GLP, GNC, etc.)",
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
          methodology: "Ventes de carburant",
          overview:
            "La méthodologie des Ventes de Carburant estime les émissions de gaz à effet de serre (GES) liées au transport en fonction du volume total de carburant vendu à l'intérieur des limites de la ville pendant l'année de référence. Cette méthode suppose que les carburants vendus dans la ville sont utilisés au sein de la ville et que les émissions de leur combustion peuvent être attribuées à l'activité locale. Il s'agit d'une approche de niveau 1 pratique et largement utilisée, notamment dans les inventaires de GES au niveau des villes lorsqu'il n'existe pas de données directes sur l'activité des véhicules, les distances parcourues ou les technologies de moteur. La méthodologie est approuvée par le Protocole Global pour les Inventaires d'Émissions de Gaz à Effet de Serre à l'Échelle Communautaire (GPC) v.07 et est conforme aux directives du GIEC pour les inventaires nationaux et infranationaux.",
          sector: "Transport",
          scope: "Émissions du Scope 1",
          approach: {
            type: "IPCC Tier 1",
            guidance: "GPC v.07",
          },
          data_requirements: [
            "Données de vente de carburant ventilées par type (essence, diesel, GPL, GNC, etc.)",
          ],
          assumptions: [
            "Suppose que tout le carburant vendu à l'intérieur des limites de la ville est consommé à l'intérieur de ces limites.",
          ],
          advantages: [
            "Facile à appliquer et nécessite peu de données (ventes de carburant par type).",
            "Évite la complexité de suivre les types de véhicules, les itinéraires ou le kilométrage.",
            "S'aligne sur les statistiques énergétiques nationales et peut être étendu aux inventaires au niveau de la ville.",
            "Acceptée par le GPC pour le transport routier en l'absence de données d'activité.",
          ],
          limitations: [
            "Suppose que tout le carburant est utilisé à l'intérieur de la ville, ce qui peut surestimer ou sous-estimer les émissions réelles si une quantité importante de carburant est utilisée ailleurs.",
            "Ne fournit pas d'informations détaillées sur les émissions par type ou mode de véhicule, limitant le ciblage des politiques.",
            "Ne convient pas aux villes où de grands volumes de carburant sont exportés ou consommés en dehors des limites de la ville.",
          ],
          equation: {
            label: "Équation adaptée 5.1",
            formula:
              "\\text{emissions}_{\\text{total}} = \\sum_{i,j}(\\text{fuel}_{\\text{consumed}_i} \\cdot \\text{EF}_{i,j})",
          },
          parameters: [
            {
              code: "\\text{fuel sold}_i",
              description:
                "Quantité de carburant vendu par type (essence, diesel, GPL, GNC, etc.)",
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
