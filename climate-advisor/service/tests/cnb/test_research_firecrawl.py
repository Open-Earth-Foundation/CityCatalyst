"""Tests for the Firecrawl boundary used by CNB funder research."""

import json
from pathlib import Path

import httpx

from app.tools.firecrawl import FirecrawlClient


def test_firecrawl_client_searches_extracts_and_writes_snapshots(
    tmp_path: Path,
) -> None:
    """Firecrawl responses become compact search leads and local Markdown sources."""
    markdown = "# Official program\n\nMaximum award: $50,000."

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/search"):
            payload = json.loads(request.content)
            assert payload["includeDomains"] == ["example.gov"]
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {
                        "web": [
                            {
                                "title": "Official program",
                                "url": "https://example.gov/program",
                                "description": "Program details",
                            }
                        ]
                    },
                },
            )
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {
                    "markdown": markdown,
                    "json": {"maximum_award": 50000},
                    "links": ["https://example.gov/program/rfp.pdf"],
                    "metadata": {
                        "title": "Official program",
                        "sourceURL": "https://example.gov/program",
                    },
                },
            },
        )

    http_client = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="https://api.firecrawl.dev",
    )
    client = FirecrawlClient(
        api_key="test-key",
        run_directory=tmp_path,
        base_url="https://api.firecrawl.dev/v2",
        timeout_seconds=120,
        http_client=http_client,
    )

    search = client.search(
        query="official program",
        limit=5,
        include_domains=["https://example.gov/programs"],
    )
    extracted = client.extract(
        url="https://example.gov/program",
        extraction_prompt="Extract the maximum award.",
    )

    assert len(search["results"]) == 1
    assert extracted["extracted"] == {"maximum_award": 50000}
    source_ref = str(extracted["source_ref"])
    assert source_ref.startswith("source-")
    assert len(source_ref) == len("source-") + 64
    snapshot = tmp_path / "sources" / f"{source_ref}.md"
    assert snapshot.exists()
    assert "Maximum award: $50,000" in snapshot.read_text(encoding="utf-8")

    markdown = "# Official program\n\nMaximum award: $75,000."
    refreshed = client.extract(
        url="https://example.gov/program",
        extraction_prompt="Extract the maximum award.",
    )

    assert refreshed["source_ref"] != source_ref
    assert (tmp_path / "sources" / f"{refreshed['source_ref']}.md").exists()
    assert len(client.captured_sources) == 1
