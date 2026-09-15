"""
Brief: Restore the seeded Krakow PDF's immutable source artifact in local storage.

Inputs:
- --pdf: text-based fixture PDF to extract (required).
- --upload-id: existing seeded upload UUID (required).
- --output: path for extracted page-marked Markdown (required).
- --app-env / --ca-env: local dotenv files with database/storage configuration.
- Env files: DATABASE_* and CA_DATABASE_URL; AWS_ENDPOINT_URL_S3,
  AWS_FILE_UPLOAD_S3_BUCKET_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
- Dependencies: boto3, PyPDF2, python-dotenv, psycopg2 in the local environment.

Outputs:
- Writes Markdown and stores PDF/Markdown in the local S3-compatible bucket.
- Repairs CC PdfOcrJob, CA upload pointer, and selected-source hashes.
- Refuses non-loopback databases/storage. Existing unrelated rows are untouched.

Usage (from climate-advisor/service):
- python -m scripts.restore_cnb_demo_source --pdf ../fixtures/cnb/krakow/krakow-kst-iv-project-brief.pdf --upload-id <uuid> --output ../../artifacts/cc827-krakow/source.md
"""

from __future__ import annotations

import argparse
import hashlib
import logging
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID, uuid4

import boto3
import psycopg2
from dotenv import dotenv_values
from psycopg2.extras import Json
from PyPDF2 import PdfReader

logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse explicit fixture paths and local configuration files."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--upload-id", type=UUID, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--app-env", type=Path, default=Path("../../app/.env"))
    parser.add_argument("--ca-env", type=Path, default=Path("../.env"))
    return parser.parse_args()


def main() -> None:
    """Extract a text PDF and repair local artifact metadata without bypasses."""
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    app = dotenv_values(args.app_env)
    ca = dotenv_values(args.ca_env)
    database_url = ca["CA_DATABASE_URL"].replace(
        "postgresql+asyncpg://", "postgresql://"
    )
    endpoint = app["AWS_ENDPOINT_URL_S3"]
    for host in (
        urlparse(database_url).hostname,
        app["DATABASE_HOST"],
        urlparse(endpoint).hostname,
    ):
        if host not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("Fixture restoration only supports loopback services")
    pages = PdfReader(args.pdf).pages
    markdown = "\n\n".join(
        f"<!-- page: {index} -->\n{page.extract_text() or ''}"
        for index, page in enumerate(pages, 1)
    ).encode("utf-8")
    digest = hashlib.sha256(markdown).hexdigest()
    upload_id = str(args.upload_id)
    key = f"concept-notes/fixtures/{upload_id}/{digest}.md"
    bucket = app["AWS_FILE_UPLOAD_S3_BUCKET_ID"]
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name="us-east-1",
        aws_access_key_id=app["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=app["AWS_SECRET_ACCESS_KEY"],
    )
    buckets = {item["Name"] for item in client.list_buckets()["Buckets"]}
    if bucket not in buckets:
        client.create_bucket(Bucket=bucket)
    client.put_object(
        Bucket=bucket, Key=key, Body=markdown, ContentType="text/markdown"
    )
    client.put_object(
        Bucket=bucket,
        Key=f"concept-notes/fixtures/{upload_id}/source.pdf",
        Body=args.pdf.read_bytes(),
        ContentType="application/pdf",
    )
    with (
        psycopg2.connect(
            host=app["DATABASE_HOST"],
            dbname=app["DATABASE_NAME"],
            user=app["DATABASE_USER"],
            password=app["DATABASE_PASSWORD"],
            port=app.get("DATABASE_PORT", "5432"),
        ) as conn,
        conn.cursor() as cur,
    ):
        cur.execute(
            """INSERT INTO "PdfOcrJob"
            (id, source_type, source_id, status, attempt_count, page_count,
             result_s3_key, result_size_bytes, result_sha256, model,
             delivery_status, delivery_attempt_count, completed_at, created, last_updated)
            VALUES (%s, 'concept_note_upload', %s, 'succeeded', 1, %s, %s, %s,
                    %s, 'local-text-pdf-fixture', 'delivered', 1, NOW(), NOW(), NOW())
            ON CONFLICT (source_type, source_id) DO UPDATE SET
            status='succeeded', page_count=EXCLUDED.page_count,
            result_s3_key=EXCLUDED.result_s3_key, result_sha256=EXCLUDED.result_sha256,
            result_size_bytes=EXCLUDED.result_size_bytes, last_updated=NOW()""",
            (str(uuid4()), upload_id, len(pages), key, len(markdown), digest),
        )
    with psycopg2.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE concept_note_uploads SET markdown_s3_key=%s,
            markdown_sha256=%s, page_count=%s, ingest_status='ready'
            WHERE upload_id=%s RETURNING run_id""",
            (key, digest, len(pages), upload_id),
        )
        row = cur.fetchone()
        if row is None:
            raise ValueError("Upload must be seeded before restoring its artifact")
        cur.execute(
            "SELECT context_bundle FROM concept_note_context_bundles WHERE run_id=%s FOR UPDATE",
            (row[0],),
        )
        bundle = cur.fetchone()[0]
        for source in bundle.get("selected_sources", []):
            if source.get("upload_id") == upload_id:
                source["sha256"] = digest
        cur.execute(
            "UPDATE concept_note_context_bundles SET context_bundle=%s, updated_at=NOW() WHERE run_id=%s",
            (Json(bundle), row[0]),
        )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(markdown)
    logger.info(
        "Restored %s pages, %s Markdown bytes, SHA256 %s",
        len(pages),
        len(markdown),
        digest,
    )


if __name__ == "__main__":
    main()
