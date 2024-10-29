// Purpose: Service to convert units between different systems.

import createHttpError from "http-errors";

export default class UnitConversionService {
  private static conversionTable: { [key: string]: { [key: string]: number } } =
    {
      "units-cubic-meters": {
        "units-gallons": 0.00378541, // 1 gallon = 0.00378541 cubic meters
        "units-liters": 0.001, // 1 liter = 0.001 cubic meters
        "units-cubic-meters": 1, // 1 cubic meter = 1 cubic meter (identity)
      },
      "units-kilowatt-hours": {
        "units-kilowatt-hours": 1, // 1 kWh = 1 kWh (identity)
        "units-terajoules": 277777.78, // 1 terajoule = 277777.78 kWh (converting down to 1 kWh)
      },
      "units-tonnes": {
        "units-kilograms": 0.001, // 1 tonne = 1000 kilograms
        "units-tonnes": 1, // 1 tonne = 1 tonne (identity)
      },
    };

  private static fuelDensities: Record<string, number> = {
    "fuel-type-all": 641.63, // this should change if any other fuel type is added because it's the average density of all types
    "fuel-type-gasoline": 740, // Gasoline: 720-750 kg/m³
    "fuel-type-diesel": 830, // Diesel: 820-860 kg/m³
    "fuel-type-lpg": 493, // LPG: 493-580 kg/m³
    "fuel-type-cng": 0.8, // CNG: 0.7-0.9 kg/m³ (gas state)
    "fuel-type-biofuel": 880, // Biofuel: ~880 kg/m³
    "fuel-type-e85-ethanol": 770, // E85 Ethanol: 760-780 kg/m³
    "fuel-type-b20-biodiesel": 860, // B20 Biodiesel: ~860 kg/m³
    "fuel-type-natural-gas": 0.8, // Natural Gas: ~0.7-0.9 kg/m³ (gas state)
    "fuel-type-ethanol": 789, // Ethanol: ~789 kg/m³
    "fuel-type-biodiesel": 880, // Biodiesel: ~870-890 kg/m³
    "fuel-type-bioethanol": 789, // Bioethanol: ~789 kg/m³
    "fuel-type-gas-oil": 850, // Gas Oil: ~850 kg/m³
    "fuel-type-naphtha": 710, // Naphtha: 700-720 kg/m³
    "fuel-type-diesel-oil": 830, // Diesel Oil: 820-860 kg/m³
    "fuel-type-liquefied-petroleum-gases": 493, // LPG: 493-580 kg/m³
    "fuel-type-wood/wood-waste": 700, // Wood/Wood Waste: 600-700 kg/m³ (solid state)
    "fuel-type-other-primary-solid-biomass": 700, // Biomass: ~600-700 kg/m³
    "fuel-type-charcoal": 250, // Charcoal: 200-300 kg/m³
    "fuel-type-natural-gas-oil": 820, // Natural Gas Oil: ~820 kg/m³
    "fuel-type-peat": 450, // Peat: ~400-500 kg/m³
  };

  public static convertUnits(
    value: number,
    fromUnit: string,
    toUnit: string,
    fuelType?: string,
  ): number {
    if (fromUnit === toUnit) {
      return value;
    }

    if (
      fromUnit === "units-kilograms" &&
      toUnit === "units-cubic-meters" &&
      fuelType
    ) {
      return value / this.fuelDensities[fuelType || "fuel-type-all"];
    }

    if (!this.conversionTable[toUnit]) {
      // check if the reverse conversion is possible
      if (
        this.conversionTable[fromUnit] &&
        this.conversionTable[fromUnit][toUnit]
      ) {
        return value / this.conversionTable[fromUnit][toUnit];
      } else {
        throw new createHttpError.BadRequest(
          `Conversion from ${fromUnit} to ${toUnit} is not supported`,
        );
      }
    }

    return this.conversionTable[toUnit][fromUnit] * value;
  }
}
