"""Optional server-side Mistral OCR, supplied to the agent as extra source context."""

import base64
import json

import httpx

from extractor.config import Settings
from extractor.provider import ProviderError


class MistralOCR:
    """Read PDFs through Mistral without exposing its credential to the agent."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        """Use a separate HTTP client so OpenAI credentials cannot reach Mistral."""
        self.settings = settings
        self.client = client

    async def extract(self, pdf: bytes, source_path: str, page_count: int) -> dict:
        """Return page text/tables with one-based PDF pages; never retry paid calls."""
        payload = {
            "model": self.settings.mistral_ocr_model,
            "pages": list(range(page_count)),
            "document": {
                "type": "document_url",
                "document_url": "data:application/pdf;base64,"
                + base64.b64encode(pdf).decode(),
            },
            "include_image_base64": False,
            "include_blocks": True,
            "table_format": "html",
            "confidence_scores_granularity": "block",
        }
        try:
            async with self.client.stream(
                "POST",
                "/v1/ocr",
                json=payload,
                headers={"Authorization": f"Bearer {self.settings.mistral_api_key}"},
                timeout=self.settings.ocr_timeout,
            ) as response:
                if not response.is_success:
                    raise ProviderError(
                        502,
                        f"Mistral OCR returned HTTP {response.status_code}. No OpenAI extraction job was started.",
                    )
                chunks, size = [], 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > self.settings.max_result_bytes:
                        raise ProviderError(
                            502, "Mistral OCR response exceeds the 20 MiB demo limit."
                        )
                    chunks.append(chunk)
        except httpx.TimeoutException as exc:
            raise ProviderError(
                504,
                "Mistral OCR timed out. It may have incurred OCR charges; no OpenAI extraction job was started.",
            ) from exc
        except httpx.RequestError as exc:
            raise ProviderError(
                502,
                "Could not reach Mistral OCR. No OpenAI extraction job was started.",
            ) from exc
        try:
            data = json.loads(b"".join(chunks))
            pages = data["pages"]
            if not isinstance(pages, list) or not pages:
                raise ValueError("missing OCR pages")
            seen = set()
            normalized = []
            for page in pages:
                index = page["index"]
                if (
                    type(index) is not int
                    or not 0 <= index < page_count
                    or index in seen
                ):
                    raise ValueError("invalid OCR page index")
                if not isinstance(page.get("markdown"), str):
                    raise ValueError("missing page text")
                seen.add(index)
                normalized.append({**page, "pdf_page": index + 1})
            return {
                "source_pdf": source_path,
                "model": data.get("model", self.settings.mistral_ocr_model),
                "page_count": page_count,
                "missing_pages": [
                    index + 1 for index in range(page_count) if index not in seen
                ],
                "pages": sorted(normalized, key=lambda page: page["pdf_page"]),
                "usage_info": data.get("usage_info"),
            }
        except (ValueError, KeyError, TypeError) as exc:
            raise ProviderError(
                502,
                "Mistral OCR returned invalid page data. No OpenAI extraction job was started.",
            ) from exc
