from __future__ import annotations

import sys
from pathlib import Path
import unittest

from pgvector.sqlalchemy import Vector

# Ensure project root (containing vector_db) is importable
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from vector_db.models.document import DocumentEmbedding  # noqa: E402


class DocumentEmbeddingModelTests(unittest.TestCase):
    def test_columns_match_migration(self) -> None:
        expected = {
            "embedding_id", 
            "model_name", 
            "embedding_vector", 
            "created_at",
            "filename",
            "file_path",
            "file_type",
            "chunk_content",
            "chunk_index",
            "chunk_size"
        }
        actual = set(DocumentEmbedding.__table__.columns.keys())
        self.assertEqual(actual, expected)

    def test_embedding_vector_uses_pgvector(self) -> None:
        col = DocumentEmbedding.__table__.c.embedding_vector
        self.assertIsInstance(col.type, Vector)
        self.assertFalse(col.nullable)

    def test_model_name_index_exists(self) -> None:
        index_columns = {tuple(index.columns.keys()) for index in DocumentEmbedding.__table__.indexes}
        self.assertIn(("model_name",), index_columns)
    
    def test_filename_index_exists(self) -> None:
        index_columns = {tuple(index.columns.keys()) for index in DocumentEmbedding.__table__.indexes}
        self.assertIn(("filename",), index_columns)
    
    def test_filename_chunk_composite_index_exists(self) -> None:
        index_columns = {tuple(index.columns.keys()) for index in DocumentEmbedding.__table__.indexes}
        self.assertIn(("filename", "chunk_index"), index_columns)


if __name__ == "__main__":
    unittest.main()
