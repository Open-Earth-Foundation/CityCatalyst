"""
OpenAI embedding service for generating vector embeddings from text.

This service provides functionality to:
- Generate embeddings using OpenAI's embedding models
- Handle batch processing of text chunks
- Manage API rate limits and retries
"""

import asyncio
from typing import List, Optional, Dict, Any
import time
from dataclasses import dataclass

from openai import AsyncOpenAI, OpenAIError
import numpy as np

# Import settings from the service app
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'service'))

from app.config.settings import get_settings


@dataclass
class EmbeddingResult:
    """Result of embedding generation."""
    text: str
    embedding: List[float]
    model: str
    tokens_used: int
    success: bool
    error: Optional[str] = None


class EmbeddingService:
    """
    Service for generating text embeddings using OpenAI's API.

    Handles rate limiting, batching, and error handling for embedding generation.
    """

    def __init__(self):
        """Initialize the embedding service with OpenAI client."""
        self.settings = get_settings()

        # Check if OpenAI API key is available
        if not self.settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required for embedding service")

        self.client = AsyncOpenAI(
            api_key=self.settings.openai_api_key,
            base_url=self.settings.llm.api.openai.base_url,
            timeout=self.settings.llm.api.openai.timeout_ms / 1000 if self.settings.llm.api.openai.timeout_ms else 30.0
        )
        self.model = self.settings.llm.api.openai.embedding_model
        self.batch_size = 100  # OpenAI's recommended batch size
        self.requests_per_minute = 3500  # OpenAI's rate limit for embedding models
        self.min_delay = 60.0 / self.requests_per_minute  # Minimum delay between requests

    async def generate_embedding(self, text: str) -> EmbeddingResult:
        """
        Generate embedding for a single text.

        Args:
            text: Text to generate embedding for

        Returns:
            EmbeddingResult with the embedding vector and metadata
        """
        try:
            # Ensure text is not empty
            if not text or not text.strip():
                return EmbeddingResult(
                    text=text,
                    embedding=[],
                    model=self.model,
                    tokens_used=0,
                    success=False,
                    error="Empty text provided"
                )

            # Truncate text if too long (OpenAI has token limits)
            if len(text) > 8000:  # Conservative limit for text-embedding-3-small
                text = text[:8000] + "..."

            response = await self.client.embeddings.create(
                input=text,
                model=self.model
            )

            return EmbeddingResult(
                text=text,
                embedding=response.data[0].embedding,
                model=self.model,
                tokens_used=response.usage.total_tokens,
                success=True
            )

        except OpenAIError as e:
            return EmbeddingResult(
                text=text,
                embedding=[],
                model=self.model,
                tokens_used=0,
                success=False,
                error=str(e)
            )
        except Exception as e:
            return EmbeddingResult(
                text=text,
                embedding=[],
                model=self.model,
                tokens_used=0,
                success=False,
                error=f"Unexpected error: {str(e)}"
            )

    async def generate_embeddings_batch(
        self,
        texts: List[str],
        batch_size: Optional[int] = None
    ) -> List[EmbeddingResult]:
        """
        Generate embeddings for multiple texts in batches.

        Args:
            texts: List of texts to generate embeddings for
            batch_size: Size of batches (defaults to service default)

        Returns:
            List of EmbeddingResult objects
        """
        if not texts:
            return []

        batch_size = batch_size or self.batch_size
        results = []

        # Process texts in batches
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            # Generate embeddings for current batch
            batch_results = await self._generate_batch_embeddings(batch)

            # Add delay to respect rate limits
            if i + batch_size < len(texts):
                await asyncio.sleep(self.min_delay)

            results.extend(batch_results)

        return results

    async def _generate_batch_embeddings(self, texts: List[str]) -> List[EmbeddingResult]:
        """
        Generate embeddings for a single batch of texts.

        Args:
            texts: List of texts to embed

        Returns:
            List of EmbeddingResult objects
        """
        try:
            # Filter out empty texts
            valid_texts = [text for text in texts if text and text.strip()]

            if not valid_texts:
                return [
                    EmbeddingResult(
                        text=text,
                        embedding=[],
                        model=self.model,
                        tokens_used=0,
                        success=False,
                        error="Empty text"
                    )
                    for text in texts
                ]

            response = await self.client.embeddings.create(
                input=valid_texts,
                model=self.model
            )

            # Map results back to original texts
            result_map = {}
            for i, embedding_data in enumerate(response.data):
                result_map[valid_texts[i]] = EmbeddingResult(
                    text=valid_texts[i],
                    embedding=embedding_data.embedding,
                    model=self.model,
                    tokens_used=response.usage.total_tokens // len(valid_texts),  # Approximate
                    success=True
                )

            # Create results for all original texts (including empty ones)
            results = []
            for text in texts:
                if text in result_map:
                    results.append(result_map[text])
                else:
                    results.append(EmbeddingResult(
                        text=text,
                        embedding=[],
                        model=self.model,
                        tokens_used=0,
                        success=False,
                        error="Empty text"
                    ))

            return results

        except OpenAIError as e:
            # Return error results for all texts in batch
            return [
                EmbeddingResult(
                    text=text,
                    embedding=[],
                    model=self.model,
                    tokens_used=0,
                    success=False,
                    error=str(e)
                )
                for text in texts
            ]
        except Exception as e:
            return [
                EmbeddingResult(
                    text=text,
                    embedding=[],
                    model=self.model,
                    tokens_used=0,
                    success=False,
                    error=f"Unexpected error: {str(e)}"
                )
                for text in texts
            ]

    def validate_embedding_dimensions(self, embeddings: List[List[float]]) -> bool:
        """
        Validate that all embeddings have the expected dimensions.

        Args:
            embeddings: List of embedding vectors

        Returns:
            True if all embeddings have correct dimensions
        """
        if not embeddings:
            return True

        expected_dim = len(embeddings[0])

        return all(len(emb) == expected_dim for emb in embeddings)

    def get_model_dimensions(self) -> int:
        """
        Get the expected dimensions for the configured embedding model.

        Returns:
            Number of dimensions for the embedding model
        """
        # text-embedding-3-small has 1536 dimensions
        # text-embedding-3-large has 3072 dimensions
        # text-embedding-ada-002 has 1536 dimensions
        model_name = self.model.lower()
        if "large" in model_name:
            return 3072
        else:
            return 1536
