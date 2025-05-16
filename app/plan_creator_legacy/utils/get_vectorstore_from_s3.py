# plan_creator_legacy/utils/get_vectorstore_from_s3.py

"""
This module provides functionality to download a vector store from S3 and check if it is valid.

Args:
    collection_name: Name of the collection to download
    path: Path to store the vector store (relative to project root)

Returns:
    bool: True if vector store exists locally or was successfully downloaded

Example:
    >>> get_vectorstore("my_collection", "vector_stores")
    True
"""

from pathlib import Path
import boto3
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# S3 Configuration
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")

# Get project root directory
PROJECT_ROOT = Path(__file__).parent.parent.parent


def log_error(message: str):
    """Log error message and exit with error code 1"""
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def is_valid_vectorstore(path: Path) -> bool:
    """
    Check if the directory contains a valid Chroma vector store.

    Args:
        path: Path to check

    Returns:
        bool: True if directory contains required Chroma files
    """
    # Check for essential Chroma files
    required_files = ["chroma.sqlite3"]
    return path.is_dir() and all((path / file).exists() for file in required_files)


def download_from_s3(collection_name: str, local_path: Path) -> bool:
    """
    Downloads a vector store from S3 to a local directory.

    Args:
        collection_name: Name of the collection to download
        local_path: Local path to store the downloaded files

    Returns:
        bool: True if download successful, False otherwise
    """
    try:
        # Initialize S3 client
        s3_client = boto3.client("s3")

        # Create the local directory if it doesn't exist
        local_path.mkdir(parents=True, exist_ok=True)

        # List objects in the S3 bucket with the collection prefix
        s3_prefix = f"data/vector_stores/{collection_name}/"
        print(f"Looking for vector store in S3 at: {S3_BUCKET_NAME}/{s3_prefix}")

        response = s3_client.list_objects_v2(Bucket=S3_BUCKET_NAME, Prefix=s3_prefix)

        if "Contents" not in response:
            print(f"No vector store found in S3 at {s3_prefix}")
            return False

        # Download each file
        for obj in response["Contents"]:
            # Get the relative path from the prefix
            relative_path = obj["Key"][len(s3_prefix) :]
            if not relative_path:  # Skip if it's the prefix itself
                continue

            # Create the local file path
            local_file_path = local_path / relative_path
            local_file_path.parent.mkdir(parents=True, exist_ok=True)

            print(f"Downloading: {obj['Key']} -> {local_file_path}")
            # Download the file
            s3_client.download_file(S3_BUCKET_NAME, obj["Key"], str(local_file_path))

        print(f"Successfully downloaded vector store from S3 to {local_path}")
        return True

    except Exception as e:
        print(f"Error downloading from S3: {e}")
        return False


def get_vectorstore(collection_name: str, local_path: str) -> bool:
    """
    Checks if a vector store exists locally, downloads it from S3 if it doesn't.
    Does not load the vector store into memory.

    Args:
        collection_name: Name of the collection to check/download
        local_path: Path to store the vector store (relative to project root)

    Returns:
        bool: True if vector store exists locally or was successfully downloaded
    """
    # Always use paths relative to project root
    vector_store_path = PROJECT_ROOT / local_path / collection_name

    # Check if we have a valid vector store locally
    if vector_store_path.exists() and is_valid_vectorstore(vector_store_path):
        print(f"Found existing vector store at {vector_store_path}")
        return True

    # No valid local copy, try to download from S3
    print(f"No valid vector store found at {vector_store_path}")
    if not S3_BUCKET_NAME:
        print("S3 bucket not configured")
        return False

    print(f"Attempting to download from S3...")
    return download_from_s3(collection_name, vector_store_path)


# Execute the script when called directly
if __name__ == "__main__":
    try:
        success = get_vectorstore(
            collection_name="all_docs_db_small_chunks", local_path="vector_stores"
        )
        if not success:
            log_error("Failed to load or create vector store")
        sys.exit(0)
    except Exception as e:
        log_error(f"Unexpected error: {str(e)}")
