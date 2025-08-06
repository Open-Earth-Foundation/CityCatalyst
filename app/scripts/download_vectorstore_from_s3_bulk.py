# app/plan_creator_bundle/scripts/download_vectorstore_from_s3_bulk.py

"""
This module provides functionality to download all vector stores from S3.
It is intended to be used as a standalone script.

Example Call (from app/ directory):
    python -m scripts.download_vectorstore_from_s3_bulk
"""

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from pathlib import Path
import boto3
from botocore.exceptions import NoCredentialsError, EndpointConnectionError, ClientError
import os
import sys

# S3 Configuration
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")

# Get the vector stores directory relative to this script
VECTOR_STORES_DIR = Path(__file__).parent.parent / "runtime_data" / "vector_stores"


def is_valid_vectorstore(path: Path) -> bool:
    """
    Check if the directory contains a valid Chroma vector store.
    """
    required_files = ["chroma.sqlite3"]
    return path.is_dir() and all((path / file).exists() for file in required_files)


def download_all_from_s3() -> bool:
    """
    Downloads all vector stores from the 'data/vector_stores/' directory in S3
    to the fixed vector stores directory.
    """
    try:
        # Initialize S3 client
        s3_client = boto3.client("s3")

        # Define the S3 prefix for vector stores
        s3_key_prefix = "data/vector_stores/"
        print(f"Looking for vector stores in S3 at: {S3_BUCKET_NAME}/{s3_key_prefix}")

        # List all subdirectories (collections) in the vector_stores directory
        paginator = s3_client.get_paginator("list_objects_v2")
        pages = paginator.paginate(
            Bucket=S3_BUCKET_NAME, Prefix=s3_key_prefix, Delimiter="/"
        )

        collection_prefixes = []
        for page in pages:
            if "CommonPrefixes" in page:
                for obj in page.get("CommonPrefixes", []):
                    collection_prefixes.append(obj.get("Prefix"))

        if not collection_prefixes:
            print(
                f"No vector store collections found in S3 at: {S3_BUCKET_NAME}/{s3_key_prefix}"
            )
            return True

        print(f"Found {len(collection_prefixes)} vector store collections.")

        VECTOR_STORES_DIR.mkdir(parents=True, exist_ok=True)

        for collection_prefix in collection_prefixes:
            collection_name = collection_prefix.split("/")[-2]
            local_collection_path = VECTOR_STORES_DIR / collection_name

            if is_valid_vectorstore(local_collection_path):
                print(f"Skipping '{collection_name}', valid local copy exists.")
                continue

            print(f"Downloading vector store: '{collection_name}'")
            local_collection_path.mkdir(parents=True, exist_ok=True)

            response = s3_client.list_objects_v2(
                Bucket=S3_BUCKET_NAME, Prefix=collection_prefix
            )

            if "Contents" not in response:
                print(
                    f"Warning: No files found for collection '{collection_name}' despite prefix existing."
                )
                continue

            for obj in response["Contents"]:
                s3_key = obj["Key"]
                # Skip the directory placeholder itself
                if s3_key.endswith("/"):
                    continue

                relative_path = os.path.relpath(s3_key, collection_prefix)
                local_file_path = local_collection_path / relative_path

                local_file_path.parent.mkdir(parents=True, exist_ok=True)

                print(f"Downloading: {s3_key} -> {local_file_path}")
                s3_client.download_file(S3_BUCKET_NAME, s3_key, str(local_file_path))

        print("All new vector stores downloaded successfully.")
        return True

    except NoCredentialsError:
        print("Error: No AWS credentials found. Please configure your AWS credentials.")
        return False
    except EndpointConnectionError as e:
        print(f"Error: Could not connect to S3 endpoint. Details: {e}")
        return False
    except ClientError as e:
        print(f"Error: S3 client error occurred: {e}")
        return False
    except Exception as e:
        print(f"Error downloading from S3: {e}")
        return False


# Execute the script when called directly
if __name__ == "__main__":
    if not S3_BUCKET_NAME:
        print(
            "S3 bucket name not configured. Please set the S3_BUCKET_NAME environment variable."
        )
        sys.exit(1)

    try:
        success = download_all_from_s3()
        if not success:
            print("Failed to download vector stores.")
            sys.exit(1)
        sys.exit(0)
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        sys.exit(1)
