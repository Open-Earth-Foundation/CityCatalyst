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
    output_dir = "../data_processed/FAOSTAT/"
    output_dir = os.path.abspath(output_dir)
    make_dir(path=Path(output_dir).as_posix())

    # raw data file path
    input_fl = "../data_raw/FAOSTAT/protein_consumption_FAO.csv"
    input_fl = os.path.abspath(input_fl)

    # =================================================================
    # Publisher
    # =================================================================
    publisher_data = {
        "name": "FAO",
        "URL": "https://www.fao.org/home/en",
    }
    publisher_data["publisher_id"] = uuid_generate_v3(name=publisher_data.get("name"))

    write_dic_to_csv(output_dir, "Publisher", publisher_data)

    # =================================================================
    # DataSource
    # =================================================================
    datasource_data = {
        "datasource_name": "FAO",
        "dataset_name": "FAOSTAT - Protein Consumption",
        "URL": "https://www.fao.org/faostat/en/#data/HS",
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
            "wastewater-inside-domestic-calculator-activity",
            "wastewater-outside-domestic-calculator-activity"
        ]

    methodology_data_list = []

    for methodology in methodologies:
            methodology_data = {
                "methodology_id": uuid_generate_v3(methodology),
                "methodology": methodology,
                "methodology_url": "",  # Add the URL if needed
                "datasource_id": datasource_data.get("datasource_id")
            }
            methodology_data_list.append(methodology_data)

    # Write data to CSV
    write_dic_to_csv(output_dir, "Methodology", methodology_data_list)

    # =================================================================
    # Formula Input Values
    # =================================================================

    df = pd.read_csv(input_fl)

    df = df[2:]

    # Assign LOCODES to country names
    un_locode = {
        "Afghanistan": "AF",
        "Albania": "AL",
        "Algeria": "DZ",
        "Angola": "AO",
        "Argentina": "AR",
        "Armenia": "AM",
        "Australia": "AU",
        "Austria": "AT",
        "Azerbaijan": "AZ",
        "Bangladesh": "BD",
        "Barbados": "BB",
        "Belarus": "BY",
        "Belgium": "BE",
        "Belize": "BZ",
        "Benin": "BJ",
        "Bermuda": "BM",
        "Bolivia (Plurinational State of)": "BO",
        "Bosnia and Herzegovina": "BA",
        "Botswana": "BW",
        "Brazil": "BR",
        "Brunei Darussalam": "BN",
        "Bulgaria": "BG",
        "Burkina Faso": "BF",
        "Cabo Verde": "CV",
        "Cambodia": "KH",
        "Cameroon": "CM",
        "Canada": "CA",
        "Central African Republic": "CF",
        "Chad": "TD",
        "Chile": "CL",
        "China": "CN",
        "Colombia": "CO",
        "Congo": "CG",
        "Costa Rica": "CR",
        "Côte d'Ivoire": "CI",
        "Croatia": "HR",
        "Cuba": "CU",
        "Cyprus": "CY",
        "Czech Republic": "CZ",
        "Democratic People's Republic of Korea": "KP",
        "Denmark": "DK",
        "Djibouti": "DJ",
        "Dominica": "DM",
        "Dominican Republic": "DO",
        "Ecuador": "EC",
        "Egypt": "EG",
        "El Salvador": "SV",
        "Estonia": "EE",
        "Ethiopia": "ET",
        "Fiji": "FJ",
        "Finland": "FI",
        "France": "FR",
        "Gabon": "GA",
        "Gambia": "GM",
        "Georgia": "GE",
        "Germany": "DE",
        "Ghana": "GH",
        "Greece": "GR",
        "Guatemala": "GT",
        "Guinea": "GN",
        "Guinea-Bissau": "GW",
        "Guyana": "GY",
        "Haiti": "HT",
        "Honduras": "HN",
        "Hungary": "HU",
        "Iceland": "IS",
        "India": "IN",
        "Indonesia": "ID",
        "Iran (Islamic Republic of)": "IR",
        "Iraq": "IQ",
        "Ireland": "IE",
        "Israel": "IL",
        "Italy": "IT",
        "Jamaica": "JM",
        "Japan": "JP",
        "Jordan": "JO",
        "Kazakhstan": "KZ",
        "Kenya": "KE",
        "Kiribati": "KI",
        "Kuwait": "KW",
        "Kyrgyzstan": "KG",
        "Lao People's Democratic Republic": "LA",
        "Latvia": "LV",
        "Lebanon": "LB",
        "Lesotho": "LS",
        "Liberia": "LR",
        "Lithuania": "LT",
        "Luxembourg": "LU",
        "Madagascar": "MG",
        "Malawi": "MW",
        "Malaysia": "MY",
        "Maldives": "MV",
        "Mali": "ML",
        "Malta": "MT",
        "Mauritania": "MR",
        "Mauritius": "MU",
        "Mexico": "MX",
        "Mongolia": "MN",
        "Montenegro": "ME",
        "Morocco": "MA",
        "Mozambique": "MZ",
        "Myanmar": "MM",
        "Namibia": "NA",
        "Nepal": "NP",
        "Netherlands": "NL",
        "New Zealand": "NZ",
        "Nicaragua": "NI",
        "Niger": "NE",
        "Nigeria": "NG",
        "Norway": "NO",
        "Oman": "OM",
        "Pakistan": "PK",
        "Panama": "PA",
        "Paraguay": "PY",
        "Peru": "PE",
        "Philippines": "PH",
        "Poland": "PL",
        "Portugal": "PT",
        "Republic of Korea": "KR",
        "Republic of Moldova": "MD",
        "Romania": "RO",
        "Russian Federation": "RU",
        "Rwanda": "RW",
        "Saint Kitts and Nevis": "KN",
        "Saint Vincent and the Grenadines": "VC",
        "Samoa": "WS",
        "Sao Tome and Principe": "ST",
        "Saudi Arabia": "SA",
        "Senegal": "SN",
        "Serbia": "RS",
        "Sierra Leone": "SL",
        "Slovakia": "SK",
        "Slovenia": "SI",
        "Solomon Islands": "SB",
        "South Africa": "ZA",
        "Spain": "ES",
        "Sri Lanka": "LK",
        "Sudan (former)": "SD",
        "Suriname": "SR",
        "Swaziland": "SZ",
        "Sweden": "SE",
        "Switzerland": "CH",
        "Tajikistan": "TJ",
        "Thailand": "TH",
        "The former Yugoslav Republic of Macedonia": "MK",
        "Timor-Leste": "TL",
        "Togo": "TG",
        "Trinidad and Tobago": "TT",
        "Tunisia": "TN",
        "Turkey": "TR",
        "Turkmenistan": "TM",
        "Uganda": "UG",
        "Ukraine": "UA",
        "United Arab Emirates": "AE",
        "United Kingdom": "GB",
        "United Republic of Tanzania": "TZ",
        "United States of America": "US",
        "Uruguay": "UY",
        "Uzbekistan": "UZ",
        "Vanuatu": "VU",
        "Venezuela (Bolivarian Republic of)": "VE",
        "Viet Nam": "VN",
        "Yemen": "YE",
        "Zambia": "ZM",
        "Zimbabwe": "ZW"
    }

    df['actor_id'] = df['Country'].map(un_locode)

    # Assign extra columns
    df['gas'] = 'N2O' 
    df['parameter_code'] = 'protein' 
    df['parameter_name'] = 'protein_consumption'
    df['year'] = ''
    df['formula_name'] = 'domestic-wastewater'
    df['metadata'] = '' 
    df['rnk'] = 1

    # Rename columns
    df.rename(columns={'Protein': 'formula_input_value', 'Country': 'region', 'units': 'formula_input_units', 'source': 'datasource'}, inplace=True)

    # Applying to inside and outside domestic wastewater
    tmp = df.copy()
    tmp['methodology_name'] = 'wastewater-inside-domestic-calculator-activity'
    tmp['gpc_refno'] = 'III.4.1'

    df['methodology_name'] = 'wastewater-outside-domestic-calculator-activity'
    df['gpc_refno'] = 'III.4.2'
    df = pd.concat([tmp, df], ignore_index=True)

    # Assign UUIDs
    df['methodology_id'] = df['methodology_name'].apply(uuid_generate_v3)

    df["formulainput_id"] = df.apply(lambda row: uuid_generate_v4(), axis=1)

    df.to_csv(
        f"{output_dir}/FormulaInputs.csv", index=False
    )

    # =================================================================
    # DataSourceEmissionsFactor
    # =================================================================
    datasource_emissions_factor_data = [
        {
            "datasource_id": datasource_data.get("datasource_id"),
            "formulainput_id": id,
        }
        for id in df["formulainput_id"]
    ]

    write_dic_to_csv(
        output_dir, "DataSourceFormulaInput", datasource_emissions_factor_data
    )
