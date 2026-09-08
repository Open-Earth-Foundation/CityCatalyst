"""Direct Mistral OCR client for the CC-771 structured PoC."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any


BASE_URL = "https://api.mistral.ai/v1"
MODEL = "mistral-ocr-4-1"
# Public OCR list price used for estimates when usage does not include cost.
USD_PER_1000_PAGES = 4.0


class MistralConfigError(RuntimeError):
    pass


def require_api_key() -> str:
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        # Soft-load from CityCatalyst app/.env without printing values.
        env_path = Path(
            "/home/david/work/projects/open-earth/CityCatalyst/app/.env"
        )
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                if line.startswith("MISTRAL_API_KEY="):
                    value = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if value:
                        os.environ["MISTRAL_API_KEY"] = value
                        api_key = value
                    break
    if not api_key:
        raise MistralConfigError(
            "MISTRAL_API_KEY is not configured. Set it in the shell or "
            "untracked app/.env, then re-run. See vault mistral-key-setup.md."
        )
    return api_key


def load_bbox_annotation_format(schema_path: Path) -> dict[str, Any]:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    # Strip meta keys Mistral may not accept inside json_schema.schema.
    cleaned = {
        key: value
        for key, value in schema.items()
        if key
        not in {
            "$schema",
            "$id",
            "title",
            "description",
        }
    }
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "cc771_visual_annotation",
            "schema": cleaned,
            "strict": True,
        },
    }


def request_json(
    url: str,
    api_key: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout: int = 600,
) -> tuple[int, dict[str, Any], float]:
    body = None
    headers = {"Authorization": f"Bearer {api_key}"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            elapsed = time.perf_counter() - started
            return response.status, json.loads(raw.decode("utf-8")), elapsed
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        elapsed = time.perf_counter() - started
        raise RuntimeError(
            f"HTTP {error.code} from {url}: {detail[:2000]}"
        ) from error


def upload_pdf(api_key: str, pdf_bytes: bytes, filename: str) -> dict[str, Any]:
    boundary = f"----cc771{uuid.uuid4().hex}"
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\nocr\r\n".encode(),
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            "Content-Type: application/pdf\r\n\r\n"
        ).encode()
        + pdf_bytes
        + b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    request = urllib.request.Request(
        f"{BASE_URL}/files",
        data=b"".join(parts),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def signed_file_url(api_key: str, file_id: str, expiry_hours: int = 1) -> str:
    _, payload, _ = request_json(
        f"{BASE_URL}/files/{urllib.parse.quote(file_id, safe='')}/url?expiry={expiry_hours}",
        api_key,
    )
    return payload["url"]


def build_ocr_payload(
    *,
    document_url: str,
    bbox_annotation_format: dict[str, Any] | None,
    include_image_base64: bool,
    pages: list[int] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": MODEL,
        "document": {"type": "document_url", "document_url": document_url},
        "include_blocks": True,
        "confidence_scores_granularity": "block",
        "extract_header": True,
        "extract_footer": True,
        "table_format": "markdown",
        "include_image_base64": include_image_base64,
    }
    if bbox_annotation_format is not None:
        payload["bbox_annotation_format"] = bbox_annotation_format
    if pages is not None:
        payload["pages"] = pages
    return payload


def estimate_ocr_cost_usd(pages_processed: int | None) -> float | None:
    if pages_processed is None:
        return None
    return round((pages_processed / 1000.0) * USD_PER_1000_PAGES, 6)


def run_ocr(
    api_key: str,
    pdf_path: Path,
    *,
    bbox_schema_path: Path | None,
    include_image_base64: bool,
    pages: list[int] | None = None,
) -> dict[str, Any]:
    pdf_bytes = pdf_path.read_bytes()
    started = time.perf_counter()
    file_info = upload_pdf(api_key, pdf_bytes, pdf_path.name)
    file_id = file_info["id"]
    document_url = signed_file_url(api_key, file_id)
    bbox_format = (
        load_bbox_annotation_format(bbox_schema_path) if bbox_schema_path else None
    )
    payload = build_ocr_payload(
        document_url=document_url,
        bbox_annotation_format=bbox_format,
        include_image_base64=include_image_base64,
        pages=pages,
    )
    status, response, ocr_elapsed = request_json(
        f"{BASE_URL}/ocr",
        api_key,
        method="POST",
        payload=payload,
        timeout=900,
    )
    total_elapsed = time.perf_counter() - started
    usage = response.get("usage_info") or {}
    pages_processed = usage.get("pages_processed")
    return {
        "http_status": status,
        "response": response,
        "file_id": file_id,
        "request_for_metadata": {
            "model": MODEL,
            "document": {
                "type": "document_url",
                "document_url": "<signed-url-omitted>",
            },
            "include_blocks": True,
            "confidence_scores_granularity": "block",
            "extract_header": True,
            "extract_footer": True,
            "table_format": "markdown",
            "include_image_base64": include_image_base64,
            "bbox_annotation_format": (
                {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "cc771_visual_annotation",
                        "schema_ref": str(bbox_schema_path.name)
                        if bbox_schema_path
                        else None,
                        "strict": True,
                    },
                }
                if bbox_format
                else None
            ),
            "pages": pages,
        },
        "timing": {
            "ocr_latency_s": round(ocr_elapsed, 3),
            "total_latency_s": round(total_elapsed, 3),
            # Annotation is billed inside the OCR call when bbox_annotation_format is set;
            # keep a separate field for reporting even when provider does not split it.
            "annotation_latency_s": round(ocr_elapsed, 3) if bbox_format else 0.0,
        },
        "cost": {
            "ocr_cost_usd_estimate": estimate_ocr_cost_usd(pages_processed),
            "annotation_cost_usd_estimate": None,
            "total_cost_usd_estimate": estimate_ocr_cost_usd(pages_processed),
            "notes": (
                "OCR page cost estimated at US$4 / 1,000 pages. "
                "BBox annotation uses an internal vision call per image; "
                "provider does not always expose a separate annotation line item."
            ),
        },
        "usage_info": usage,
    }
