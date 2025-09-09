// Purpose: Service to convert units between different systems.

import createHttpError from "http-errors";

export default class UnitConversionService {
  private static conversionTable: { [key: string]: { [key: string]: number } } =
    {
      "units-cubic-meters": {
        "units-gallons": 0.00378541, // 1 gallon = 0.00378541 cubic meters
        "units-gallons-us": 0.00378541, // 1 US gallon = 0.00378541 cubic meters
        "units-gallons-uk": 0.00454609,
        "units-barrel": 0.158987,
        "units-liters": 0.001, // 1 liter = 0.001 cubic meters
        "units-cubic-meters": 1, // 1 cubic meter = 1 cubic meter (identity)
        "units-cubic-feet": 0.0283168,
      },
      "units-kilograms": {
        // Conversions *to* kilograms
        "units-kilograms": 1, // 1 kg = 1 kg
        "units-tonnes": 1000, // 1 tonne = 1000 kg
        "units-long-tons": 1016.047, // 1 long ton = 1016.047 kg (approx)
        "units-short-tons": 907.184, // 1 short ton = 907.184 kg (approx)
        "units-pounds": 0.453592, // 1 pound = 0.453592 kg (approx)
      },
      "units-kilowatt-hours": {
        "units-kilowatt-hours": 1, // 1 kWh = 1 kWh (identity)
        "units-terajoules": 277777.78, // 1 terajoule = 277777.78 kWh (converting down to 1 kWh)
      },
      "units-tonnes": {
        "units-kilograms": 0.001, // 1 tonne = 1000 kilograms
        "units-tonnes": 1, // 1 tonne = 1 tonne (identity)
      },
      "units-cubic-meters-per-tonne": {
        "units-cubic-meters-per-tonne": 1, // 1 m³/t = 1 m³/t (identity)
        "units-cubic-meters-per-kilogram": 1000, // 1 m³/t = 0.001 m³/kg
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
    "fuel-type-wood-wood-waste": 700, // Wood/Wood Waste: 600-700 kg/m³ (solid state)
    "fuel-type-other-primary-solid-biomass": 700, // Biomass: ~600-700 kg/m³
    "fuel-type-charcoal": 250, // Charcoal: 200-300 kg/m³
    "fuel-type-natural-gas-oil": 820, // Natural Gas Oil: ~820 kg/m³
    "fuel-type-peat": 450, // Peat: ~400-500 kg/m³
    "fuel-type-propane": 493, // Propane: ~493 kg/m³
    "fuel-type-firewood": 450, // 225 C-kg/m³ / 0.5 carbon fraction
    "fuel-type-anthracite": 865, // 800-930 kg/m³
    "fuel-type-aviation-gasoline": 706,
    "fuel-type-bitumen": 1000,
    "fuel-type-coke-oven-coke-and-lignite-coke": 900,
    "fuel-type-coke-oven-gas": 1,
    "fuel-type-coking-coal": 793,
    "fuel-type-crude-oil": 900,
    "fuel-type-industrial-wastes": 530,
    "fuel-type-jet-gasoline": 710,
    "fuel-type-jet-kerosene": 800,
    "fuel-type-lignite": 750,
    "fuel-type-municipal-wastes": 150,
    "fuel-type-natural-charcoal": 265,
    "fuel-type-natural-gas-liquids": 550,
    "fuel-type-natural-other-bituminous-coal": 1000,
    "fuel-type-other-kerosene": 800,
    "fuel-type-oxygen-steel-furnace-gas": 1,
    "fuel-type-refinery-gas": 1,
    "fuel-type-residual-fuel-oil": 975,
    "fuel-type-sub-bituminous-coal": 865,
    "fuel-type-waste-oils": 900,
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

    const massUnits = [
      "units-kilograms",
      "units-milligrams",
      "units-long-tons",
      "units-short-tons",
      "units-pounds",
    ];

    if (
      massUnits.includes(fromUnit) &&
      toUnit === "units-cubic-meters" &&
      fuelType
    ) {
      const density_kg_m3 = this.fuelDensities[fuelType];

      // Check if density is available and valid for the given fuel type
      if (density_kg_m3 === undefined || density_kg_m3 <= 0) {
        throw new createHttpError.BadRequest(
          `Density for fuel type "${fuelType}" is not available or is invalid for mass-to-volume conversion.`,
        );
      }

      const valueInKg = this.convertUnits(value, fromUnit, "units-kilograms");
      return valueInKg / this.fuelDensities[fuelType || "fuel-type-all"];
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

  public static convertUnitsWithoutDensity(
    value: number,
    fromUnit: string,
    toUnit: string,
  ): number {
    // Only allow mass-to-mass or volume-to-volume conversions
    const massUnits = [
      "units-kilograms",
      "units-tonnes",
      "units-pounds",
      "units-long-tons",
      "units-short-tons",
    ];

    const volumeUnits = ["units-cubic-meters", "units-liters", "units-gallons"];

    const fromIsMass = massUnits.includes(fromUnit);
    const toIsMass = massUnits.includes(toUnit);
    const fromIsVolume = volumeUnits.includes(fromUnit);
    const toIsVolume = volumeUnits.includes(toUnit);

    if ((fromIsMass && toIsMass) || (fromIsVolume && toIsVolume)) {
      // Safe conversion within same unit type
      return this.convertUnits(value, fromUnit, toUnit);
    } else {
      throw new createHttpError.BadRequest(
        `Cannot convert ${fromUnit} to ${toUnit} without density for solid fuels`,
      );
    }
  }
}
