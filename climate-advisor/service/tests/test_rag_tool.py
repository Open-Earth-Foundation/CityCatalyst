"""
Unit tests for the ClimateVectorSearchTool verifying that the LLM-facing
interface retrieves full chunk content for retrieval-augmented generation.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
import unittest
from unittest.mock import AsyncMock


PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.tools.climate_vector_tool import ClimateToolResult, ClimateVectorSearchTool
from app.config.settings import _load_llm_config

# Load configuration from llm_config.yaml
_llm_config = _load_llm_config()
_default_top_k = _llm_config.tools.climate_vector_search.get("top_k", 3)
_default_min_score = _llm_config.tools.climate_vector_search.get("min_score", 0.6)


class _FakeRow:
    """Simple row object that mimics SQLAlchemy RowMapping behaviour."""

    def __init__(self, mapping: Dict[str, Any]) -> None:
        self._mapping = mapping


class _FakeResult:
    """Return value for the fake session execute method."""

    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = rows

    def fetchall(self) -> List[_FakeRow]:
        return [_FakeRow(row) for row in self._rows]


class _FakeSession:
    """Minimal async session that records limit usage and returns canned rows."""

    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = rows
        self.received_limits: List[Optional[int]] = []

    async def execute(self, stmt) -> _FakeResult:  # type: ignore[override]
        limit_clause = getattr(stmt, "_limit_clause", None)
        limit_value: Optional[int] = None
        if limit_clause is not None:
            raw_value = getattr(limit_clause, "value", None)
            if raw_value is not None:
                limit_value = int(raw_value)
        self.received_limits.append(limit_value)
        if limit_value is None:
            selected_rows = list(self._rows)
        else:
            selected_rows = list(self._rows[:limit_value])
        return _FakeResult(selected_rows)

    async def close(self) -> None:
        return None


class _FakeSessionContext:
    """Async context manager wrapper for the fake session."""

    def __init__(self, session: _FakeSession) -> None:
        self._session = session

    async def __aenter__(self) -> _FakeSession:
        return self._session

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        await self._session.close()
        return False


class _FakeSessionFactory:
    """Callable that mimics an async session maker."""

    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self.session = _FakeSession(rows)

    def __call__(self) -> _FakeSessionContext:
        return _FakeSessionContext(self.session)


class ClimateVectorSearchToolConfigTests(unittest.TestCase):
    """Synchronous tests that cover basic configuration."""

    def test_tool_initialization_defaults(self) -> None:
        tool = ClimateVectorSearchTool()
        self.assertEqual(tool.tool_name, "climate_vector_search")
        self.assertEqual(tool.top_k, _default_top_k)
        self.assertAlmostEqual(tool.min_score, _default_min_score)


class ClimateVectorSearchToolBehaviorTests(unittest.IsolatedAsyncioTestCase):
    """Async behaviour tests that exercise the RAG workflow with fakes."""

    async def asyncSetUp(self) -> None:
        distances = [0.08, 0.12, 0.18, 0.22, 0.25, 0.65]
        self.rows: List[Dict[str, Any]] = []
        for idx, distance in enumerate(distances, start=1):
            content = f"Chunk {idx} full content explaining climate disclosures section {idx}."
            self.rows.append(
                {
                    "embedding_id": idx,
                    "filename": "GPC_Full_MASTER_RW_v7.pdf",
                    "file_path": "/docs/GPC_Full_MASTER_RW_v7.pdf",
                    "file_type": "application/pdf",
                    "chunk_content": content,
                    "chunk_index": idx,
                    "chunk_size": len(content),
                    "model_name": "text-embedding-3-large",
                    "distance": distance,
                }
            )

        self.session_factory = _FakeSessionFactory(self.rows)

        async def _fake_generate(question: str) -> SimpleNamespace:
            return SimpleNamespace(
                text=question,
                embedding=[0.01] * 8,
                model="text-embedding-3-large",
                tokens_used=len(question),
                success=True,
                error=None,
            )

        self.embedding_service = AsyncMock()
        self.embedding_service.generate_embedding = AsyncMock(side_effect=_fake_generate)

        self.tool = ClimateVectorSearchTool(
            session_factory=self.session_factory,
            embedding_service=self.embedding_service,
        )

    async def test_run_returns_full_content_for_five_chunks(self) -> None:
        question = "How do cities measure greenhouse gas emissions under the GPC?"
        result = await self.tool.run(question)

        self.embedding_service.generate_embedding.assert_awaited_once_with(question)
        self.assertTrue(result.used)
        self.assertIsInstance(result, ClimateToolResult)
        self.assertEqual(len(result.matches), _default_top_k)
        self.assertEqual(self.session_factory.session.received_limits, [_default_top_k])
        self.assertIsNotNone(result.prompt_context)
        assert result.prompt_context is not None  # mypy/type-check friendly
        self.assertTrue(result.prompt_context.startswith("Relevant climate knowledge base excerpts"))
        self.assertEqual(result.prompt_context.count("Full Content:"), _default_top_k)

        for match, row in zip(result.matches, self.rows[:_default_top_k]):
            self.assertEqual(match.filename, row["filename"])
            self.assertEqual(match.chunk_index, row["chunk_index"])
            self.assertEqual(match.content, row["chunk_content"])
            self.assertAlmostEqual(match.score, max(0.0, min(1.0, 1.0 - row["distance"])))
            self.assertIn(row["chunk_content"], result.prompt_context)

        self.assertIsNotNone(result.invocation)
        assert result.invocation is not None
        self.assertEqual(result.invocation.name, self.tool.tool_name)
        self.assertEqual(result.invocation.status, "success")
        self.assertEqual(result.invocation.arguments.get("top_k"), _default_top_k)
        self.assertEqual(len(result.invocation.results), _default_top_k)
        for record, row in zip(result.invocation.results, self.rows[:_default_top_k]):
            self.assertIn("content", record)
            self.assertEqual(record["content"], row["chunk_content"])
            self.assertNotIn("excerpt", record)

    async def test_runtime_top_k_override_limits_results(self) -> None:
        question = "What adaptation actions reduce climate risk?"
        result = await self.tool.run(question, top_k=3)

        self.embedding_service.generate_embedding.assert_awaited_once_with(question)
        self.assertEqual(len(result.matches), 3)
        self.assertEqual(self.session_factory.session.received_limits, [3])
        self.assertIsNotNone(result.invocation)
        assert result.invocation is not None
        self.assertEqual(result.invocation.arguments.get("top_k"), 3)
        self.assertEqual(result.prompt_context.count("Full Content:"), 3)
        for match, row in zip(result.matches, self.rows[:3]):
            self.assertEqual(match.content, row["chunk_content"])

    async def test_empty_question_short_circuits_tool(self) -> None:
        result = await self.tool.run("   ")

        self.assertFalse(result.used)
        self.assertEqual(result.reason, "empty_question")
        self.embedding_service.generate_embedding.assert_not_awaited()
        self.assertEqual(self.session_factory.session.received_limits, [])

    async def test_high_min_score_produces_no_results(self) -> None:
        self.tool.min_score = 0.95  # Only allow near-perfect matches

        question = "Explain the scopes enumerated in the GPC."
        result = await self.tool.run(question)

        self.embedding_service.generate_embedding.assert_awaited_once_with(question)
        self.assertTrue(result.used)
        self.assertEqual(len(result.matches), 0)
        self.assertIsNone(result.prompt_context)
        self.assertIsNotNone(result.invocation)
        assert result.invocation is not None
        self.assertEqual(result.invocation.status, "no_results")
        self.assertEqual(result.invocation.arguments.get("top_k"), _default_top_k)
        self.assertEqual(result.invocation.results, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
