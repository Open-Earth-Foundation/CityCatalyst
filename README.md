## Setup vector store:

### Automatically:

The vector store is hosted within AWS S3 bucket. On Startup of the script, before exectuing the plan creation, `get_vectorstore_from_s3.py`
is executed. This script will check if the vector store is available in folder `vector_stores` and if not, download it into this folder.

### Manually:

If you want to make changes to the vector store, you can make those and run all import with the following script:

Navigate to /scripts folder

Run the bash sript:
`bash populate_vector_store_small_chunks.sh`

This will:

- create a vector store with name `all_docs_db_small_chunks`
  It will create a vector store with the documents from this folder: `data/files`

**Info:** If you want to adjust details of how the documents get added (e.g. chunk size, overlap, meta data) you need to add the arguments to the script call in the bash script.

**Important:** The actual plan creator will always use the vector store stored within `vector_stores`.
If you create the vectorstore locally using the above script, this on will be used and not the remote vector store from S3.
For correct deployment for production, make sure to push the desired locally created vector store to S3 bucket.

## Run the script

The script can be run locally with `python local_call.py --climate_action_id [action_id] --city_data_loc [loc]`
E.g.: `python lcoal_call.py --climate_action_id c40_0028 --city_data_loc brcxl`

The example files are within `data/input/`.

In a future version, these inputs will be passed in with the request body of an API call.

## Deployment

docker build -t cap-plan-creator .

docker tag cap-plan-creator ghcr.io/open-earth-foundation/cap-plan-creator:latest
