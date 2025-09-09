export interface TransportTestData {
  subsector: string;
  methodology_id: string;
  methodology_name: string;
  methodology_status: string;
  fuel_type: string;
  vehicle_type: string;
  co2_global_api: number;
  ch4_global_api: number;
  n2o_global_api: number;
  units_in_global_api: string;
  co2_gwp: number;
  ch4_gwp: number;
  n2o_gwp: number;
  total_fuel_value: number;
  total_fuel_units: string;
  expected_co2e_tonnes: number;
}

export interface TestResult {
  success: boolean;
  testData: {
    subsector: string;
    methodology: string;
    fuelType: string;
    vehicleType: string;
    fuelValue: number;
    fuelUnits: string;
  };
  expected: number;
  calculated?: number;
  difference?: number;
  tolerance: number;
  availableFactors: string[];
  emissionFactorValues?: Record<string, number>;
  calculations?: Record<string, number>;
  error?: string;
}
