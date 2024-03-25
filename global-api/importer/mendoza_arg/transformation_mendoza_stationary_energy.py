import pandas as pd
import argparse
import glob
import uuid
import os

def uuid_generate_v3(name, namespace=uuid.NAMESPACE_OID):
    """generate a version 3 UUID from namespace and name"""
    assert isinstance(name, str), "name needs to be a string"
    assert isinstance(namespace, uuid.UUID), "namespace needs to be a uuid.UUID"
    return str(uuid.uuid3(namespace, name))

def read_excel(path):
    # load the Excel file without reading any specific sheet
    xls = pd.ExcelFile(path, engine='openpyxl')

    # get a list of all sheet names
    names = xls.sheet_names
    
    sheet_name = [name for name in names if 'Electricidad' in name]
    df = pd.read_excel(path, sheet_name = sheet_name[0])
    
    return df

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Transform files with a specified location.')
    parser.add_argument("--filepath", help="path to the files location", required=True)
    args = parser.parse_args()

    absolute_path = os.path.abspath(args.filepath)
    paths = glob.glob(f'{absolute_path}/*')

    #------------------------------------------------------------------------
    ### Electricity consumption
    #------------------------------------------------------------------------
    def reshape_df(df):
        # Reshape a DataFrame 
        tmp = pd.melt(
            df,
            id_vars=['year'],
            var_name='activity_name',
            value_name='activity_value'
        )
        return tmp

    def replace_val(df):
        df.replace('-', 0, inplace=True)
        df.replace(' -', 0, inplace=True)
        
        return df

    column_names = ['year',
                    'total_provincial',
                    'total',
                    'residential_provincial',
                    'residential',
                    'general_provincial',
                    'general',
                    'street_lighting_provincial',
                    'street_lighting',
                    'agricultural_irrigation_provincial',
                    'agricultural_irrigation',
                    'grandes_demandas_provincial',
                    'grandes_demandas']

    sector_dic = {
        'residential': 'I.1.2',
        'commercial': 'I.2.2',
        'agricultural_irrigation': 'I.5.2',
        'grandes_demandas': 'I.3.2'
    }

    result_df1 = pd.DataFrame()

    for path in paths:
        try:
            df = read_excel(path)

            # selection of the rows based on the file structure
            if "Maipu" in path:
                df = df.loc[32:41,]
            else:
                df = df.loc[36:45,]

            df.columns = column_names
            df = df.reset_index(drop=True)

            # adding up the commercial and public energy consumption
            df['commercial'] = df['general'] + df['street_lighting']
            df.drop(columns=['total_provincial', 'total', 'residential_provincial', 'general_provincial', 
                            'street_lighting_provincial', 'agricultural_irrigation_provincial', 
                            'grandes_demandas_provincial', 'general', 'street_lighting'],
                    inplace=True)
            df = reshape_df(df)
            df = replace_val(df)
            df['activity_units'] = 'MWh'

            # assigning gpc reference number based on the user
            for index, row in df.iterrows():
                activity_name = row['activity_name']
                if activity_name in sector_dic.keys():
                    df.at[index, 'GPC_refno'] = sector_dic[activity_name]

            # Production fuel mix factor (kgCO2 per kWh) 
            # source: https://www.carbonfootprint.com/docs/2023_02_emissions_factors_sources_for_2022_electricity_v10.pdf
            df['gas_name'] = 'CO2'
            df['emission_factor_value'] = 0.2881 
            df['emission_factor_units'] = 'kgCO2/kWh'
            df['activity_value'] = pd.to_numeric(df['activity_value'])

            # changing activity values from MWh to kWh
            df['emissions_value'] = df['activity_value']*1000
            # applying EF
            df['emissions_value'] =  df['emissions_value']* df['emission_factor_value']
            df['emissions_units'] = 'kg'
            
            # extract city name
            df['city_name'] = path.split("/")[-1][:-27]

            result_df1 = pd.concat([result_df1, df], ignore_index=True)

        except Exception as e:
            print(f"Error processing {path}: {e}")

    #------------------------------------------------------------------------
    ### Gas consumption
    ### Cubic meters of gas distributed by type of user, according to year
    #------------------------------------------------------------------------
    column_names2 = ['year',
                    'city_name',
                    'total',
                    'residential',
                    'industrial_commercial_services',
                    'subdistributors',
                    'GNC']

    column_names3 = ['year',
                    'jurisdiction',
                    'total',
                    'residencial',
                    'commercial',
                    'industrial',
                    'power_plants',
                    'subdistributors',
                    'GNC']

    result_df2 = pd.DataFrame()

    for path in paths:
        try:
            df = read_excel(path)
            city = path.split("/")[-1][:-27]
            
            # selection of the rows based on the file structure
            if city in ['Godoy_Cruz', 'Capital']:
                tmp1 = df.iloc[126:136,:7]
                tmp = df.iloc[90:110,:9]
            elif city in ['Tupungato', 'Tunuyan', 'Santa_Rosa', 'Rivadavia', 'Malargue', 'Lujan de Cuyo', 'Lavalle', 'La_Paz', 'Junin', 'Guaymallen', 'Gral San Martin', 'General_Alvear']:
                tmp1 =  df.iloc[124:134,:7]
                tmp = df.iloc[88:108,:9]
            elif city in ['San_Rafael', 'San_Carlos']:
                tmp1 = df.iloc[125:135,:7]
                tmp = df.iloc[89:109,:9]
            elif city == 'Maipu':
                tmp1 = df.iloc[120:130,:7]
                tmp = df.iloc[84:104,:9]
            else:
                tmp1 = df.iloc[123:133,:7]
                tmp = df.iloc[88:108,:9]
            
            # recent years without commercial, industrial and power plants gas consumption classification
            tmp1.columns = column_names2
            tmp1 = replace_val(tmp1)
            tmp1 = tmp1.reset_index(drop=True)
            city_name = tmp1['city_name'].iloc[1]
            tmp1 = tmp1[tmp1['city_name'] == city_name]
            tmp1['year'] = ['2018', '2019', '2020', '2021', '2022']
            
            #old years with more detail data
            tmp.columns = column_names3
            tmp = replace_val(tmp)
            
            #calculate the fraction of each sub sector
            tmp['comm_indust_pw'] = tmp['commercial'] + tmp['industrial'] + tmp['power_plants']
            tmp['commercial_frac'] = tmp['commercial']/tmp['comm_indust_pw']
            tmp['industrial_frac'] = tmp['industrial']/tmp['comm_indust_pw']
            tmp['power_plants_frac'] = tmp['power_plants']/tmp['comm_indust_pw']
            
            # fraction of gas consumption for the commercial sector
            commercial_perct = tmp[tmp['jurisdiction'] != 'Total Provincial']['commercial_frac'].mean()
            # fraction of gas consumption for the industrial sector
            industrial_perct = tmp[tmp['jurisdiction'] != 'Total Provincial']['industrial_frac'].mean()
            # fraction of gas consumption for the industrial sector
            powerplants_perct = tmp[tmp['jurisdiction'] != 'Total Provincial']['power_plants_frac'].mean()
            
            # applying the fractions for 2018 onwards
            tmp1.loc[:, 'commercial'] = pd.to_numeric(tmp1['industrial_commercial_services']) * commercial_perct
            tmp1.loc[:, 'industrial'] = pd.to_numeric(tmp1['industrial_commercial_services']) * industrial_perct
            tmp1.loc[:, 'power_plants'] = pd.to_numeric(tmp1['industrial_commercial_services']) * powerplants_perct
            
            tmp1.drop(columns=['total', 'industrial_commercial_services', 'subdistributors', 'GNC'], inplace=True)
            
            # Reshape the tmp1 DataFrame 
            tmp1 = pd.melt(
                tmp1,
                id_vars=['year', 'city_name'],
                var_name='activity_name',
                value_name='activity_value'
            )
            
            tmp1['city_name'] = city_name
            result_df2 = pd.concat([result_df2, tmp1], ignore_index=True)
        except Exception as e:
            print(f"Error processing {path}: {e}")

    # gas: 9300 kcal/m3
    # 1 kcal = 4.1858e-9 TJ
    # changing activity value from m3 to TJ
    result_df2['activity_value'] = result_df2['activity_value']*9300*4.1858*1e-9
    result_df2['activity_units'] = 'TJ'

    # emission factors dataframe for natural gas
    ef_natural_gas = pd.DataFrame()
    ef_natural_gas['gas_name'] = ['CO2', 'CH4', 'N2O']
    ef_natural_gas['gas_value'] = [56100, 5, 0.1]
    ef_natural_gas['gas_units'] = ['kg/TJ', 'kg/TJ', 'kg/TJ']
    ef_natural_gas['EF_ID'] = ['118128', '118182', '118236']

    # applying emission factors
    result_df = pd.DataFrame()

    for gas in ef_natural_gas['gas_name']:
        gas_value = pd.to_numeric(ef_natural_gas[ef_natural_gas['gas_name'] == gas]['gas_value'].iloc[0])
        
        # Create a copy of result_df1 for each gas
        temp_df = result_df2.copy()
        
        # Multiply the 'activity_value' column by the gas_value
        temp_df['emissions_value'] = temp_df['activity_value'] * gas_value
        temp_df['emissions_units'] = 'kg'
        
        # Set additional columns for this gas
        temp_df['gas_name'] = gas
        temp_df['emission_factor_value'] = ef_natural_gas[ef_natural_gas['gas_name'] == gas]['gas_value'].iloc[0]
        temp_df['emission_factor_units'] = ef_natural_gas[ef_natural_gas['gas_name'] == gas]['gas_units'].iloc[0]
        
        # Concatenate the temporary DataFrame to the result_df
        result_df = pd.concat([result_df, temp_df], ignore_index=True)

    # assigning gpc reference number based on the user
    sector_dic = {
        'residential': 'I.1.1',
        'commercial': 'I.2.1',
        'industrial': 'I.3.1'
        }
    for index, row in result_df.iterrows():
        activity_name = row['activity_name']

        if activity_name in sector_dic.keys():
            result_df.at[index, 'GPC_refno'] = sector_dic[activity_name]

    final_df = pd.concat([result_df1, result_df], ignore_index=True)

    # delete rows without data
    final_df = final_df[final_df != 0].dropna()

    # delete decimals
    columns_to_round = ['activity_value', 'emissions_value']

    # convert the specified columns to numeric type
    final_df[columns_to_round] = final_df[columns_to_round].apply(pd.to_numeric, errors='coerce')

    # round the values in the specified columns to the specified number of decimals
    final_df[columns_to_round] = final_df[columns_to_round].round(0)

    # change city names
    val_to_replace = ['Tunuyan', 'General_Alvear', 'San_Rafael', 'Santa_Rosa', 'San_Carlos', 'Maipu', 'Las_Heras',
        'Lujan de Cuyo', 'Gral San Martin', 'La_Paz', 'Malargue', 'Guaymallen', 'Godoy_Cruz', 'Junin']

    new_val = ['Tunuyán', 'Gral. Alvear', 'San Rafael', 'Santa Rosa', 'San Carlos', 'Maipú', 'Las Heras',
        'Luján de Cuyo', 'Gral. San Martín', 'La Paz', 'Malargüe', 'Guaymallén', 'Godoy Cruz','Junín']

    final_df['city_name'] = final_df['city_name'].replace(val_to_replace, new_val)
    final_df['source_name'] = 'deie_mendoza'
    final_df['temporal_granularity'] = 'annual'

    # assigning city locode based on the city name
    locode_dic = {
        'Rivadavia':'AR RIV',
        'Lavalle':'AR LAV', 
        'Capital':'AR MDZ', 
        'Tunuyán':'AR TUN', 
        'Gral. Alvear':'AR GVA', 
        'San Rafael':'AR AFA', 
        'Santa Rosa':'AR STA', 
        'San Carlos':'AR SCA',
        'Maipú':'AR MPU', 
        'Las Heras':'AR LHE',
        'Luján de Cuyo':'AR LCU', 
        'Gral. San Martín':'AR SMR', 
        'La Paz':'AR LPM', 
        'Junín':'AR NIN', 
        'Tupungato': 'Tupungato',
        'Malargüe':'AR LGS',
        'Guaymallén':'AR GYM', 
        'Godoy Cruz':'AR GCR'
    }
    for index, row in final_df.iterrows():
        city_name = row['city_name']

        if city_name in locode_dic.keys():
            final_df.at[index, 'locode'] = locode_dic[city_name]

    # assigning a unique ID to each row
    for index, row in final_df.iterrows():
        locode = str(row['locode'])
        emissions_value = str(row['emissions_value'])
        year = str(row['year'])
        gas = str(row['gas_name'])
        GPC_refno = str(row['GPC_refno'])

        id_string = locode + emissions_value + year + gas + GPC_refno

        final_df.at[index, 'id'] = uuid_generate_v3(id_string)

    final_df.to_csv(f'{absolute_path}/stationary_energy_mendoza.csv', sep=",", decimal=".", index=False)