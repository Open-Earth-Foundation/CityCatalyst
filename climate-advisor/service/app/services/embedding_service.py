"""Embedding service for generating text embeddings using OpenAI."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class EmbeddingResult:
    """Result from generating an embedding."""
    success: bool
    embedding: Optional[List[float]] = None
    model: str = ""
    error: Optional[str] = None


class EmbeddingService:
    """Service for generating embeddings using OpenAI API."""
    
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.openai_api_key
        self.model = model or settings.llm.api.openai.embedding_model
        self.base_url = settings.llm.api.openai.base_url
        
        if not self.api_key:
            logger.warning("OpenAI API key not configured - embedding service will not work")
    
    async def generate_embedding(self, text: str) -> EmbeddingResult:
        """Generate an embedding for the given text."""
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
                    timeout=30.0
                )
                
                response.raise_for_status()
                data = response.json()
                
                embedding = data["data"][0]["embedding"]
                
                return EmbeddingResult(
                    success=True,
                    embedding=embedding,
                    model=self.model
                )
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error generating embedding: {e.response.status_code} - {e.response.text}")
            return EmbeddingResult(
                success=False,
                error=f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            )
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            return EmbeddingResult(
                success=False,
                error=str(e)
            )

