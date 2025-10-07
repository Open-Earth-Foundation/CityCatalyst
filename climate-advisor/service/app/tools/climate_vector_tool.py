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

    def to_dict(self, preview_length: int = 280) -> Dict[str, Any]:
        preview = self.content.strip().replace("\n", " ")
        if len(preview) > preview_length:
            preview = preview[:preview_length].rstrip() + "..."
        return {
            "filename": self.filename,
            "file_path": self.file_path,
            "chunk_index": self.chunk_index,
            "chunk_size": self.chunk_size,
            "score": round(self.score, 4),
            "distance": round(self.distance, 4),
            "model_name": self.model_name,
            "excerpt": preview,
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
    tool_name = "climate_vector_search"
    _keywords = {
        "climate",
        "climate change",
        "emission",
        "emissions",
        "co2",
        "carbon",
        "greenhouse",
        "ghg",
        "warming",
        "net zero",
        "decarbon",
        "sustainability",
        "resilience",
        "adaptation",
        "renewable",
        "energy transition",
        "climat",
        "climatology",
        "mitigation",
        "sea level",
        "heatwave",
        "flood",
        "drought",
        "pollution",
    }
    _keyword_pattern = re.compile(r"\b(" + r"|".join(re.escape(k) for k in sorted(_keywords, key=len, reverse=True)) + r")\b", re.IGNORECASE)

    def __init__(
        self,
        *,
        top_k: int = 4,
        min_score: float = 0.6,
        session_factory: Optional[async_sessionmaker[AsyncSession]] = None,
        embedding_service: Optional[EmbeddingService] = None,
        preview_chars: int = 320,
    ) -> None:
        self.top_k = top_k
        self.min_score = min_score
        self.preview_chars = preview_chars
        self._session_factory = session_factory
        self._embedding_service = embedding_service

    def is_climate_related(self, text: str) -> bool:
        if not text:
            return False
        return bool(self._keyword_pattern.search(text))

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
        text = (question or "").strip()
        if not text:
            return ClimateToolResult(used=False, prompt_context=None, reason="empty_question")

        if not self.is_climate_related(text):
            return ClimateToolResult(used=False, prompt_context=None, reason="not_climate_related")

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

        embedding_result = await embedding_service.generate_embedding(text)
        if not embedding_result.success or not embedding_result.embedding:
            invocation = ToolInvocationRecord(
                name=self.tool_name,
                status="error",
                arguments={"question": text, "top_k": top_k or self.top_k},
                results=[],
                error=embedding_result.error or "embedding_failed",
            )
            return ClimateToolResult(
                used=True,
                prompt_context=None,
                invocation=invocation,
                reason=embedding_result.error or "embedding_failed",
            )

        limit = max(1, top_k or self.top_k)

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

        matches: List[VectorSearchMatch] = []
        for row in rows:
            data = row._mapping
            distance = float(data["distance"]) if data["distance"] is not None else 1.0
            score = max(0.0, min(1.0, 1.0 - distance))
            if score < self.min_score:
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

        if not matches:
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
            results=[match.to_dict(preview_length=self.preview_chars) for match in matches],
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
            snippet = match.content.strip().replace("\n", " ")
            if len(snippet) > self.preview_chars:
                snippet = snippet[: self.preview_chars].rstrip() + "..."
            lines.append(
                f"{idx}. Source: {match.filename} (chunk {match.chunk_index}, score {match.score:.2f})"
            )
            lines.append(f"   Excerpt: {snippet}")
        lines.append("Always cite insights as coming from the internal climate knowledge base, not from personal memory.")
        return "\n".join(lines)
