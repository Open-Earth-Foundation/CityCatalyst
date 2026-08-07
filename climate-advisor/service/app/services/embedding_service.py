"""Embedding service for generating text embeddings using OpenAI."""
from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from app.config.settings import get_settings

logger = logging.getLogger(__name__)


@dataclass
class EmbeddingResult:
    """Result from generating an embedding."""

    success: bool
    embedding: list[float] | None = None
    model: str = ""
    error: str | None = None


class EmbeddingService:
    """Service for generating embeddings using OpenAI API."""
    
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        """Initialize the embedding endpoint from centralized settings."""
        settings = get_settings()
        self.api_key = api_key or settings.openai_api_key
        self.model = model or settings.llm.api.openai.embedding_model
        self.base_url = settings.llm.api.openai.base_url
        timeout_ms = settings.llm.api.openai.timeout_ms
        self.timeout_seconds = timeout_ms / 1000 if timeout_ms else 30.0
        
        if not self.api_key:
            logger.warning("OpenAI API key not configured - embedding service will not work")
    
    async def generate_embedding(self, text: str) -> EmbeddingResult:
        """Generate an embedding for the given text."""
        # Reject unusable requests before creating an HTTP client.
        if not self.api_key:
            return EmbeddingResult(
                success=False,
                error="OpenAI API key not configured"
            )
        
        if not text or not text.strip():
            return EmbeddingResult(
                success=False,
                error="Empty text provided"
            )
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model,
                        "input": text.strip()
                    },
                    timeout=self.timeout_seconds,
                )
                
                response.raise_for_status()
                data = response.json()
                
                embedding = data["data"][0]["embedding"]
                
                return EmbeddingResult(
                    success=True,
                    embedding=embedding,
                    model=self.model
                )
                
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Embedding request failed with HTTP %s",
                exc.response.status_code,
            )
            return EmbeddingResult(
                success=False,
                error=f"HTTP {exc.response.status_code}: {exc.response.text[:200]}",
            )
        except Exception as exc:
            logger.exception("Embedding request failed")
            return EmbeddingResult(
                success=False,
                error=str(exc),
            )
