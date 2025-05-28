# plan_creator_legacy/utils/get_vectorstore_from_s3.py

"""
This module provides functionality to download a vector store from S3 and check if it is valid.
It is intended to be used as a standalone script and to be called in the `run.sh` script
at the start of the application.

Args:
    collection_name: Name of the collection to download
    path: Path to store the vector store (relative to project root)

Returns:
    bool: True if vector store exists locally or was successfully downloaded

Example:
    >>> get_vectorstore("my_collection", "vector_stores")
    True
"""

from dotenv import load_dotenv
from utils.logging_config import setup_logger
import logging

# Load environment variables
load_dotenv()

import argparse
from pathlib import Path
import boto3
from botocore.exceptions import NoCredentialsError, EndpointConnectionError, ClientError
import os
import sys

# S3 Configuration
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")

# Get project root directory
PROJECT_ROOT = Path(__file__).parent.parent.parent

# Setup logging configuration
setup_logger()
logger = logging.getLogger(__name__)


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
        logger.info(f"Looking for vector store in S3 at: {S3_BUCKET_NAME}/{s3_prefix}")

        try:
            response = s3_client.list_objects_v2(
                Bucket=S3_BUCKET_NAME, Prefix=s3_prefix
            )
        except NoCredentialsError:
            logger.error(
                "Error: No AWS credentials found. Please configure your AWS credentials."
            )
            return False
        except EndpointConnectionError as e:
            logger.error(f"Error: Could not connect to S3 endpoint. Details: {e}")
            return False
        except ClientError as e:
            logger.error(f"Error: S3 client error occurred: {e}")
            return False
        except Exception as e:
            logger.error(f"Error: Unexpected error when connecting to S3: {e}")
            return False

        # Connection succeeded, but check if collection exists
        if "Contents" not in response:
            logger.info(
                f"S3 connection succeeded, but no vector store found in S3 at {s3_prefix}"
            )
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

            logger.info(f"Downloading: {obj['Key']} -> {local_file_path}")
            # Download the file
            s3_client.download_file(S3_BUCKET_NAME, obj["Key"], str(local_file_path))

        logger.info(f"Successfully downloaded vector store from S3 to {local_path}")
        return True

    except Exception as e:
        logger.error(f"Error downloading from S3: {e}")
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
        logger.info(f"Found existing vector store at {vector_store_path}")
        return True

    # No valid local copy, try to download from S3
    logger.info(f"No valid vector store found at {vector_store_path}")
    logger.info(f"Looking for S3 bucket name: {S3_BUCKET_NAME}")
    if not S3_BUCKET_NAME:
        logger.error(
            "S3 bucket name not configured. Please set the S3_BUCKET_NAME environment variable. Terminate execution..."
        )
        return False

    logger.info(f"Attempting to download from S3...")
    return download_from_s3(collection_name, vector_store_path)


# Execute the script when called directly
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download a vector store from S3")
    parser.add_argument(
        "collection_name", type=str, help="Name of the collection to download"
    )
    parser.add_argument(
        "local_path",
        type=str,
        help="Path to store the vector store (relative to project root)",
    )
    args = parser.parse_args()

    try:
        success = get_vectorstore(
            collection_name=args.collection_name, local_path=args.local_path
        )
        if not success:
            print("Failed to load or create vector store")
        sys.exit(0)
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
