## Setup vector store:

### Automatically:

Navigate to /scripts folder

Run the bash sript:
`bash populate_vector_store_small_chunks.sh`

This will:

- create a vector store with name `all_docs_db_small_chunks`
  It will create a vector store with these documents: `data/files`

**Info:** If you want to adjust details of how the documents get added (e.g. chunk size, overlap, meta data) you need to add the arguments to the script call in the bash script.

## Run the script

The script can be run with `python main.py --climate_action_id [action_id] --city_data_loc [loc]`
E.g.: `python main.py --climate_action_id c40_0028 --city_data_loc brcxl`

The example files are within `data/input/`.

In a future version, these inputs will be passed in with the request body of an API call.
