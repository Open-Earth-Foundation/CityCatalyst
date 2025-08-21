This folder contains all scripts necessary for updating the data within the old proof of concept cap off-app

It it not needed for any functionality of of the new HIAP backend.

Run instructions:

1. Upload the exported inventory csv files from CityCatalyst to the folder `ghgi_exports`
2. Create `city_data.json` file.
   Run the following scripts in order:

   1. `python -m app.cap_off_app.scripts.create_city_data.run_context_bulk_import --bulk_file data/brazil_locodes/brazil_city_locodes.json`
   2. `python -m app.cap_off_app.scripts.create_city_data.run_ghgi_bulk_import --bulk_file data/brazil_locodes/brazil_city_locodes.json`
   3. `python -m app.cap_off_app.scripts.create_city_data.run_ccra_bulk_import --bulk_file data/brazil_locodes/brazil_city_locodes.json`

   This will import all the city data and store inside `data/city_data/city_data.json`.

3. Run the script `run_prioritization_local.py` with the following commands from 'app' folder:

   ```
   cd app
   python -m cap_off_app.scripts.run_prioritization_local
   ```

   This will run the prioritizer bulk function on the inputs of `city_data.json`.
   It will store the results of the prioritization inside `cap_off_app/data/prioritizations/prioritization_results_local.json`

4. Now the prioritized results need to be formatted to fit the expected foramt of the cap off-app frontend:

   For this part, run the following script from `app` directory:

   `python -m cap_off_app.scripts.export_prioritization_to_frontend`

   This will create individual json files in:
   `cap_off_app/data/frontend/{language}/{sector}/`

   E.g. `app/cap_off_app/data/frontend/en/adaptation/BR ACZ.json`
   These folders can then be uploaded to the openearth.cap S3 bucket on AWS.
