# app/plan_creator_bundle/scripts/download_json_files_from_s3_bulk.py

"""
This module provides functionality to download all JSON files from an S3 folder.
It is intended to be used as a standalone script.

Example Call (from app/ directory):
    python -m app.scripts.download_json_files_from_s3_bulk
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

# Get the JSON files directory relative to this script
# Script is in: app/scripts/
# JSON files are in: app/runtime_data/json_files/
JSON_FILES_DIR = Path(__file__).parent.parent / "runtime_data" / "json_files"


def download_all_from_s3() -> bool:
    """
    Downloads all JSON files from the 'data/json_files/' directory in S3
    to the fixed JSON files directory.

    Returns:
        bool: True if download successful or no files to download, False otherwise
    """
    try:
        # Initialize S3 client
        s3_client = boto3.client("s3")

        # Define the S3 prefix
        s3_key_prefix = "data/json_files/"
        print(f"Looking for JSON files in S3 at: {S3_BUCKET_NAME}/{s3_key_prefix}")

        # List objects in the S3 bucket with the specified prefix
        response = s3_client.list_objects_v2(
            Bucket=S3_BUCKET_NAME, Prefix=s3_key_prefix
        )

        if "Contents" not in response:
            print(f"No files found in S3 at: {S3_BUCKET_NAME}/{s3_key_prefix}")
            return True  # No files to download is not an error

        # Filter for .json files
        files_to_download = [
            content["Key"]
            for content in response["Contents"]
            if content["Key"].lower().endswith(".json") and content["Size"] > 0
        ]

        if not files_to_download:
            print(f"No JSON files found in S3 at: {S3_BUCKET_NAME}/{s3_key_prefix}")
            return True

        print(f"Found {len(files_to_download)} JSON files to download.")

        # Create the local directory if it doesn't exist
        JSON_FILES_DIR.mkdir(parents=True, exist_ok=True)

        for s3_key in files_to_download:
            file_name = os.path.basename(s3_key)
            local_file_path = JSON_FILES_DIR / file_name

            # Check if file already exists locally
            if local_file_path.exists():
                print(f"Skipping {file_name}, already exists locally.")
                continue

            # Download the file
            print(f"Downloading: {s3_key} -> {local_file_path}")
            s3_client.download_file(S3_BUCKET_NAME, s3_key, str(local_file_path))
            print(f"Successfully downloaded {file_name}")

        print("All new JSON files downloaded successfully.")
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
            print("Failed to download JSON files.")
            sys.exit(1)
        sys.exit(0)
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        sys.exit(1)
