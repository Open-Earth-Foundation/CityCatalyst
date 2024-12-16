import boto3
from dotenv import load_dotenv
import argparse


load_dotenv()

BUCKET_NAME = "openearth.cap"


def upload_to_s3(file_path, s3_key):
    """
    Upload a file to an S3 bucket.

    :param file_path: Local path to the file to upload
    :param s3_key: S3 key (path in the bucket)
    """
    # Initialize S3 client
    s3_client = boto3.client("s3")

    try:
        s3_client.upload_file(file_path, BUCKET_NAME, s3_key)
        print(f"File {file_path} uploaded to {BUCKET_NAME}/data/{s3_key}.")
    except Exception as e:
        print(f"Error uploading file: {e}")


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Upload a file to an S3 bucket.")

    parser.add_argument(
        "--file_path", type=str, required=True, help="Local path to the file to upload."
    )
    parser.add_argument(
        "--s3_key",
        type=str,
        required=True,
        help="S3 key (path in the bucket).",
    )

    args = parser.parse_args()

    upload_to_s3(args.file_path, args.s3_key)
