#!/usr/bin/env python3

import argparse
from utils.get_vectorstore_from_s3 import get_vectorstore
from dotenv import load_dotenv
import os
from pathlib import Path

# Get project root directory
PROJECT_ROOT = Path(__file__).parent


def test_vector_store_download(collection_name: str, path: str):
    """
    Test downloading a vector store from S3.
    Only downloads if it doesn't exist locally.

    Args:
        collection_name: Name of the collection to test
        path: Directory to download vector stores to (relative to project root)
    """
    print("\n=== Vector Store Download Test ===\n")

    # Load environment variables
    load_dotenv()

    # Ensure path is relative to project root
    # relative_path = path.lstrip("/")  # Remove leading slashes to ensure relative path
    full_path = PROJECT_ROOT / path

    # Print configuration
    print("Configuration:")
    print(f"S3 Bucket: {os.getenv('S3_BUCKET_NAME')}")
    print(f"Collection Name: {collection_name}")
    print(f"Project Root: {PROJECT_ROOT.absolute()}")
    print(f"Vector Store Path: {full_path / collection_name}")
    print("\n=== Starting Download Test ===\n")

    # Attempt to get the vector store
    success = get_vectorstore(collection_name, local_path=str(full_path))

    if success:
        print("\nSUCCESS: Vector store is available locally")
    else:
        print("\nFAILED: Could not get vector store")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test vector store download from S3")
    parser.add_argument(
        "--collection", type=str, required=True, help="Name of the collection to test"
    )
    parser.add_argument(
        "--local_path",
        type=str,
        default="vector_stores",
        help="Directory to download vector stores to (relative to project root). Default: vector_stores",
    )

    args = parser.parse_args()
    test_vector_store_download(args.collection, args.local_path)
