# Plan Creator Legacy

This module contains the legacy implementation of the plan creation system. It uses a vector store to process and generate climate action plans based on input data.

## Vector Store Setup

### Automatic Setup

The vector store is hosted within AWS S3 bucket. On startup of the script, before executing the plan creation, `get_vectorstore_from_s3.py` is executed. This script will check if the vector store is available in folder `plan_creator_legacy/vector_stores` and if not, download it into this folder.

### Manual Setup

If you want to make changes to the vector store, you can make those and run all imports with the following command:

```bash
python -m app.plan_creator_legacy.scripts.populate_vector_store_small_chunks
```

This will:

- Create a vector store with name `all_docs_db_small_chunks`
- Process documents from the `data/files` folder
- The files are stored in S3 bucket `/data/files` folder and need to be downloaded from there and put into the folder due to file size limitations

**Note:** To adjust document processing parameters (e.g., chunk size, overlap, metadata), modify the arguments in the script.

**Important:** The plan creator will always use the vector store stored within `vector_stores`. If you create the vectorstore locally using the above script, this one will be used instead of the remote vector store from S3.
This is mainly for local testing. The hosted vectorstore on S3 should always be preferred to use!

## Running the Script

The script can be run locally with:

python -m app.plan_creator_legacy.local_call --climate_action_id [action_id] --city_data_loc [loc]

Example:

python -m app.plan_creator_legacy.local_call --climate_action_id c40_0028 --city_data_loc brcxl

Example files are located in `data/input/`.

## Testing

The module includes several test scripts located in `/scripts/testing/`:

- `test_async_endpoint.py`: Tests the asynchronous endpoint functionality
- `test_download_vector_store.py`: Tests the vector store download functionality
- `test_vectorstore.py`: Tests the vector store operations and functionality

To run the tests, use the following commands:

python -m app.plan_creator_legacy.scripts.testing.test_async_endpoint
python -m app.plan_creator_legacy.scripts.testing.test_download_vector_store
python -m app.plan_creator_legacy.scripts.testing.test_vectorstore
