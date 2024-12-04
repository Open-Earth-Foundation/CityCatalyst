
def count_matching_hazards(city, action):
    # Get the city's hazards with a normalised risk score above 0.5
    city_hazards = {entry["hazard"] for entry in city.get("ccra", []) if entry["normalised_risk_score"] > 0.5}
    
    # Get the action's hazards
    action_hazards = set(action.get("Hazard", [])) if action.get("Hazard") is not None else set()  
    # Find the intersection of city hazards and action hazards
    matching_hazards = city_hazards.intersection(action_hazards)
    # Calculate the percentage of matching hazards
    total_hazards = len(city_hazards)
    matching_percentage = len(matching_hazards) / total_hazards if total_hazards > 0 else 0
    return matching_percentage


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


