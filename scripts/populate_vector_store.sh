#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e
set -o pipefail

# Set the collection name variable
COLLECTION_NAME="all_docs_db"

# OS-specific paths
if [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "darwin"* ]]; then
  VENV_PYTHON="../.plan-creator/bin/python"
  VENV_ACTIVATE="../.plan-creator/bin/activate"
elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "cygwin"* || "$OSTYPE" == "win32" ]]; then
  VENV_PYTHON="../.plan-creator/Scripts/python.exe"
  VENV_ACTIVATE="../.plan-creator/Scripts/activate"
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi

# Ensure virtual environment is deactivated on exit
trap "deactivate; echo 'Virtual environment deactivated.'" EXIT

# Activate the virtual environment dynamically
echo "Activating virtual environment..."
source "$VENV_ACTIVATE"
if [ -z "$VIRTUAL_ENV" ]; then
  echo "Failed to activate virtual environment."
  exit 1
else
  echo -e "Virtual environment activated: $VIRTUAL_ENV\n"
fi

# Setup vector store
python create_vectorstore.py --collection_name "$COLLECTION_NAME"

# Add documents to the vector store
echo "Adding diverse documents..."
python add_document_to_vectorstore.py \
  --file_name Brazil_NDC_November_2024.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true
python add_document_to_vectorstore.py \
  --file_name Brazil_NAP_2016.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true
python add_document_to_vectorstore.py \
  --file_name Urban_Solid_Waste_Management_BRCXL.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --file_name Worldbank_Green_Cities_Brazil.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --file_name TNC_Brazil_Annual_Report_2023.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata sub_actions=true

echo "Adding C40 documents to the vector store..."
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name 15_minute_cities_complete_neigbourhoods_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name 15_minute_cities_connected_places_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name 15_minute_cities_people_centered_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name actions_to_clean_energy_supply_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name actions_to_improve_waste_management_reduce_emissions_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name adapt_to_extreme_heat_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name address_health_inequities_of_air_pollution_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name boost_recycling_rates_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name case_studies_energy_retrofitting_of_buildings_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name cities_should_support_access_to_healthy_sustainable_food_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name collect_residential_food_waste_on_path_to_zero_waste_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name create_demand_for_clean_energy_generation_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name create_roadmap_for_renewable_energy_transition_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name cycling_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name decarbonise_heating_and_cooling_systems_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name deconstructing_and_stop_demolishing_city_built_assets_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name drive_electric_vehicle_uptake_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name drive_urban_infill_development_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name e_cargo_bike_delivery_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name electric_vehicle_city_deploying_charging_infrastructure_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name encourage_building_scale_clean_energy_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name encourage_residents_businesses_to_install_building_scale_clean_energy_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name energy_performance_contracts_to_retrofit_schools_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name enhance_restore_protect_biodiversity_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name expand_tree_canopy_cover_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name finance_retrofit_of_municipal_buildings_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name flood_proof_a_city_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name flooding_increase_city_permeability_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name green_healthy_transport_modes_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name grow_reuse_and_repair_economy_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name guiding_diners_toward_plant_rich_dishes_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name how_to_assess_local_air_pollution_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name informal_microbuses_transportation_network_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name install_solar_panels_city_owned_property_and_lead_by_example_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name low_emission_zone_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name make_public_transport_an_attractive_option_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name manage_food_organic_waste_in_global_south_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name manage_food_waste_and_organics_towards_zero_waste_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name manage_water_scarcity_adapt_to_drought_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name modal_shift_private_vehicles_public_transport_walking_cycling_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name nature_based_solutions_to_manage_climate_risks_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name optimise_food_assistance_for_sustainable_food_secure_cities_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name priority_actions_to_build_healthy_sustainable_food_systems_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name procurement_to_shift_towards_sustainable_food_consumption_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name protect_urban_lives_health_property_from_wildfire_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name reduce_flood_risks_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name reduce_municipal_food_waste_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name reduce_single_use_plastics_food_sector_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name revitalise_city_centres_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name self_financing_urban_reforestation_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name set_energy_efficiency_requirements_existing_buildings_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name set_energy_efficiency_requirements_new_buildings_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name set_standards_and_monitor_outdoor_air_quality_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name shift_from_gas_to_renewables_in_buildings_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name solid_waste_incineration_is_not_the_answer_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name support_access_to_healthy_sustainable_food_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name supportive_programmes_to_drive_zero_carbon_buildings_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name temporary_use_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name transit_oriented_development_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name two_three_wheeler_management_and_electrification_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name universal_waste_collection_and_safe_disposal_foundation_for_sustainable_waste_management_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name urban_air_pollution_solutions_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name walking_cycling_transformation_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name ways_to_tackle_energy_security_and_energy_poverty_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "c40" \
  --file_name zero_emission_buses_c40.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true

echo "Adding CAP documents to the vector store..."
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name belo_horizonte_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name campinas_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name curitiba_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name fortaleza_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name guarullhos_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name niteroi_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name porto_alegre_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name recife_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name rio_branco_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name rio_de_janeiro_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name salvador_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name sao_paulo_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true
python add_document_to_vectorstore.py \
  --subfolder "cap" \
  --file_name teresina_cap.pdf \
  --collection_name "$COLLECTION_NAME" \
  --metadata main_action=true \
  --metadata sub_actions=true

# Ensure clean exit
echo "Vector store setup for "$COLLECTION_NAME" completed successfully."