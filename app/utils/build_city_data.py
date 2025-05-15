from typing import Optional, List


def build_city_data(
    contextData: dict, requestData: dict, ccra: Optional[List[dict]] = None
) -> dict:
    """
    Build the city_data dictionary as required.
    - Use all fields from contextData except scope1/2/3 emissions.
    - Override populationSize with value from requestData.
    - Calculate totalEmissions as the sum of the other 5 emissions.
    - Initiates ccra as empty list (for now)

    Input:
        contextData: general city context data from global api
        requestData: flat dict with keys: locode, populationSize, stationaryEnergyEmissions, transportationEmissions, wasteEmissions, ippuEmissions, afoluEmissions
        ccra: ccra data from global api

    Returns:
    A dictionary with the following structure:
        - locode (str): City code, from context data.
        - name (str): City name, from context data.
        - region (str): Region code, from context data.
        - regionName (str): Region name, from context data.
        - populationDensity (float): Population density, from context data.
        - area (float): Area in square kilometers, from context data.
        - elevation (float): Elevation in meters, from context data.
        - biome (str): Biome classification, from context data.
        - socioEconomicFactors (dict): Socioeconomic data, from context data.
        - accessToPublicServices (dict): Access indicators, from context data.
        - populationSize (float, optional): Overridden value from request body.
        - stationaryEnergyEmissions (float): Emissions from stationary energy (default 0).
        - transportationEmissions (float): Emissions from transportation (default 0).
        - wasteEmissions (float): Emissions from waste (default 0).
        - ippuEmissions (float): Emissions from industrial processes and product use (default 0).
        - afoluEmissions (float): Emissions from agriculture, forestry, and other land use (default 0).
        - totalEmissions (float): Sum of all emission-related fields.
        - ccra (list): Initialized as an empty list for future climate change risk assessments.
    """
    # Step 1: Copy all relevant fields from contextData
    cityData = {}

    # Step 2: Directly copy simple fields
    for key in [
        "locode",
        "name",
        "region",
        "regionName",
        "populationDensity",
        "area",
        "elevation",
        "biome",
        "socioEconomicFactors",
        "accessToPublicServices",
    ]:
        cityData[key] = contextData.get(key)

    # Step 3: Override populationSize with value from requestBody
    cityData["populationSize"] = requestData.get("populationSize")

    # Step 4: Copy emissions fields from flat requestBody
    emissionFields = [
        "stationaryEnergyEmissions",
        "transportationEmissions",
        "wasteEmissions",
        "ippuEmissions",
        "afoluEmissions",
    ]
    totalEmissions = 0
    for field in emissionFields:
        value = requestData.get(field)
        if value is None:
            value = 0  # Default to 0 if missing
        cityData[field] = value
        totalEmissions += value

    # Step 5: Set totalEmissions as the sum of the above emissions
    cityData["totalEmissions"] = totalEmissions

    # Step 6: Set the CCRA data
    cityData["ccra"] = ccra

    # Step 7: Return the constructed dictionary
    return cityData
