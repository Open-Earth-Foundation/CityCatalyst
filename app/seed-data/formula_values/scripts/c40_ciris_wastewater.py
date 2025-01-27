import os
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

if __name__ == "__main__":
    # set random.seed so UUID is reproducible
    #! assumes records always generated in same order
    seed_string = get_filename()
    seed_value = string_to_hash(seed_string)
    set_seed(seed_value)

    # output directory
    output_dir = "../data_processed/C40_CIRIS/"
    output_dir = os.path.abspath(output_dir)
    make_dir(path=Path(output_dir).as_posix())

    # raw data file path
    input_fl = "../data_raw/C40_CIRIS/mcf_values_c40.csv"
    input_fl = os.path.abspath(input_fl)

    # =================================================================
    # Publisher
    # =================================================================
    publisher_data = {
        "name": "C40",
        "URL": "https://www.c40.org/",
    }
    publisher_data["publisher_id"] = uuid_generate_v3(name=publisher_data.get("name"))

    write_dic_to_csv('.', "Publisher", publisher_data)

    # =================================================================
    # DataSource
    # =================================================================
    datasource_data = {
        "datasource_name": "C40",
        "dataset_name": "CIRIS - default MCF",
        "URL": "https://www.c40knowledgehub.org/s/article/City-Inventory-Reporting-and-Information-System-CIRIS?language=en_US",
        "publisher_id": publisher_data.get("publisher_id"),
    }
    datasource_data["datasource_id"] = uuid_generate_v3(
        name=datasource_data.get("dataset_name")
    )

    write_dic_to_csv('.', "DataSource", datasource_data)

    df = pd.read_csv(input_fl)

    #rename columns
    df.rename(columns={'Treatment': 'treatment-status', 'Name treatment': 'treatment-name', 'Type of treatment': 'treatment-type', 'VALUE': 'formula_input_value', 'source': 'datasource'}, inplace=True)

    df.fillna("None", inplace=True)

    treatment_status = {
        "Non-treated": "treatment-status-type-wastewater-untreated",
        "Treated": "treatment-status-type-wastewater-treated"
    }
    df['treatment-status'] = df['treatment-status'].map(treatment_status)

    treatment_name = {
        "None": "treatment-name-none",
        "Sewer": "treatment-name-sewer",
        "Septic System": "treatment-name-septic-system",
        "Latrine": "treatment-name-latrine",
        "Other": "treatment-name-other"
    }
    df['treatment-name'] = df['treatment-name'].map(treatment_name)

    treatment_type = {
        "Sea, river and lake discharge": "treatment-type-sea-river-lake-discharge", 
        "Stagnant sewer": "treatment-type-stagnant-sewer", 
        "Septic System": "treatment-type-septic-system",
        "Latrine - dry climate": "treatment-type-latrine-dry-climate",
        "Latrine": "treatment-type-latrine", 
        "Latrine -  wet climate": "treatment-type-latrine-wet-climate",
        "Latrine - sediment removal": "treatment-type-latrine-sediment-removal", 
        "Aerobic treat-ment plant": "treatment-type-centralized-aerobic-treatment-plan-well-managed",
        "Anaerobic digester: sludge": "treatment-type-anaerobic-digester-for-sludge", 
        "Anaerobic reactor": "treatment-type-anaerobic-reactor",
        "Anaerobic shallow lagoon": "treatment-type-anaerobic-shallow-lagoon", 
        "Anaerobic deep lagoon": "treatment-type-anaerobic-deep-lagoon"
    }
    df['treatment-type'] = df['treatment-type'].map(treatment_type)

    # create metadata column
    df["metadata"] = df.apply(
        lambda row: {
            "treatment-status": row["treatment-status"],
            "treatment-name": row["treatment-name"],
            "treatment-type": row["treatment-type"]
        },
        axis=1,
    )

    # drop columns
    df.drop(columns=['treatment-status', 'treatment-name', 'treatment-type'], inplace=True)

    # assign column names
    df['gas'] = 'CH4'
    df['parameter_code'] = 'MCF'
    df['parameter_name'] = 'methane_conversion_factor'
    df['year'] = ''
    df['formula_input_units'] = 'fraction'
    df['region'] = 'world'
    df['actor_id'] = 'world'
    df['rnk'] = 1

    tmp1 = df.copy()
    tmp1['methodology_name'] = 'wastewater-inside-domestic-calculator-activity'
    tmp1['gpc_refno'] = 'III.4.1'
    tmp1['formula_name'] = 'domestic-wastewater'

    tmp2 = df.copy()
    tmp2['methodology_name'] = 'wastewater-outside-domestic-calculator-activity'
    tmp2['gpc_refno'] = 'III.4.2'
    tmp2['formula_name'] = 'domestic-wastewater'

    tmp3 = df.copy()
    tmp3['methodology_name'] = 'wastewater-inside-industrial-calculator-activity'
    tmp3['gpc_refno'] = 'III.4.1'
    tmp3['formula_name'] = 'industral-wastewater'

    tmp4 = df.copy()
    tmp4['methodology_name'] = 'wastewater-outside-industrial-calculator-activity'
    tmp4['gpc_refno'] = 'III.4.2'
    tmp4['formula_name'] = 'industral-wastewater'

    df_f = pd.concat([tmp1, tmp2, tmp3, tmp4], ignore_index=True)

    # Assign UUIDs
    df_f['methodology_id'] = df_f['methodology_name'].apply(uuid_generate_v3)

    df_f["formulainput_id"] = df_f.apply(lambda row: uuid_generate_v4(), axis=1)

    df_f.to_csv(
        f"./FormulaInputs.csv", index=False
    )

    # =================================================================
    # DataSourceEmissionsFactor
    # =================================================================
    datasource_emissions_factor_data = [
        {
            "datasource_id": datasource_data.get("datasource_id"),
            "formulainput_id": id,
        }
        for id in df_f["formulainput_id"]
    ]

    write_dic_to_csv(
        '.', "DataSourceFormulaInput", datasource_emissions_factor_data
    )