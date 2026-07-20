"""Tests for the Firecrawl boundary used by CNB funder research."""

import json
from pathlib import Path

import httpx

from app.tools.firecrawl import FirecrawlClient


def test_firecrawl_client_searches_extracts_and_writes_snapshots(
    tmp_path: Path,
) -> None:
    """Firecrawl responses become compact search leads and local Markdown sources."""

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
                    "markdown": "# Official program\n\nMaximum award: $50,000.",
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
    assert extracted["source_ref"] == "source-001"
    snapshot = tmp_path / "sources" / "source-001.md"
    assert snapshot.exists()
    assert "Maximum award: $50,000" in snapshot.read_text(encoding="utf-8")
    assert len(client.captured_sources) == 1
