import csv
import os
import json
import pandas as pd
from pathlib import Path
from utils import (
    make_dir,
    write_dic_to_csv,
    uuid_generate_v3,
    uuid_generate_v4,
    get_filename,
    set_seed,
    string_to_hash,
)


def conversions(df, original_unit, target_unit, factor, calc_type):
    # Apply the conversion
    tmp = df.loc[df["units"] == original_unit].copy()
    tmp["emissions_per_activity"] *= factor
    tmp["units"] = target_unit
    tmp["calculation_type"] = calc_type
    return tmp


def save_to_csv(fl, data):
    """save list of dictionaries to CSV"""
    with open(fl, "w", newline="") as csvfile:
        # Assuming all dictionaries have the same keys
        fieldnames = data[0].keys()
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

        writer.writeheader()
        writer.writerows(data)


##---------------------------------------------------------
## Mapping Diccionaries
##---------------------------------------------------------
# mapping fuel names from the source to IPCC
fuel_mapping = {
    "Motor Gasoline/Petrol": "Gasoline",
    "On-Road Diesel Fuel": "Diesel",
    "Liquefied Petroleum Gases (LPG)": "Liquefied Petroleum Gas (LPG)",
    "Kerosene - Type Jet Fuel": "Kerosene",
    "Motor Gasoline": "Gasoline",
    "Diesel Fuel": "Diesel",
    "Residual Fuel Oil2": "Residual Fuel Oil",
    "Ethanol (100%)": "Ethanol",
    "Biodiesel (100%)": "Biodiesel",
    "E85 Ethanol/Gasoline*": "E85 Ethanol",
    "B20 Biodiesel/Diesel*": "B20 Biodiesel",
    "Aviation spirit (Aviation Gasoline)": "Aviation Gasoline",
    "Aviation turbine fuel (Jet Fuel)": "Jet Fuel",
    "Diesel (100% mineral diesel)": "Diesel",
    "Fuel oil (Residual Fuel Oil)": "Residual Fuel Oil",
    "Petrol (100% mineral petrol) (Motor Gasoline)": "Gasoline",
    "Processed fuel oils - residual oil": "Residual Fuel Oil",
    "Natural gas (100% mineral blend)": "Natural Gas",
    "Bioethanol3": "Bioethanol",
    "Biodiesel ME3": "Biodiesel",
    "Jet Fuel": "Jet Kerosene",
    "LPG": "Liquefied Petroleum Gas (LPG)",
}

# mapping fuel names to gpc_refno
fuel_to_gpc = {
    "Jet Kerosene": ["II.4.1"],
    "Aviation Gasoline": ["II.4.1"],
    "Motor Gasoline/Petrol": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "On-Road Diesel Fuel": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Residual Fuel Oil": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Liquefied Petroleum Gases (LPG)": [
        "II.1.1",
        "II.2.1",
        "II.3.1",
        "II.4.1",
        "II.5.1",
    ],
    "Compressed Natural Gas (CNG)": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Kerosene - Type Jet Fuel": ["II.4.1"],
    "Motor Gasoline": ["II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1"],
    "Diesel Fuel": ["II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1"],
    "Residual Fuel Oil2": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Liquefied Natural Gas (LNG)": ["II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1"],
    "E85 Ethanol/Gasoline*": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "B20 Biodiesel/Diesel*": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Aviation spirit (Aviation Gasoline)": ["II.4.1"],
    "Aviation turbine fuel (Jet Fuel)": ["II.4.1"],
    "Diesel (100% mineral diesel)": ["II.1.1", "II.2.1", "II.3.1", "II.4.1", "II.5.1"],
    "Fuel oil (Residual Fuel Oil)": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Petrol (100% mineral petrol) (Motor Gasoline)": [
        "II.1.1",
        "II.2.1",
        "II.3.1",
        "II.4.1",
        "II.5.1",
    ],
    "Processed fuel oils - residual oil": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Natural gas (100% mineral blend)": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Ethanol (100%)": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Biodiesel (100%)": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Bioethanol3": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
    "Biodiesel ME3": ["II.1.1", "II.2.1", "II.3.1", "II.5.1"],
}

# mapping transport types to gpc_refno
transport_type_to_gpc = {
    "Rail": ["II.2.1"],
    "Agriculture Equipment": ["II.5.1"],
    "Forestry Equipment": ["II.5.1"],
    "Industry Equipment": ["II.5.1"],
    "Household Equipment": ["II.5.1"],
    "Ship and Boat": ["II.3.1"],
    "Locomotives": ["II.2.1"],
    "Aircraft": ["II.4.1"],
    "Agricultural Equipment1": ["II.5.1"],
    "Construction Equipment2": ["II.5.1"],
    "Lawn and Garden Equipment": ["II.5.1"],
    "Airport Equipment": ["II.5.1"],
    "Industrial/Commercial Equipment": ["II.5.1"],
    "Logging Equipment": ["II.5.1"],
    "Railroad Equipment": ["II.5.1"],
    "Recreational Equipment": ["II.5.1"],
    "Freight flights": ["II.4.1"],
    "Vans": ["II.1.1"],
    "HGV - Rigid": ["II.1.1", "II.5.1"],
    "HGV - Articulated": ["II.1.1"],
    "HGV - Type Unknown": ["II.1.1"],
    "Sea tanker": ["II.3.1"],
    "Cargo ship": ["II.3.1"],
    "Medium-Duty Truck5": ["II.1.1", "II.5.1"],
    "Heavy-Duty Truck5": ["II.1.1", "II.5.1"],
    "Waterborne Craft": ["II.3.1"],
    "Medium-Duty Truck": ["II.1.1", "II.5.1"],
    "Heavy-Duty Truck": ["II.1.1", "II.5.1"],
    "Passenger Car6": ["II.1.1"],
    "Light-Duty Truck7": ["II.1.1", "II.5.1"],
    "Air Travel - Short Haul": ["II.4.1"],
    "Air - Medium Haul": ["II.4.1"],
    "Air - Long Haul": ["II.4.1"],
    "Intercity Rail": ["II.2.1"],
    "Intercity Rail ": ["II.2.1"],
    "Commuter Rail": ["II.2.1"],
    "Transit Rail": ["II.2.1"],
    "Bus": ["II.1.1", "II.5.1"],
    "Medium-Duty Truck5": ["II.1.1", "II.5.1"],
    "Heavy-Duty Truck5": ["II.1.1", "II.5.1"],
    "Waterborne Craft": ["II.3.1"],
    "Aircraft": ["II.4.1"],
    "Passenger Car8": ["II.1.1"],
    "Light-Duty Truck9": ["II.1.1", "II.5.1"],
    "Motorcycle": ["II.1.1"],
    "Air - Domestic1,2": ["II.4.1"],
    "Air - Short Haul1, up to 3700km distance": ["II.4.1"],
    "Air - Long Haul1, over 3700km distance": ["II.4.1"],
    "Air - International1": ["II.4.1"],
    "Taxi": ["II.1.1"],
    "Average Ferry": ["II.3.1"],
}

# mapping transport types from the source to City Catalyst dropdrown
transport_type_from_source_to_cc = {
    "Rail": {"II.2.1": ["all"]},
    "Agriculture Equipment": {"II.5.1": ["Agricultural machinery"]},
    "Forestry Equipment": {"II.5.1": ["Forestry equipment"]},
    "Industry Equipment": {"II.5.1": ["Mining equipments", "Construction maquinery"]},
    "Household Equipment": {"II.5.1": ["Household equipment"]},
    "Ship and Boat": {"II.3.1": ["Boast", "Marine Vessels"]},
    "Locomotives": {"II.2.1": ["all"]},
    "Aircraft": {"II.4.1": ["all"]},
    "Agricultural Equipment1": {"II.5.1": ["Forestry equipment"]},
    "Construction Equipment2": {"II.5.1": ["Construction maquinery"]},
    "Lawn and Garden Equipment": {"II.5.1": ["Household equipment"]},
    "Airport Equipment": {"II.5.1": ["Airport equipment"]},
    "Industrial/Commercial Equipment": {
        "II.5.1": ["Mining equipments", "Construction maquinery"]
    },
    "Logging Equipment": {"II.5.1": ["Airport equipment"]},
    "Railroad Equipment": {"II.5.1": ["Railroad equipment"]},
    "Recreational Equipment": {"II.5.1": ["all"]},
    "Freight flights": {"II.4.1": ["Cargo aircraft"]},
    "Vans": {
        "II.1.1": [
            "Passenger vehicles",
            "Commercial vehicles",
            "Service vehicles",
            "Emergency vehicles",
        ]
    },
    "HGV - Rigid": {
        "II.1.1": ["Commercial vehicles"],
        "II.5.1": ["Mining equipments", "Construction maquinery"],
    },
    "HGV - Articulated": {"II.1.1": ["Commercial vehicles"]},
    "HGV - Type Unknown": {"II.1.1": ["Commercial vehicles"]},
    "Sea tanker": {"II.3.1": ["Marine vessels", "Ferries"]},
    "Cargo ship": {"II.3.1": ["Marine vessels"]},
    "Medium-Duty Truck5": {
        "II.1.1": ["Commercial vehicles"],
        "II.5.1": ["Mining equipments", "Construction maquinery"],
    },
    "Heavy-Duty Truck5": {
        "II.1.1": ["Commercial vehicles"],
        "II.5.1": ["Mining equipments", "Construction maquinery"],
    },
    "Waterborne Craft": ["II.3.1"],
    "Medium-Duty Truck": {
        "II.1.1": ["Commercial vehicles"],
        "II.5.1": ["Mining equipments", "Construction maquinery"],
    },
    "Heavy-Duty Truck": {
        "II.1.1": ["Commercial vehicles"],
        "II.5.1": ["Mining equipments", "Construction maquinery"],
    },
    "Passenger Car6": {
        "II.1.1": [
            "Passenger vehicles",
            "Commercial vehicles",
            "Service vehicles",
            "Emergency vehicles",
        ]
    },
    "Light-Duty Truck7": {
        "II.1.1": ["Commercial vehicles"],
        "II.5.1": ["Mining equipments", "Construction maquinery"],
    },
    "Air Travel - Short Haul": {"II.4.1": ["all"]},
    "Air - Medium Haul": {"II.4.1": ["all"]},
    "Air - Long Haul": {"II.4.1": ["all"]},
    "Intercity Rail": {"II.2.1": ["all"]},
    "Intercity Rail ": {"II.2.1": ["all"]},
    "Commuter Rail": {"II.2.1": ["all"]},
    "Transit Rail": {"II.2.1": ["all"]},
    "Bus": {"II.1.1": ["Public transport vehicles"], "II.5.1": ["Airport equipment"]},
    "Medium-Duty Truck5": {
        "II.1.1": ["Commercial vehicles"],
        "II.5.1": ["Mining equipments", "Construction maquinery"],
    },
    "Heavy-Duty Truck5": {
        "II.1.1": ["Commercial vehicles"],
        "II.5.1": ["Mining equipments", "Construction maquinery"],
    },
    "Waterborne Craft": {"II.3.1": ["all"]},
    "Aircraft": {"II.4.1": ["all"]},
    "Passenger Car8": {
        "II.1.1": [
            "Passenger vehicles",
            "Commercial vehicles",
            "Service vehicles",
            "Emergency vehicles",
        ]
    },
    "Light-Duty Truck9": {
        "II.1.1": ["Commercial vehicles"],
        "II.5.1": ["Mining equipments", "Construction maquinery"],
    },
    "Motorcycle": {
        "II.1.1": [
            "Passenger vehicles",
            "Commercial vehicles",
            "Service vehicles",
            "Emergency vehicles",
        ]
    },
    "Air - Domestic1,2": {"II.4.1": ["all"]},
    "Air - Short Haul1, up to 3700km distance": {"II.4.1": ["all"]},
    "Air - Long Haul1, over 3700km distance": {"II.4.1": ["all"]},
    "Air - International1": {"II.4.1": ["all"]},
    "Taxi": {
        "II.1.1": [
            "Passenger vehicles",
            "Commercial vehicles",
            "Service vehicles",
            "Emergency vehicles",
        ]
    },
    "Average Ferry": {"II.3.1": ["Marine vessels", "Ferries"]},
}

fuel_to_fuel_ids_mapping = {
    'Anthracite': 'fuel-type-anthracite',
    'Aviation Gasoline': 'fuel-type-aviation-gasoline',
    'Jet Fuel': 'fuel-type-jet-gasoline',
    'Jet Kerosene': 'fuel-type-jet-kerosene',
    'Compressed Natural Gas (CNG)': 'fuel-type-cng',
    'Kerosene': 'fuel-type-kerosene',
    'E85 Ethanol': 'fuel-type-e85-ethanol',
    'B20 Biodiesel': 'fuel-type-b20-biodiesel',
    'Natural Gas': 'fuel-type-natural-gas',
    'Ethanol': 'fuel-type-ethanol',
    'Biodiesel': 'fuel-type-biodiesel',
    'Bioethanol': 'fuel-type-bioethanol',
    'Diesel': 'fuel-type-diesel',
    'Residual Fuel Oil': 'fuel-type-residual-fuel-oil',
    'Liquefied Petroleum Gas (LPG)': 'fuel-type-lpg',
    'Petrol': 'fuel-type-petrol',
    'CNG': 'fuel-type-cng',
    'LPG': 'fuel-type-lpg'
}

transport_type_to_transport_ids_mapping = {
    'Agricultural machinery': 'vehicle-type-agricultural-machinery',
    'Forestry equipment': 'vehicle-type-forestry-equipment',
    'Mining equipments': 'vehicle-type-mining-equipment',
    'Construction maquinery': 'vehicle-type-construction-machinery',
    'Household equipment': 'vehicle-type-household-equipment',
    'Boast': 'vehicle-type-boats',
    'Marine Vessels': 'vehicle-type-marine-vessels',
    'Airport equipment': 'vehicle-type-airport-equipment',
    'Railroad equipment': 'vehicle-type-railroad-equipment',
    'Cargo aircraft': 'vehicle-type-cargo-aircraft',
    'Passenger vehicles': 'vehicle-type-passenger-vehicles',
    'Commercial vehicles': 'vehicle-type-commercial-vehicles',
    'Service vehicles': 'vehicle-type-service-vehicles',
    'Emergency vehicles': 'vehicle-type-emergency-vehicles',
    'Marine vessels': 'vehicle-type-marine-vessels',
    'Ferries': 'vehicle-type-ferries',
    'Public transport vehicles': 'vehicle-type-public-transport-vehicles'
}

# mapping actor it to region name
actor_id_to_region = {"world": "world", "US": "United States", "UK": "United Kingdom"}

# mapping actor it to source reference
reference_from_actor_id = {
    "world": "2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2",
    "US": "EPA Center for Corporate Climate Leadership Emission Factors for Greenhouse Gas Inventories (2024)",
    "UK": "UK Government GHG Conversion Factors for Company Reporting (2023)",
}

# mapping fuel names with NCV and densities
conversions_factors = {
    "Sub-bituminous Coal": {
        "NCV": 0.000019,  # TJ/kg
        "density": 1346,  # kg/m3
    },
    "Diesel": {
        "NCV": 0.000043,  # TJ/kg
        "density": 840,  # kg/m3
    },
    "Gasoline": {
        "NCV": 0.000045,  # TJ/kg
        "density": 740,  # kg/m3
    },
    "Residual Fuel Oil": {
        "NCV": 0.000040,  # TJ/kg
        "density": 940,  # kg/m3
    },
    "Jet Kerosene": {
        "NCV": 0.000045,  # TJ/kg
        "density": 790,  # kg/m3
    },
    "Aviation Gasoline": {
        "NCV": 0.000045,  # TJ/kg
        "density": 740,  # kg/m3
    },
    "Liquefied Petroleum Gas (LPG)": {
        "NCV": 0.000047,  # TJ/kg
        "density": 540,  # kg/m3
    },
    "Kerosene": {
        "NCV": 0.000044,  # TJ/kg
        "density": 800,  # kg/m3
    },
    "Liquefied Natural Gas (LNG)": {
        "NCV": 0.000049,  # TJ/kg
        "density": 500,  # kg/m3
    },
    "E85 Ethanol": {
        "NCV": 0.000047,  # TJ/kg
        "density": None,
    },
    "B20 Biodiesel": {
        "NCV": 0.033565,  # TJ/kg
        "density": None,
    },
    "Natural Gas": {
        "NCV": 0.000048,  # TJ/kg
        "density": 0.7,  # kg/m3
    },
    "Ethanol": {
        "NCV": 0.000047,  # TJ/kg
        "density": None,
    },
    "Biodiesel": {
        "NCV": 0.031167,  # TJ/kg
        "density": None,
    },
}

# mapping of gpc_refno to methodologies
gpc_to_methodologies = {
    "II.1.1": [
        "induced_activity_1",
        "induced_activity_2",
        "geographic",
        "resident_activity",
    ],
    "II.2.1": ["geographic"],
    "II.3.1": ["geographic", "movement_driver"],
    "II.4.1": ["geographic"],
    #"II.5.1": ["TBD"],
}

# units_CC
unit_replacements = {
    "kg/short ton-mile": "kg/stm",
    "kg/vehicle-mile": "kg/mi",
    "kg/passenger-km": "kg/pkm",
    "kg/vehicle-km": "kg/km",
    "kg/passenger-kilometer": "kg/pkm",
}

if __name__ == "__main__":
    # set random.seed so UUID is reproducible
    #! assumes records always generated in same order
    seed_string = get_filename()
    seed_value = string_to_hash(seed_string)
    set_seed(seed_value)

    # output directory
    output_dir = "../data_processed/ghgprotocol/"
    output_dir = os.path.abspath(output_dir)
    make_dir(path=Path(output_dir).as_posix())

    # raw data file path
    input_fl = (
        "../data_raw/ghgprotocol/Emission_Factors_for_Cross_Sector_Tools_V2.0_0.xlsx"
    )
    input_fl = os.path.abspath(input_fl)

    # =================================================================
    # Publisher
    # =================================================================
    publisher_data = {
        "name": "GPC",
        "URL": "https://ghgprotocol.org/",
    }
    publisher_data["publisher_id"] = uuid_generate_v3(name=publisher_data.get("name"))

    write_dic_to_csv(output_dir, "Publisher", publisher_data)

    # =================================================================
    # DataSource
    # =================================================================
    datasource_data = {
        "datasource_name": "IPCC",
        "dataset_name": "Emission Factors for Cross Sector Tools [V2.0_0]",
        "URL": "https://ghgprotocol.org/calculation-tools-and-guidance",
        "publisher_id": publisher_data.get("publisher_id"),
    }
    datasource_data["datasource_id"] = uuid_generate_v3(
        name=datasource_data.get("dataset_name")
    )

    write_dic_to_csv(output_dir, "DataSource", datasource_data)

    # =================================================================
    # Methodology
    # =================================================================
    methodologies = [
        "fuel-sales",
        "geographic",
        "induced-activity-1",
        "induced-activity-2",
        "resident-activity",
        "movement-driver",
        #"TBD",
    ]

    methodology_data_list = []

    for methodology in methodologies:
        methodology_data = {
            "methodology_id": uuid_generate_v3(methodology),
            "methodology": methodology,
            "methodology_url": "",  # Add the URL if needed
            "datasource_id": datasource_data.get("datasource_id"),
        }
        methodology_data_list.append(methodology_data)

    # Write data to CSV
    write_dic_to_csv(output_dir, "Methodology", methodology_data_list)

    # =================================================================
    # EmissionsFactor
    # =================================================================

    ##---------------------------------------------------------
    ## Emission Factors - Fuel Use
    ##---------------------------------------------------------
    # read the sheet
    df1 = pd.read_excel(input_fl, sheet_name="Mobile Combustion - Fuel Use", header=2)

    # for CO2
    # select rows of interest
    df1_co2 = df1[:33]

    # Drop empty columns
    df1_co2 = df1_co2.drop(
        columns=["Unnamed: 0", "Unnamed: 6", "Unnamed: 7", "Unnamed: 8"]
    )

    # Restructure
    df1_co2 = df1_co2.melt(
        id_vars=["Region", "Fuel", "EF Unit"],
        value_vars=["Fossil CO2 EF", "Biogenic CO2 EF"],
        var_name="gas",
        value_name="value",
    )

    # drop rows with NaN values
    df1_co2.dropna(inplace=True)

    # rename columns
    df1_co2.columns = [
        "actor_id",
        "fuel_type",
        "units",
        "gas",
        "emissions_per_activity",
    ]

    # Rename gases
    df1_co2["gas"] = df1_co2["gas"].replace(
        {"Fossil CO2 EF": "CO2", "Biogenic CO2 EF": "biogenic CO2"}
    )

    # assign "GPC_refno" using the mapping dic
    df1_co2["gpc_reference_number"] = df1_co2["fuel_type"].map(fuel_to_gpc)

    # standardize fuel names
    df1_co2["fuel_type"] = df1_co2["fuel_type"].replace(fuel_mapping)

    # explode the gpc_reference_number column
    df1_co2 = df1_co2.explode("gpc_reference_number", ignore_index=True)

    # creating a 'transport type' column
    df1_co2["transport_type"] = "all"
    df1_co2["subcategory_type"] = "all"
    df1_co2["enginee_type"] = "all"

    # for non-CO2
    # Restructure
    # select the rows that applied to non-CO2 gases
    df1_nonCO2 = df1[40:-3]
    df1_nonCO2.reset_index(drop=True, inplace=True)

    # Rename columns
    df1_nonCO2.columns = [
        "NA",
        "actor_id",
        "fuel_type",
        "subcategory_type",
        "enginee_type",
        "CH4_EF",
        "CH4_units",
        "N2O_EF",
        "units",
    ]

    # drop the first two rows
    df1_nonCO2 = df1_nonCO2[2:]

    # Drop empty columns
    df1_nonCO2 = df1_nonCO2.drop(columns=["NA", "CH4_units"])

    # standardize fuel names
    df1_nonCO2["fuel_type"] = df1_nonCO2["fuel_type"].replace(fuel_mapping)

    df1_nonCO2 = df1_nonCO2.melt(
        id_vars=["actor_id", "fuel_type", "subcategory_type", "enginee_type", "units"],
        value_vars=["CH4_EF", "N2O_EF"],
        var_name="gas",
        value_name="emissions_per_activity",
    )

    # Rename gases
    df1_nonCO2["gas"] = df1_nonCO2["gas"].replace({"CH4_EF": "CH4", "N2O_EF": "N2O"})

    # assign "GPC_refno" using the mapping dic
    df1_nonCO2["gpc_reference_number"] = df1_nonCO2["subcategory_type"].map(
        transport_type_to_gpc
    )

    # explode the gpc_reference_number column
    df1_nonCO2 = df1_nonCO2.explode("gpc_reference_number", ignore_index=True)

    # assign 'transport_type'
    for index, row in df1_nonCO2.iterrows():
        subcategory_type = row["subcategory_type"]
        gpc_reference_number = row["gpc_reference_number"]

        if subcategory_type in transport_type_from_source_to_cc:
            if (
                gpc_reference_number
                in transport_type_from_source_to_cc[subcategory_type]
            ):
                df1_nonCO2.at[index, "transport_type"] = (
                    transport_type_from_source_to_cc[subcategory_type][
                        gpc_reference_number
                    ]
                )

    # explode the 'transport_type' column
    df1_nonCO2 = df1_nonCO2.explode("transport_type", ignore_index=True)

    # assign 'all' to vehicle_type == nan
    df1_nonCO2["enginee_type"] = df1_nonCO2["enginee_type"].fillna("all")

    # Concatenate all the dfs
    df1 = pd.concat([df1_nonCO2, df1_co2], ignore_index=True)

    # change other1 to world -> generic values
    df1["actor_id"] = df1["actor_id"].replace(["Other", "Other1"], "world")

    # assign 'region' name using actor_id mapping
    df1["region"] = df1["actor_id"].map(actor_id_to_region)

    # assign 'reference' information using actor_id mapping
    df1["reference"] = df1["actor_id"].map(reference_from_actor_id)

    # assign "methodology_name"
    df1["methodology_name"] = "fuel_sales"

    # year column
    df1["year"] = ""

    ## Units conversion
    # Apply conversions function in volume units
    tmp1 = conversions(df1, "kg/L", "kg/m3", 1e3, "emissions_per_activity * L:m3")
    tmp2 = conversions(df1, "kg/m3", "kg/L", 1e-3, "emissions_per_activity * m3:L")
    tmp3 = conversions(
        df1, "g/US Gallon", "kg/US Gallon", 1e-3, "emissions_per_activity * g:kg"
    )

    # Concatenate all the dfs
    df1 = pd.concat([df1, tmp1, tmp2, tmp3], ignore_index=True)

    # convert US Gallon to L and m3
    tmp4 = conversions(
        df1, "kg/US Gallon", "kg/L", 1 / 3.785, "emissions_per_activity * US Gallon:L"
    )
    tmp5 = conversions(
        df1, "kg/US Gallon", "kg/m3", 1 / 0.004, "emissions_per_activity * US Gallon:m3"
    )

    # convert scf to L and m3
    tmp6 = conversions(
        df1, "kg/scf", "kg/L", 1 / 28.317, "emissions_per_activity * scf:L"
    )
    tmp7 = conversions(
        df1, "kg/scf", "kg/m3", 1 / 0.028, "emissions_per_activity * scf:m3"
    )

    # Concatenate all the dfs
    df1 = pd.concat([df1, tmp4, tmp5, tmp6, tmp7], ignore_index=True)

    # dic to df
    conversion_df = pd.DataFrame(conversions_factors).T

    # assign NCV and density values
    df1.loc[df1["units"] == "kg/TJ", "NCV"] = df1.loc[
        df1["units"] == "kg/TJ", "fuel_type"
    ].map(conversion_df["NCV"])
    df1.loc[df1["units"] == "kg/TJ", "density"] = df1.loc[
        df1["units"] == "kg/TJ", "fuel_type"
    ].map(conversion_df["density"])

    tmp8 = df1.loc[(df1["units"] == "kg/TJ") & (df1["NCV"].notna())].copy()
    tmp8.loc[:, "emissions_per_activity"] *= tmp8["NCV"]
    tmp8.loc[:, "units"] = "kg/kg"
    tmp8.loc[:, "calculation_type"] = "emissions_per_activity * NCV"

    tmp9 = tmp8.loc[tmp8["density"].notna()].copy()
    tmp9.loc[:, "emissions_per_activity"] *= tmp9["density"]
    tmp9.loc[:, "units"] = "kg/m3"
    tmp9.loc[:, "calculation_type"] = "emissions_per_activity * NCV * density"

    # Concatenate all the dfs
    df1 = pd.concat([df1, tmp8, tmp9], ignore_index=True)

    df1 = df1[df1["emissions_per_activity"] != 0]

    # add 'transport_id' and 'fuel_id'
    df1['fuel_id'] = df1['fuel_type'].map(fuel_to_fuel_ids_mapping)
    df1['transport_id'] = df1['transport_type'].map(transport_type_to_transport_ids_mapping)

    # create a 'metadata' column
    # df1["metadata"] = df1.apply(
    #     lambda row: f"fuel_type:{row['fuel_id']}, transport_type:{row['transport_id']}, subcategory_type:{row['subcategory_type']}, 'enginee_type':{row['enginee_type']}, 'calculation_type':{row['calculation_type']}",
    #     axis=1,
    # )

    df1["metadata"] = df1.apply(
        lambda row: {
            "fuel_type": row['fuel_id'] if not pd.isna(row['fuel_id']) else None,
            "transport_type": row['transport_id'] if not pd.isna(row['transport_id']) else None,
            "subcategory_type": row['subcategory_type'] if not pd.isna(row['subcategory_type']) else None,
            "enginee_type": row['enginee_type'] if not pd.isna(row['enginee_type']) else None,
            "calculation_type": row['calculation_type'] if not pd.isna(row['calculation_type']) else None,
        },
        axis=1,
    )

    df1["metadata"] = df1["metadata"].apply(json.dumps)


    # drop columns
    df1.drop(
        columns=[
            "transport_type",
            "subcategory_type",
            "enginee_type",
            "calculation_type",
            "fuel_type",
            "NCV",
            "density",
            'fuel_id',
            'transport_id'
        ],
        inplace=True,
    )

    ##---------------------------------------------------------
    ## Emission Factors - Distance
    ##---------------------------------------------------------
    # read the sheet
    df2 = pd.read_excel(input_fl, sheet_name="Mobile Combustion - Freight", header=2)

    # restructure
    df_1 = df2[:60]

    # drop non-EFs rows
    df_1 = df_1.drop([0, 55])

    # drop empty columns
    df_1.drop(columns=["Unnamed: 0", "Unnamed: 8", "Unnamed: 9"], inplace=True)

    # rename columns
    df_1.columns = [
        "actor_id",
        "subcategory_type",
        "subcategory_type2",
        "weight",
        "fuel_type",
        "emissions_per_activity",
        "units",
    ]

    # assign gas value
    df_1["gas"] = "CO2"

    # for non-CO2
    df_2 = df2[75:134]

    # drop non-EFs row
    df_2 = df_2.drop([129])

    # drop empty columns
    df_2.drop(columns=["Unnamed: 0"], inplace=True)

    # rename columns
    df_2.columns = [
        "actor_id",
        "subcategory_type",
        "subcategory_type2",
        "weight",
        "fuel_type",
        "CH4",
        "units",
        "N2O",
        "units2",
    ]

    # change the format
    df_2 = pd.melt(
        df_2,
        id_vars=[
            "actor_id",
            "subcategory_type",
            "subcategory_type2",
            "weight",
            "fuel_type",
            "units",
        ],
        value_vars=["CH4", "N2O"],
        var_name="gas",
        value_name="emissions_per_activity",
    )

    # Concatenate all the dfs
    df2 = pd.concat([df_1, df_2], ignore_index=True)

    # Assign 'all' when different features are generic to a specific EF
    df2[["subcategory_type", "subcategory_type2", "weight", "fuel_type"]] = df2[
        ["subcategory_type", "subcategory_type2", "weight", "fuel_type"]
    ].fillna("all")

    # apply unit conversions
    tmp10 = conversions(
        df2, "g/tonne-kilometer", "kg/ton-km", 1e-3, "emissions_per_activity * g:kg"
    )
    tmp11 = conversions(
        df2,
        "g/short ton-mile",
        "kg/short ton-mile",
        1e-3,
        "emissions_per_activity * g:kg",
    )
    tmp12 = conversions(
        df2, "g/vehicle-mile", "kg/vehicle-mile", 1e-3, "emissions_per_activity * g:kg"
    )

    tmp13 = conversions(
        df2,
        "kg/short ton-mile",
        "kg/kg-km",
        (1 / 907.19) * (1 / 1.609),
        "emissions_per_activity * short ton:kg and mile:km",
    )
    tmp14 = conversions(
        df2, "kg/vehicle-mile", "kg/km", 1 / 1.609, "emissions_per_activity * mile:km"
    )

    tmp15 = conversions(
        df2,
        "g/tonne-kilometer",
        "kg/kg-km",
        1,
        "emissions_per_activity * g:kg and tonne:kg",
    )
    tmp16 = conversions(
        df2,
        "g/short ton-mile",
        "kg/kg-km",
        1e-3 * (1 / 907.19) * (1 / 1.609),
        "emissions_per_activity * g:kg, short tone to kg and mile to km",
    )
    tmp17 = conversions(
        df2,
        "g/vehicle-mile",
        "kg/km",
        1e-3 * (1 / 1.609),
        "emissions_per_activity * g:kg and mile:km",
    )

    # Concatenate all the dfs
    df2 = pd.concat(
        [tmp10, tmp11, tmp12, tmp13, tmp14, tmp15, tmp16, tmp17], ignore_index=True
    )

    # generic EF
    df_w = df2.loc[df2["actor_id"] == "US"].copy()

    # assign actor id
    df_w["actor_id"] = "world"
    df2 = pd.concat([df2, df_w], ignore_index=True)

    # assign 'region' name using actor_id mapping
    df2["region"] = df2["actor_id"].map(actor_id_to_region)

    # assign 'gpc_reference_number' using transport_type_to_gpc mapping
    df2["gpc_reference_number"] = df2["subcategory_type"].map(transport_type_to_gpc)

    # explode the gpc_reference_number column
    df2 = df2.explode("gpc_reference_number", ignore_index=True)

    # assign 'transport_type'
    for index, row in df2.iterrows():
        subcategory_type = row["subcategory_type"]
        gpc_reference_number = row["gpc_reference_number"]

        if subcategory_type in transport_type_from_source_to_cc:
            if (
                gpc_reference_number
                in transport_type_from_source_to_cc[subcategory_type]
            ):
                # Update the value in the DataFrame at the current index
                df2.at[index, "transport_type"] = transport_type_from_source_to_cc[
                    subcategory_type
                ][gpc_reference_number]

    # explode the 'transport_type' column
    df2 = df2.explode("transport_type", ignore_index=True)

    # assign 'gpc_reference_number' using gpc_to_methodologies mapping
    df2["methodology_name"] = df2["gpc_reference_number"].map(gpc_to_methodologies)

    # explode the gpc_reference_number column
    df2 = df2.explode("methodology_name", ignore_index=True)

    # assign 'reference' information using actor_id mapping
    df2["reference"] = df2["actor_id"].map(reference_from_actor_id)

    # year column
    df2["year"] = ""

    # add 'transport_id' and 'fuel_id'
    df2['fuel_id'] = df2['fuel_type'].map(fuel_to_fuel_ids_mapping)
    df2['transport_id'] = df2['transport_type'].map(transport_type_to_transport_ids_mapping)

    # create a 'metadata' column
    # df2["metadata"] = df2.apply(
    #     lambda row: f"fuel_type:{row['fuel_id']}, transport_type:{row['transport_id']}, subcategory_type:{row['subcategory_type']}, 'weight':{row['weight']}, 'calculation_type':{row['calculation_type']}",
    #     axis=1,
    # )

    df2["metadata"] = df2.apply(
        lambda row: {
            "fuel_type": row['fuel_id'] if not pd.isna(row['fuel_id']) else None,
            "transport_type": row['transport_id'] if not pd.isna(row['transport_id']) else None,
            "subcategory_type": row['subcategory_type'] if not pd.isna(row['subcategory_type']) else None,
            "weight": row['weight'] if not pd.isna(row['weight']) else None,
            "calculation_type": row['calculation_type'] if not pd.isna(row['calculation_type']) else None,
        },
        axis=1,
    )

    df2["metadata"] = df2["metadata"].apply(json.dumps)

    # drop columns
    df2.drop(
        columns=[
            "transport_type",
            "subcategory_type",
            "weight",
            "calculation_type",
            "fuel_type",
            "subcategory_type2",
            "fuel_id",
            "transport_id"
        ],
        inplace=True,
    )

    ##---------------------------------------------------------
    ## Emission Factors - Public
    ##---------------------------------------------------------
    # read the sheet
    df3 = pd.read_excel(input_fl, sheet_name="Mobile Combustion - Public")

    df3 = df3[5:37]

    # drop non-EFs row
    df3 = df3.drop([33])

    # drop empty columns
    df3.drop(columns=["Unnamed: 0"], inplace=True)

    # rename columns
    df3.columns = [
        "actor_id",
        "subcategory_type",
        "subcategory_type2",
        "CO2",
        "CO2_units",
        "CH4",
        "CH4_units",
        "N2O",
        "N2O_units",
    ]

    # change format
    df3 = pd.melt(
        df3,
        id_vars=[
            "actor_id",
            "subcategory_type",
            "subcategory_type2",
            "CO2_units",
            "CH4_units",
            "N2O_units",
        ],
        value_vars=["CO2", "CH4", "N2O"],
        var_name="gas",
        value_name="emissions_per_activity",
    )

    # list of gases and their respective units
    gases = ["CO2", "CH4", "N2O"]
    unit_columns = ["CO2_units", "CH4_units", "N2O_units"]

    # Create an empty list to hold the individual gas DataFrames
    df_list = []

    # Loop through each gas and perform the operations
    for gas in gases:
        # Filter rows for the current gas
        df_gas = df3.loc[df3["gas"] == gas].copy()

        # Drop unit columns for other gases
        cols_to_drop = [col for col in unit_columns if col != f"{gas}_units"]
        df_gas = df_gas.drop(cols_to_drop, axis=1)

        # Rename the units column
        df_gas = df_gas.rename(columns={f"{gas}_units": "units"})

        # Append the DataFrame for the current gas to the list
        df_list.append(df_gas)

    # Concatenate all the dfs
    df3 = pd.concat(df_list, ignore_index=True)

    # apply unit conversions
    tmp10 = conversions(
        df3,
        "kg/passenger-mile",
        "kg/passenger-km",
        (1 / 1.609),
        "emissions_per_activity * mile:km",
    )
    tmp12 = conversions(
        df3,
        "kg/vehicle-mile",
        "kg/vehicle-km",
        (1 / 1.609),
        "emissions_per_activity * mile:km",
    )
    tmp13 = conversions(
        df3,
        "g/passenger-kilometer",
        "kg/passenger-kilometer",
        1e-3,
        "emissions_per_activity * g:kg",
    )
    tmp14 = conversions(
        df3,
        "g/passenger-mile",
        "kg/passenger-km",
        1e-3,
        "emissions_per_activity * g:kg",
    )
    tmp15 = conversions(
        df3, "g/vehicle-mile", "kg/vehicle-km", 1e-3, "emissions_per_activity * g:kg"
    )
    tmp16 = conversions(
        df3,
        "g/passenger-mile",
        "kg/passenger-km",
        1e-3 * (1 / 1.609),
        "emissions_per_activity * g:kg and mile:km",
    )
    tmp17 = conversions(
        df3,
        "g/vehicle-mile",
        "kg/vehicle-km",
        1e-3 * (1 / 1.609),
        "emissions_per_activity * g:kg and mile:km",
    )

    # Concatenate all the dfs
    df3 = pd.concat(
        [tmp10, tmp11, tmp12, tmp13, tmp14, tmp15, tmp16, tmp17], ignore_index=True
    )

    # generic values
    df_w = df3.loc[df3["actor_id"] == "US"].copy()

    # assign actor id
    df_w["actor_id"] = "world"
    df3 = pd.concat([df3, df_w], ignore_index=True)

    # assign 'region' name using actor_id mapping
    df3["region"] = df3["actor_id"].map(actor_id_to_region)

    # assign 'gpc_reference_number' using transport_type_to_gpc mapping
    df3["gpc_reference_number"] = df3["subcategory_type"].map(transport_type_to_gpc)

    # explode the gpc_reference_number column
    df3 = df3.explode("gpc_reference_number", ignore_index=True)

    # assign 'transport_type'
    for index, row in df3.iterrows():
        subcategory_type = row["subcategory_type"]
        gpc_reference_number = row["gpc_reference_number"]

        if subcategory_type in transport_type_from_source_to_cc:
            if (
                gpc_reference_number
                in transport_type_from_source_to_cc[subcategory_type]
            ):
                # Update the value in the DataFrame at the current index
                df3.at[index, "transport_type"] = transport_type_from_source_to_cc[
                    subcategory_type
                ][gpc_reference_number]

    # explode the 'transport_type' column
    df3 = df3.explode("transport_type", ignore_index=True)

    # assign 'gpc_reference_number' using gpc_to_methodologies mapping
    df3["methodology_name"] = df3["gpc_reference_number"].map(gpc_to_methodologies)

    # explode the gpc_reference_number column
    df3 = df3.explode("methodology_name", ignore_index=True)

    # assign 'reference' information using actor_id mapping
    df3["reference"] = df3["actor_id"].map(reference_from_actor_id)

    # year column
    df3["year"] = ""

    df3[["transport_type", "subcategory_type", "weight", "fuel_type"]] = df3[
        ["transport_type", "subcategory_type", "weight", "fuel_type"]
    ].fillna("all")

    # add 'transport_id' and 'fuel_id'
    df3['transport_id'] = df3['transport_type'].map(transport_type_to_transport_ids_mapping)

    # create a 'metadata' column
    # df3["metadata"] = df3.apply(
    #     lambda row: f"fuel_type:{row['fuel_type']}, transport_type:{row['transport_id']}, subcategory_type:{row['subcategory_type']}, 'weight':{row['weight']}, 'calculation_type':{row['calculation_type']}",
    #     axis=1,
    # )

    df3["metadata"] = df3.apply(
        lambda row: {
            "fuel_type": row['fuel_type'] if not pd.isna(row['fuel_type']) else None,
            "transport_type": row['transport_id'] if not pd.isna(row['transport_id']) else None,
            "subcategory_type": row['subcategory_type'] if not pd.isna(row['subcategory_type']) else None,
            "weight": row['weight'] if not pd.isna(row['weight']) else None,
            "calculation_type": row['calculation_type'] if not pd.isna(row['calculation_type']) else None,
        },
        axis=1,
    )

    df3["metadata"] = df3["metadata"].apply(json.dumps)

    # drop columns
    df3.drop(
        columns=[
            "transport_type",
            "subcategory_type",
            "subcategory_type2",
            "weight",
            "calculation_type",
            "fuel_type",
            "transport_id"
        ],
        inplace=True,
    )

    ## FINAL DF
    final_df = pd.concat([df1, df2, df3], ignore_index=True)

    # Apply the replacement to the 'units' column
    final_df["units"] = final_df["units"].replace(unit_replacements)

    # ensure there are no mull methdologies
    final_df = final_df[final_df["methodology_name"].notnull() & (final_df["methodology_name"] != "")]

    # methodology_name
    final_df["methodology_name"] = final_df["methodology_name"].str.replace("_", "-")

    final_df["methodology_id"] = final_df["methodology_name"].apply(uuid_generate_v3)

    final_df["id"] = final_df.apply(lambda row: uuid_generate_v4(), axis=1)

    final_df.to_csv(f"{output_dir}/EmissionsFactor.csv", index=False)

    # =================================================================
    # DataSourceEmissionsFactor
    # =================================================================
    datasource_emissions_factor_data = [
        {
            "datasource_id": datasource_data.get("datasource_id"),
            "emissions_factor_id": id,
        }
        for id in final_df["id"]
    ]

    write_dic_to_csv(
        output_dir, "DataSourceEmissionsFactor", datasource_emissions_factor_data
    )
