"""Firecrawl search, scrape, and extraction tools for offline CNB research."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from urllib.parse import urlparse

import httpx
from pydantic import JsonValue

logger = logging.getLogger(__name__)


FIRECRAWL_TOOL_DEFINITIONS: list[dict[str, JsonValue]] = [
    {
        "type": "function",
        "name": "firecrawl_search",
        "description": (
            "Search the public web for authoritative funder, program, guidance, "
            "template, award, pipeline, or funded-project sources."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Focused public-web search query.",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "description": "Number of discovery results to return.",
                },
                "include_domains": {
                    "anyOf": [
                        {"type": "array", "items": {"type": "string"}},
                        {"type": "null"},
                    ],
                    "description": (
                        "Optional hostnames to restrict results, without paths."
                    ),
                },
            },
            "required": ["query", "limit", "include_domains"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "firecrawl_scrape",
        "description": (
            "Retrieve one public page or document as Markdown, save a local source "
            "snapshot, and return its stable source_ref."
        ),
        "parameters": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "firecrawl_extract",
        "description": (
            "Retrieve one public page or document and ask Firecrawl to extract "
            "targeted structured facts while retaining the Markdown snapshot."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "extraction_prompt": {"type": "string"},
            },
            "required": ["url", "extraction_prompt"],
            "additionalProperties": False,
        },
        "strict": True,
    },
]


class FirecrawlError(RuntimeError):
    """Raised when Firecrawl rejects or cannot complete a research request."""


@dataclass(frozen=True)
class CapturedSource:
    """Metadata derived from one Markdown snapshot written by the tool client."""

    source_ref: str
    url: str
    title: str | None
    content_hash: str
    fetched_at: datetime
    local_snapshot_path: str


class FirecrawlClient:
    """Small synchronous Firecrawl v2 client that persists every used source."""

    def __init__(
        self,
        *,
        api_key: str,
        run_directory: Path,
        base_url: str = "https://api.firecrawl.dev/v2",
        timeout_seconds: float = 120.0,
        http_client: httpx.Client | None = None,
    ) -> None:
        """Configure authenticated Firecrawl access and the run snapshot directory."""
        if not api_key:
            raise ValueError("FIRECRAWL_API_KEY must be set")

        self.run_directory = run_directory
        self.source_directory = run_directory / "sources"
        self.source_directory.mkdir(parents=True, exist_ok=True)
        self.base_url = base_url.rstrip("/")
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout_seconds,
        )
        self._sources_by_url: dict[str, CapturedSource] = {}

    @property
    def captured_sources(self) -> list[CapturedSource]:
        """Return source snapshots in their stable capture order."""
        return list(self._sources_by_url.values())

    def search(
        self,
        *,
        query: str,
        limit: int,
        include_domains: list[str] | None,
    ) -> dict[str, JsonValue]:
        """Search the web without treating result snippets as captured evidence."""
        if not 1 <= limit <= 100:
            raise ValueError("Firecrawl search limit must be between 1 and 100")

        # Search results guide later scrape choices; only scraped pages become sources.
        payload: dict[str, JsonValue] = {
            "query": query,
            "limit": limit,
            "sources": ["web"],
            "ignoreInvalidURLs": True,
        }
        normalized_domains = [
            domain
            for domain in (
                self._normalize_domain(value) for value in include_domains or []
            )
            if domain
        ]
        if normalized_domains:
            payload["includeDomains"] = normalized_domains

        response = self._post("search", payload)
        raw_data = response.get("data", {})
        raw_results = raw_data.get("web", []) if isinstance(raw_data, dict) else raw_data
        results: list[dict[str, JsonValue]] = []
        if isinstance(raw_results, list):
            for item in raw_results:
                if not isinstance(item, dict):
                    continue
                results.append(
                    {
                        "title": item.get("title"),
                        "url": item.get("url"),
                        "description": item.get("description"),
                    }
                )

        logger.info("Firecrawl search returned %s results", len(results))
        return {"query": query, "results": results}

    @staticmethod
    def _normalize_domain(value: str) -> str:
        """Convert a URL-like model argument into a Firecrawl hostname filter."""
        candidate = value.strip()
        parsed = urlparse(candidate if "://" in candidate else f"//{candidate}")
        hostname = parsed.hostname or ""
        return hostname.removeprefix("*.")

    def scrape(self, *, url: str) -> dict[str, JsonValue]:
        """Scrape one URL to Markdown and save it as a review source."""
        response = self._post(
            "scrape",
            {
                "url": url,
                "formats": ["markdown", "links"],
                "onlyMainContent": True,
            },
        )
        data = self._response_data(response)
        source = self._capture_source(url=url, data=data)
        return {
            "source_ref": source.source_ref,
            "url": source.url,
            "title": source.title,
            "markdown": data.get("markdown", ""),
            "links": data.get("links", []),
            "local_snapshot_path": source.local_snapshot_path,
        }

    def extract(self, *, url: str, extraction_prompt: str) -> dict[str, JsonValue]:
        """Run Firecrawl JSON extraction while retaining the underlying Markdown."""
        response = self._post(
            "scrape",
            {
                "url": url,
                "formats": [
                    "markdown",
                    {"type": "json", "prompt": extraction_prompt},
                ],
                "onlyMainContent": True,
            },
        )
        data = self._response_data(response)
        source = self._capture_source(url=url, data=data)
        return {
            "source_ref": source.source_ref,
            "url": source.url,
            "title": source.title,
            "extracted": data.get("json", {}),
            "markdown": data.get("markdown", ""),
            "local_snapshot_path": source.local_snapshot_path,
        }

    def close(self) -> None:
        """Close the internally owned HTTP client."""
        if self._owns_client:
            self._client.close()

    def _post(self, endpoint: str, payload: dict[str, JsonValue]) -> dict[str, JsonValue]:
        """Send one Firecrawl request and normalize safe error messages."""
        try:
            response = self._client.post(f"{self.base_url}/{endpoint}", json=payload)
        except httpx.HTTPError as exc:
            raise FirecrawlError(
                f"Firecrawl {endpoint} request failed: {exc}"
            ) from exc

        if response.is_error:
            message = response.reason_phrase
            try:
                body = response.json()
                if isinstance(body, dict):
                    message = str(body.get("error") or body.get("message") or message)
            except ValueError:
                pass
            raise FirecrawlError(
                f"Firecrawl {endpoint} returned HTTP {response.status_code}: {message}"
            )

        body = response.json()
        if not isinstance(body, dict) or body.get("success") is False:
            raise FirecrawlError(
                f"Firecrawl {endpoint} returned an unsuccessful response"
            )
        return body

    @staticmethod
    def _response_data(response: dict[str, JsonValue]) -> dict[str, JsonValue]:
        """Return the object inside a successful Firecrawl response."""
        data = response.get("data")
        if not isinstance(data, dict):
            raise FirecrawlError("Firecrawl response did not contain data")
        return data

    def _capture_source(
        self,
        *,
        url: str,
        data: dict[str, JsonValue],
    ) -> CapturedSource:
        """Write or refresh the stable local snapshot for one canonical URL."""
        markdown = data.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            raise FirecrawlError(f"Firecrawl returned no Markdown for {url}")

        metadata = data.get("metadata")
        metadata_dict = metadata if isinstance(metadata, dict) else {}
        canonical_url = str(
            metadata_dict.get("sourceURL") or metadata_dict.get("url") or url
        )
        title_value = metadata_dict.get("title")
        title = str(title_value) if title_value else None
        fetched_at = datetime.now(timezone.utc)
        content_hash = hashlib.sha256(markdown.encode("utf-8")).hexdigest()
        source_identity = hashlib.sha256(
            f"{canonical_url}\n{content_hash}".encode("utf-8")
        ).hexdigest()
        source_ref = f"source-{source_identity}"
        relative_path = Path("sources") / f"{source_ref}.md"
        snapshot_path = self.run_directory / relative_path

        # Store provenance beside the unmodified Firecrawl Markdown.
        header = (
            "---\n"
            f"source_ref: {json.dumps(source_ref)}\n"
            f"url: {json.dumps(canonical_url)}\n"
            f"title: {json.dumps(title)}\n"
            f"fetched_at: {json.dumps(fetched_at.isoformat())}\n"
            f"content_hash: {json.dumps(content_hash)}\n"
            "---\n\n"
        )
        snapshot_path.write_text(f"{header}{markdown}", encoding="utf-8")
        source = CapturedSource(
            source_ref=source_ref,
            url=canonical_url,
            title=title,
            content_hash=content_hash,
            fetched_at=fetched_at,
            local_snapshot_path=relative_path.as_posix(),
        )
        self._sources_by_url[canonical_url] = source
        logger.info("Captured Firecrawl source %s from %s", source_ref, canonical_url)
        return source


def execute_firecrawl_tool(
    client: FirecrawlClient,
    *,
    tool_name: str,
    arguments: dict[str, JsonValue],
) -> dict[str, JsonValue]:
    """Dispatch one model tool call to the explicitly allowed Firecrawl methods."""
    if tool_name == "firecrawl_search":
        include_domains = arguments.get("include_domains")
        return client.search(
            query=str(arguments["query"]),
            limit=int(arguments["limit"]),
            include_domains=(
                [str(domain) for domain in include_domains]
                if isinstance(include_domains, list)
                else None
            ),
        )
    if tool_name == "firecrawl_scrape":
        return client.scrape(url=str(arguments["url"]))
    if tool_name == "firecrawl_extract":
        return client.extract(
            url=str(arguments["url"]),
            extraction_prompt=str(arguments["extraction_prompt"]),
        )
    raise ValueError(f"Unsupported research tool: {tool_name}")
