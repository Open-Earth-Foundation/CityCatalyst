# app/plan_creator_bundle/scripts/download_json_files_from_s3.py

"""
This module provides functionality to download a JSON file from S3.
It is intended to be used as a standalone script.

Args:
    file_name: Name of the JSON file to download (e.g., "br_cxl.json")

Returns:
    bool: True if JSON file exists locally or was successfully downloaded

Example Call (from app/ directory):
    python -m app.scripts.download_json_files_from_s3 "br_cxl.json"
"""

from dotenv import load_dotenv

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

# Get the JSON files directory relative to this script
# Script is in: app/scripts/
# JSON files are in: app/runtime_data/json_files/
JSON_FILES_DIR = Path(__file__).parent.parent / "runtime_data" / "json_files"


def download_from_s3(file_name: str) -> bool:
    """
    Downloads a JSON file from S3 to the fixed JSON files directory.

    Args:
        file_name: Name of the file to download

    Returns:
        bool: True if download successful, False otherwise
    """
    try:
        # Initialize S3 client
        s3_client = boto3.client("s3")

        # Define the local path for the file
        local_file_path = JSON_FILES_DIR / file_name
        # Create the local directory if it doesn't exist
        local_file_path.parent.mkdir(parents=True, exist_ok=True)

        # Define the S3 object key
        s3_key = f"data/json_files/{file_name}"
        print(f"Looking for JSON file in S3 at: {S3_BUCKET_NAME}/{s3_key}")

        try:
            # Check if the object exists in S3
            s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                print(f"Error: JSON file '{file_name}' not found in S3 at {s3_key}")
                return False
            else:
                print(f"Error: S3 client error occurred: {e}")
                return False
        except NoCredentialsError:
            print(
                "Error: No AWS credentials found. Please configure your AWS credentials."
            )
            return False
        except EndpointConnectionError as e:
            print(f"Error: Could not connect to S3 endpoint. Details: {e}")
            return False
        except Exception as e:
            print(f"Error: Unexpected error when connecting to S3: {e}")
            return False

        # Download the file
        print(f"Downloading: {s3_key} -> {local_file_path}")
        s3_client.download_file(S3_BUCKET_NAME, s3_key, str(local_file_path))

        print(f"Successfully downloaded JSON file from S3 to {local_file_path}")
        return True

    except Exception as e:
        print(f"Error downloading from S3: {e}")
        return False


def get_json_file(file_name: str) -> bool:
    """
    Checks if a JSON file exists locally, and downloads it from S3 if it doesn't.

    Args:
        file_name: Name of the JSON file to check/download

    Returns:
        bool: True if JSON file exists locally or was successfully downloaded
    """
    # Define the local path for the file
    json_file_path = JSON_FILES_DIR / file_name

    print(f"JSON_FILES_DIR: {JSON_FILES_DIR}")
    print(f"file_name: {file_name}")
    print(f"json_file_path: {json_file_path}")
    print(f"json_file_path.exists(): {json_file_path.exists()}")

    # Check if the JSON file already exists locally
    if json_file_path.is_file():
        print(f"Found existing JSON file at {json_file_path}")
        return True

    print(f"No local JSON file found at {json_file_path}")

    # If not, try to download from S3
    if not S3_BUCKET_NAME:
        print(
            "S3 bucket name not configured. Please set the S3_BUCKET_NAME environment variable."
        )
        return False

    print("Attempting to download from S3...")
    return download_from_s3(file_name)


# Execute the script when called directly
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download a JSON file from S3")
    parser.add_argument(
        "file_name",
        type=str,
        help="Name of the JSON file to download (e.g., 'br_cxl.json')",
    )
    args = parser.parse_args()

    try:
        success = get_json_file(file_name=args.file_name)
        if not success:
            print("Failed to load or download JSON file.")
            sys.exit(1)
        sys.exit(0)
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        sys.exit(1)
