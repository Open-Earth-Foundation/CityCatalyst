
def count_matching_hazards(city, action):
    city_hazards = set(city.get("hazards", []))
    if action.get("Hazard") is None:
        return 0
    action_hazards = set(action.get("Hazard", []))
    
    matching_hazards = city_hazards.intersection(action_hazards)
    
    return len(matching_hazards)

def find_highest_emission(city):
    emission_keys = [
        "stationaryEnergyEmissions",
        "transportationEmissions",
        "wasteEmissions",
        "industrialProcessEmissions",
        "landUseEmissions",
        "scope1Emissions",
        "scope2Emissions",
        "scope3Emissions"
    ]
    
    highest_emission = None
    highest_value = 0
    
    for key in emission_keys:
        if city.get(key, 0) > highest_value:
            highest_value = city[key]
            highest_emission = key
    
    total_emissions = city.get("totalEmissions", 1)  # Avoid division by zero
    highest_percentage = (highest_value / total_emissions) * 100
    
    return highest_emission, highest_percentage


