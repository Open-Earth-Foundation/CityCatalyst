This folder contains all scripts necessary for updating the data within the old proof of concept cap off-app

It it not needed for any functionality of of the new HIAP backend.

Run instructions:

1. Upload the exported inventory csv files from CityCatalyst to the folder `ghgi_exports`
2. Create `city_data.json` file.
   Run the following scripts in order:
   1. `python off_app_cap/scripts/create_city_data/run_context_bulk_import.py --bulk_file data/brazil_locodes/brazil_city_locodes.json`
   2. `python off_app_cap/scripts/create_city_data/run_ghgi_bulk_import.py --bulk_file data/brazil_locodes/brazil_city_locodes.json`
   3. `python off_app_cap/scripts/create_city_data/run_ccra_bulk_import.py --bulk_file data/brazil_locodes/brazil_city_locodes.json`

This will import all the city data and store inside `data/city_data/city_data.json`.
