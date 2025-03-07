export const data = {
  totals: {
    emissions: {
      co2_mass: "4788367797.6",
      co2_co2eq: "4788367797.6",
      ch4_mass: "1296735.696",
      ch4_co2eq_100yr: "36308599.488",
      ch4_co2eq_20yr: "0.0",
      n2o_mass: "42797.469600000004",
      n2o_co2eq_100yr: "11341329.444000002",
      n2o_co2eq_20yr: "0.0",
      co2eq_100yr: "4836017726.532001",
      co2eq_20yr: "0.0",
      gpc_quality: "high",
    },
  },
  records: [
    {
      methodology_name: "fuel-combustion-consumption",
      emissions_geometry: null,
      activity_name: "fuel-consumption",
      activity_units: "TEP",
      activity_subcategory_type: {
        "residential-building-type": "building-type-all",
        "residential-building-fuel-type": "fuel-type-charcoal",
      },
      gases: [
        {
          gas_name: "CH4",
          emissions_value: 1130436,
          emissionfactor_value: 200,
          activity_value: 5652.18,
          gwp: 28,
          emissions_value_100yr: 31652208,
          emissions_value_20yr: 0,
        },
        {
          gas_name: "CO2",
          emissions_value: 633044160,
          emissionfactor_value: 112000,
          activity_value: 5652.18,
          gwp: 1,
          emissions_value_100yr: 633044160,
          emissions_value_20yr: 0,
        },
        {
          gas_name: "N2O",
          emissions_value: 22608.72,
          emissionfactor_value: 4,
          activity_value: 5652.18,
          gwp: 265,
          emissions_value_100yr: 5991310.8,
          emissions_value_20yr: 0,
        },
      ],
    },
    {
      methodology_name: "fuel-combustion-consumption",
      emissions_geometry: null,
      activity_name: "fuel-consumption",
      activity_units: "TEP",
      activity_subcategory_type: {
        "residential-building-type": "building-type-all",
        "residential-building-fuel-type": "fuel-type-liquefied-petroleum-gases",
      },
      gases: [
        {
          gas_name: "CH4",
          emissions_value: 59536.296,
          emissionfactor_value: 1,
          activity_value: 59536.296,
          gwp: 28,
          emissions_value_100yr: 1667016.288,
          emissions_value_20yr: 0,
        },
        {
          gas_name: "CO2",
          emissions_value: 3756740277.6,
          emissionfactor_value: 63100,
          activity_value: 59536.296,
          gwp: 1,
          emissions_value_100yr: 3756740277.6,
          emissions_value_20yr: 0,
        },
        {
          gas_name: "N2O",
          emissions_value: 5953.6296,
          emissionfactor_value: 0.1,
          activity_value: 59536.296,
          gwp: 265,
          emissions_value_100yr: 1577711.844,
          emissions_value_20yr: 0,
        },
      ],
    },
    {
      methodology_name: "fuel-combustion-consumption",
      emissions_geometry: null,
      activity_name: "fuel-consumption",
      activity_units: "TEP",
      activity_subcategory_type: {
        "residential-building-type": "building-type-all",
        "residential-building-fuel-type": "fuel-type-wood-wood-waste",
      },
      gases: [
        {
          gas_name: "CO2",
          emissions_value: 398583360,
          emissionfactor_value: 112000,
          activity_value: 3558.78,
          gwp: 1,
          emissions_value_100yr: 398583360,
          emissions_value_20yr: 0,
        },
        {
          gas_name: "N2O",
          emissions_value: 14235.12,
          emissionfactor_value: 4,
          activity_value: 3558.78,
          gwp: 265,
          emissions_value_100yr: 3772306.8,
          emissions_value_20yr: 0,
        },
        {
          gas_name: "CH4",
          emissions_value: 106763.4,
          emissionfactor_value: 30,
          activity_value: 3558.78,
          gwp: 28,
          emissions_value_100yr: 2989375.2,
          emissions_value_20yr: 0,
        },
      ],
    },
  ],
};
