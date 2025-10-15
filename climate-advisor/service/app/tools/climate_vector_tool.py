from __future__ import annotations

import logging
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..db.session import get_session_factory

# Import models and services from the service package
from ..models.db.document_embedding import DocumentEmbedding
from ..services.embedding_service import EmbeddingResult, EmbeddingService

logger = logging.getLogger(__name__)


@dataclass
class VectorSearchMatch:
    filename: str
    chunk_index: int
    chunk_size: int
    content: str
    score: float
    distance: float
    model_name: str
    file_path: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        # Return full content without truncation
        return {
            "filename": self.filename,
            "file_path": self.file_path,
            "chunk_index": self.chunk_index,
            "chunk_size": self.chunk_size,
            "score": round(self.score, 4),
            "distance": round(self.distance, 4),
            "model_name": self.model_name,
            "content": self.content.strip(),  # Full content, not excerpt
        }


@dataclass
class ToolInvocationRecord:
    name: str
    status: str
    arguments: Dict[str, Any]
    results: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            "name": self.name,
            "status": self.status,
            "arguments": self.arguments,
            "results": self.results,
        }
        if self.error:
            payload["error"] = self.error
        return payload


@dataclass
class ClimateToolResult:
    used: bool
    prompt_context: Optional[str]
    matches: List[VectorSearchMatch] = field(default_factory=list)
    invocation: Optional[ToolInvocationRecord] = None
    reason: Optional[str] = None


class ClimateVectorSearchTool:
    """Climate Vector Search Tool for LLM function calling.

    This tool provides climate-related information from the vector database
    when called by an LLM. The LLM decides when to use this tool based on
    the conversation context.
    """
    tool_name = "climate_vector_search"

    def __init__(
        self,
        *,
        settings = None,
        session_factory: Optional[async_sessionmaker[AsyncSession]] = None,
        embedding_service: Optional[EmbeddingService] = None,
    ) -> None:
        """Initialize the climate vector search tool.

        Args:
            settings: Application settings object (for configuration)
            session_factory: Database session factory
            embedding_service: Embedding service for generating question embeddings
        """
        # Get configuration from settings or use defaults
        if settings and hasattr(settings, 'llm') and hasattr(settings.llm, 'tools'):
            config = settings.llm.tools.climate_vector_search
            self.top_k = config.get("top_k", 5)
            self.min_score = config.get("min_score", 0.6)
        else:
            # Fallback defaults
            self.top_k = 5
            self.min_score = 0.6

        self._session_factory = session_factory
        self._embedding_service = embedding_service

    def _get_session_factory(self) -> Optional[async_sessionmaker[AsyncSession]]:
        if self._session_factory is not None:
            return self._session_factory
        try:
            self._session_factory = get_session_factory()
        except Exception as exc:
            logger.warning("Unable to create session factory for %s: %s", self.tool_name, exc)
            return None
        return self._session_factory

    def _get_embedding_service(self) -> Optional[EmbeddingService]:
        if self._embedding_service is not None:
            return self._embedding_service
        try:
            self._embedding_service = EmbeddingService()
        except Exception as exc:
            logger.warning("Embedding service unavailable for %s: %s", self.tool_name, exc)
            return None
        return self._embedding_service

    async def run(
        self,
        question: str,
        *,
        session: Optional[AsyncSession] = None,
        top_k: Optional[int] = None,
    ) -> ClimateToolResult:
        """Run the climate vector search tool.

        This tool is designed to be called by an LLM when it needs
        climate-related information from the knowledge base.

        Args:
            question: The question to search for in the climate knowledge base
            session: Optional database session
            top_k: Optional override for number of chunks to retrieve

        Returns:
            ClimateToolResult with relevant chunks and context
        """
        text = (question or "").strip()
        if not text:
            logger.warning("Vector search called with empty question")
            return ClimateToolResult(
                used=False,
                prompt_context=None,
                reason="empty_question"
            )
        
        logger.info(
            "Vector search initiated - question: '%s', top_k: %s, min_score: %s",
            text,
            top_k or self.top_k,
            self.min_score
        )

        # Get embedding service
        embedding_service = self._get_embedding_service()
        if embedding_service is None:
            invocation = ToolInvocationRecord(
                name=self.tool_name,
                status="error",
                arguments={"question": text, "top_k": top_k or self.top_k},
                results=[],
                error="embedding_service_unavailable",
            )
            return ClimateToolResult(
                used=False,
                prompt_context=None,
                invocation=invocation,
                reason="embedding_service_unavailable",
            )

        # Generate embedding for the question
        logger.info("Generating embedding for vector search query")
        embedding_result = await embedding_service.generate_embedding(text)
        if not embedding_result.success or not embedding_result.embedding:
            logger.error(
                "Failed to generate embedding for vector search - error: %s",
                embedding_result.error or "unknown"
            )
            invocation = ToolInvocationRecord(
                name=self.tool_name,
                status="error",
                arguments={"question": text, "top_k": top_k or self.top_k},
                results=[],
                error=embedding_result.error or "embedding_failed",
            )
            return ClimateToolResult(
                used=True,  # Tool was called but failed
                prompt_context=None,
                invocation=invocation,
                reason=embedding_result.error or "embedding_failed",
            )
        
        logger.info(
            "Embedding generated successfully - model: %s, dimension: %s",
            embedding_result.model,
            len(embedding_result.embedding) if embedding_result.embedding else 0
        )

        # Use provided top_k or default
        limit = max(1, top_k or self.top_k)

        # Run the vector search
        if session is not None:
            return await self._run_with_session(
                question=text,
                session=session,
                embedding=embedding_result,
                limit=limit,
            )

        session_factory = self._get_session_factory()
        if session_factory is None:
            invocation = ToolInvocationRecord(
                name=self.tool_name,
                status="error",
                arguments={"question": text, "top_k": limit},
                results=[],
                error="session_factory_unavailable",
            )
            return ClimateToolResult(
                used=False,
                prompt_context=None,
                invocation=invocation,
                reason="session_factory_unavailable",
            )

        async with session_factory() as owned_session:
            return await self._run_with_session(
                question=text,
                session=owned_session,
                embedding=embedding_result,
                limit=limit,
            )

    async def _run_with_session(
        self,
        *,
        question: str,
        session: AsyncSession,
        embedding: EmbeddingResult,
        limit: int,
    ) -> ClimateToolResult:
        logger.info(
            "Executing vector database search - model: %s, limit: %s, min_score: %s",
            embedding.model,
            limit,
            self.min_score
        )
        
        distance_expr = DocumentEmbedding.embedding_vector.cosine_distance(embedding.embedding)
        stmt = (
            select(
                DocumentEmbedding.embedding_id,
                DocumentEmbedding.filename,
                DocumentEmbedding.file_path,
                DocumentEmbedding.file_type,
                DocumentEmbedding.chunk_content,
                DocumentEmbedding.chunk_index,
                DocumentEmbedding.chunk_size,
                DocumentEmbedding.model_name,
                distance_expr.label("distance"),
            )
            .where(DocumentEmbedding.model_name == embedding.model)
            .order_by(distance_expr)
            .limit(limit)
        )

        result = await session.execute(stmt)
        rows = result.fetchall()
        
        logger.info("Vector search returned %s raw results from database", len(rows))

        matches: List[VectorSearchMatch] = []
        filtered_count = 0
        for row in rows:
            data = row._mapping
            distance = float(data["distance"]) if data["distance"] is not None else 1.0
            score = max(0.0, min(1.0, 1.0 - distance))
            if score < self.min_score:
                filtered_count += 1
                continue
            matches.append(
                VectorSearchMatch(
                    filename=data["filename"],
                    file_path=data.get("file_path"),
                    chunk_index=data["chunk_index"],
                    chunk_size=data["chunk_size"],
                    content=data["chunk_content"],
                    score=score,
                    distance=distance,
                    model_name=data["model_name"],
                )
            )

        if filtered_count > 0:
            logger.info(
                "Filtered out %s results below min_score threshold (%s)",
                filtered_count,
                self.min_score
            )
        
        if matches:
            match_scores = [f"{m.score:.3f}" for m in matches]
            logger.info(
                "Vector search completed - %s matches found with scores: %s",
                len(matches),
                ", ".join(match_scores)
            )
            logger.info(
                "Top match: filename='%s', chunk_index=%s, score=%.3f",
                matches[0].filename,
                matches[0].chunk_index,
                matches[0].score
            )

        if not matches:
            logger.warning(
                "Vector search completed with no matches - question: '%s', raw_results: %s, filtered: %s",
                question,
                len(rows),
                filtered_count
            )
            invocation = ToolInvocationRecord(
                name=self.tool_name,
                status="no_results",
                arguments={
                    "question": question,
                    "top_k": limit,
                    "model": embedding.model,
                },
                results=[],
            )
            return ClimateToolResult(
                used=True,
                prompt_context=None,
                matches=[],
                invocation=invocation,
                reason="no_matches",
            )

        invocation = ToolInvocationRecord(
            name=self.tool_name,
            status="success",
            arguments={
                "question": question,
                "top_k": limit,
                "model": embedding.model,
            },
            results=[match.to_dict() for match in matches],
        )

        prompt_context = self._build_prompt_context(matches)

        return ClimateToolResult(
            used=True,
            prompt_context=prompt_context,
            matches=matches,
            invocation=invocation,
        )

    def _build_prompt_context(self, matches: Sequence[VectorSearchMatch]) -> str:
        lines: List[str] = [
            "Relevant climate knowledge base excerpts were retrieved. Use them to ground your response when helpful.",
        ]
        for idx, match in enumerate(matches, start=1):
            # Include full content without truncation
            content = match.content.strip()
            lines.append(
                f"{idx}. Source: {match.filename} (chunk {match.chunk_index}, score {match.score:.2f})"
            )
            lines.append(f"   Full Content: {content}")
        lines.append("Always cite insights as coming from the internal climate knowledge base, not from personal memory.")
        return "\n".join(lines)
