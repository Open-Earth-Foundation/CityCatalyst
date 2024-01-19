import pandas as pd
import glob

paths = glob.glob('./downloaded_files/*')

def read_excel(path):
    # load the Excel file without reading any specific sheet
    xls = pd.ExcelFile(path)

    # get a list of all sheet names
    names = xls.sheet_names
    
    sheet_name = [name for name in names if 'Electricidad' in name]
    df = pd.read_excel(path, sheet_name = sheet_name[0])
    
    return df

#energy EF for Argentina: IPCC 2006
ef_df = pd.read_excel('./energy_EF_Argentina.xlsx')


### Electricity consumption

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

        if "Maipu" in path:
            df = df.loc[32:41,]
        else:
            df = df.loc[36:45,]

        df.columns = column_names
        df = df.reset_index(drop=True)
        df['commercial'] = df['general'] + df['street_lighting']
        df.drop(columns=['total_provincial', 'total', 'residential_provincial', 'general_provincial', 
                         'street_lighting_provincial', 'agricultural_irrigation_provincial', 
                         'grandes_demandas_provincial', 'general', 'street_lighting'],
                inplace=True)
        df = reshape_df(df)
        df = replace_val(df)
        df['activity_unit'] = 'MWh'

        # assigning gpc reference number based on the user
        for index, row in df.iterrows():
            activity_name = row['activity_name']
            if activity_name in sector_dic.keys():
                df.at[index, 'GPC_ref_no'] = sector_dic[activity_name]

        # Production fuel mix factor (kgCO2e per kWh) 
        # source: https://www.carbonfootprint.com/docs/2023_02_emissions_factors_sources_for_2022_electricity_v10.pdf
        df['gas'] = 'CO2'
        df['ef_value'] = 0.2881 
        df['ef_unit'] = 'kgCO2e/kWh'
        df['activity_value'] = pd.to_numeric(df['activity_value'])
        df['emissions_value'] = (df['activity_value']*1000) * df['ef_value']
        df['emissions_unit'] = 'kg'
        
        df['city'] = path[49:-27]

        result_df1 = pd.concat([result_df1, df], ignore_index=True)
    except Exception as e:
        print(f"Error processing {path}: {e}")


### Gas consumption

# Cubic meters of gas distributed by type of user, according to year

column_names2 = ['year',
                'city',
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
    df = read_excel(path)
    city = path[49:-27]
    
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
    city_name = tmp1['city'].iloc[1]
    tmp1 = tmp1[tmp1['city'] == city_name]
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
        id_vars=['year', 'city'],
        var_name='activity_name',
        value_name='activity_value'
    )
    
    tmp1['city'] = city_name
    result_df2 = pd.concat([result_df2, tmp1], ignore_index=True)

# gas: 9300 kcal/m3
# 1 kcal = 4.1858e-9 TJ
result_df2['activity_value'] = result_df2['activity_value']*9300*4.1858*1e-9
result_df2['activity_unit'] = 'TJ'

ef_natural_gas = ef_df[(ef_df['Fuel 2006'] == 'Natural Gas')&(ef_df['IPCC 2006 Source/Sink Category'] == '1.A.4.b - Residential\n1.A.4.c.i - Stationary\n')]

gases = ['CO2', 'CH4', 'N2O']
ef_natural_gas['gas'] = gases

result_df = pd.DataFrame()

for gas in ef_natural_gas['gas']:
    gas_value = pd.to_numeric(ef_natural_gas[ef_natural_gas['gas'] == gas]['Value'].iloc[0])
    
    # Create a copy of result_df1 for each gas
    temp_df = result_df2.copy()
    
    # Multiply the 'activity_value' column by the gas_value
    temp_df['emissions_value'] = temp_df['activity_value'] * gas_value
    temp_df['emissions_unit'] = 'kg'
    
    # Set additional columns for this gas
    temp_df['gas'] = gas
    temp_df['ef_value'] = ef_natural_gas[ef_natural_gas['gas'] == gas]['Value'].iloc[0]
    temp_df['ef_unit'] = ef_natural_gas[ef_natural_gas['gas'] == gas]['Unit'].iloc[0]
    
    # Concatenate the temporary DataFrame to the result_df
    result_df = pd.concat([result_df, temp_df], ignore_index=True)

sector_dic = {
    'residential': 'I.1.2',
    'commercial': 'I.2.2',
    'industrial': 'I.3.2'
    }
    
# assigning gpc reference number based on the user
for index, row in result_df.iterrows():
    activity_name = row['activity_name']

    if activity_name in sector_dic.keys():
        result_df.at[index, 'GPC_ref_no'] = sector_dic[activity_name]

final_df = pd.concat([result_df1, result_df], ignore_index=True)

final_df = final_df[final_df != 0].dropna()

val_to_replace = ['Tunuyan', 'General_Alvear', 'San_Rafael', 'Santa_Rosa', 'San_Carlos', 'Maipu', 'Las_Heras',
       'Lujan de Cuyo', 'Gral San Martin', 'La_Paz', 'Malargue', 'Guaymallen', 'Godoy_Cruz', 'Junin']

new_val = ['Tunuyán', 'Gral. Alvear', 'San Rafael', 'Santa Rosa', 'San Carlos', 'Maipú', 'Las Heras',
       'Luján de Cuyo', 'Gral. San Martín', 'La Paz', 'Malargüe', 'Guaymallén', 'Godoy Cruz','Junín']

final_df['city'] = final_df['city'].replace(val_to_replace, new_val)
final_df['source_name'] = 'deie_mendoza'
final_df['temporal_granularity'] = 'annual'

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
    'Malargüe':'AR LGS',
    'Guaymallén':'AR GYM', 
    'Godoy Cruz':'AR GCR'
}

# assigning city locode based on the city name
for index, row in final_df.iterrows():
    city_name = row['city']

    if city_name in locode_dic.keys():
        final_df.at[index, 'locode'] = locode_dic[city_name]

final_df.to_csv('./stationary_energy_mendoza.csv')