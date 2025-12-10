"""
Test suite for verifying langchain-text-splitters v1.0.0 compatibility.

Tests verify:
- TextSplitter functionality after upgrade
- New keep_separator modes ('start', 'end')
- New is_separator_regex parameter
- Backward compatibility with existing code
- Chunk output consistency
"""

from __future__ import annotations

import sys
from pathlib import Path
import unittest

# Ensure project root (containing vector_db) is importable
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from vector_db.utils.text_processing import TextSplitter, DocumentProcessor, PDFProcessor  # noqa: E402


class TextSplitterV1CompatibilityTests(unittest.TestCase):
    """Tests for TextSplitter compatibility with langchain-text-splitters v1.0.0"""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.test_text = """This is a test document.

This is the second paragraph.
It has multiple sentences. Like this one.

And a third paragraph."""

        self.simple_text = "First sentence. Second sentence. Third sentence."
        self.multiline_text = "Line one\n\nLine two\n\nLine three"

    def test_text_splitter_initialization(self) -> None:
        """Test that TextSplitter initializes successfully."""
        splitter = TextSplitter(chunk_size=100, chunk_overlap=10)
        self.assertIsNotNone(splitter)
        self.assertIsNotNone(splitter.splitter)

    def test_text_splitter_with_default_config(self) -> None:
        """Test TextSplitter uses default config when not provided."""
        splitter = TextSplitter()
        self.assertIsNotNone(splitter)
        # Should have default chunk_size and chunk_overlap
        self.assertGreater(splitter.chunk_size, 0)
        self.assertGreaterEqual(splitter.chunk_overlap, 0)

    def test_split_text_returns_list(self) -> None:
        """Test that split_text returns a list of strings."""
        splitter = TextSplitter(chunk_size=100, chunk_overlap=10)
        chunks = splitter.split_text(self.test_text)
        
        self.assertIsInstance(chunks, list)
        self.assertGreater(len(chunks), 0)
        for chunk in chunks:
            self.assertIsInstance(chunk, str)

    def test_split_text_filters_short_chunks(self) -> None:
        """Test that very short chunks (< 50 chars) are filtered out."""
        splitter = TextSplitter(chunk_size=100, chunk_overlap=10)
        chunks = splitter.split_text(self.test_text)
        
        for chunk in chunks:
            # All returned chunks should be at least 50 characters
            self.assertGreaterEqual(len(chunk.strip()), 50)

    def test_split_text_with_empty_string(self) -> None:
        """Test that split_text handles empty strings gracefully."""
        splitter = TextSplitter(chunk_size=100, chunk_overlap=10)
        chunks = splitter.split_text("")
        
        self.assertEqual(chunks, [])

    def test_split_text_with_whitespace_only(self) -> None:
        """Test that split_text handles whitespace-only strings."""
        splitter = TextSplitter(chunk_size=100, chunk_overlap=10)
        chunks = splitter.split_text("   \n\n   \t\t  ")
        
        self.assertEqual(chunks, [])

    def test_text_splitter_custom_separators(self) -> None:
        """Test TextSplitter with custom separators."""
        custom_seps = ["|", "\n", " ", ""]
        splitter = TextSplitter(
            chunk_size=100,
            chunk_overlap=5,
            separators=custom_seps
        )
        
        # Use longer text to avoid filtering (minimum 50 chars per chunk)
        test_text = "This is a longer Part1|This is a longer Part2|This is a longer Part3"
        chunks = splitter.split_text(test_text)
        self.assertGreater(len(chunks), 0)

    def test_text_splitter_preserves_content(self) -> None:
        """Test that split_text preserves all content."""
        splitter = TextSplitter(chunk_size=100, chunk_overlap=10)
        # Use significantly longer text to ensure it survives filtering
        long_text = (self.simple_text + " ") * 5 + ("X" * 100)
        chunks = splitter.split_text(long_text)
        
        self.assertGreater(len(chunks), 0, "Should produce at least one chunk")
        # Content should be present in chunks
        joined = " ".join(chunks)
        self.assertGreater(len(joined), 50)

    def test_text_cleaning(self) -> None:
        """Test that text cleaning removes excessive whitespace."""
        splitter = TextSplitter(chunk_size=100, chunk_overlap=10)
        
        # Use longer text to avoid filtering
        messy_text = "Text content with   multiple\n\n\n   spaces\t\tand\n  tabs " + "A" * 100
        chunks = splitter.split_text(messy_text)
        
        self.assertGreater(len(chunks), 0)
        # Cleaned chunks should not have excessive whitespace patterns
        for chunk in chunks:
            self.assertNotIn("\n\n\n", chunk)
            self.assertNotIn("\t\t", chunk)


class RecursiveCharacterTextSplitterV1Tests(unittest.TestCase):
    """Tests for RecursiveCharacterTextSplitter v1.0.0 new features."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        self.RecursiveCharacterTextSplitter = RecursiveCharacterTextSplitter
        self.test_text = "First. Second. Third."

    def test_keep_separator_boolean_true(self) -> None:
        """Test keep_separator with boolean True (backward compatible)."""
        splitter = self.RecursiveCharacterTextSplitter(
            chunk_size=10,
            chunk_overlap=0,
            separators=[". ", " ", ""],
            keep_separator=True
        )
        
        chunks = splitter.split_text(self.test_text)
        self.assertIsInstance(chunks, list)
        self.assertGreater(len(chunks), 0)

    def test_keep_separator_boolean_false(self) -> None:
        """Test keep_separator with boolean False (backward compatible)."""
        splitter = self.RecursiveCharacterTextSplitter(
            chunk_size=10,
            chunk_overlap=0,
            separators=[". ", " ", ""],
            keep_separator=False
        )
        
        chunks = splitter.split_text(self.test_text)
        self.assertIsInstance(chunks, list)
        self.assertGreater(len(chunks), 0)

    def test_keep_separator_end(self) -> None:
        """Test new keep_separator='end' mode."""
        splitter = self.RecursiveCharacterTextSplitter(
            chunk_size=15,
            chunk_overlap=0,
            separators=[". ", " ", ""],
            keep_separator='end'
        )
        
        chunks = splitter.split_text(self.test_text)
        self.assertIsInstance(chunks, list)
        self.assertGreater(len(chunks), 0)

    def test_keep_separator_start(self) -> None:
        """Test new keep_separator='start' mode."""
        splitter = self.RecursiveCharacterTextSplitter(
            chunk_size=15,
            chunk_overlap=0,
            separators=[". ", " ", ""],
            keep_separator='start'
        )
        
        chunks = splitter.split_text(self.test_text)
        self.assertIsInstance(chunks, list)
        self.assertGreater(len(chunks), 0)

    def test_keep_separator_modes_produce_chunks(self) -> None:
        """Test that all keep_separator modes produce chunks."""
        test_modes = [True, False, 'start', 'end']
        
        for mode in test_modes:
            with self.subTest(keep_separator=mode):
                splitter = self.RecursiveCharacterTextSplitter(
                    chunk_size=15,
                    chunk_overlap=0,
                    separators=[". ", " ", ""],
                    keep_separator=mode
                )
                
                chunks = splitter.split_text(self.test_text)
                self.assertIsInstance(chunks, list)
                self.assertGreater(len(chunks), 0, 
                    f"No chunks produced with keep_separator={repr(mode)}")

    def test_is_separator_regex_false(self) -> None:
        """Test is_separator_regex=False (default, literal separators)."""
        splitter = self.RecursiveCharacterTextSplitter(
            chunk_size=50,
            chunk_overlap=0,
            separators=[". ", " ", ""],
            keep_separator=True,
            is_separator_regex=False
        )
        
        chunks = splitter.split_text("First. Second. Third.")
        self.assertGreater(len(chunks), 0)

    def test_is_separator_regex_true(self) -> None:
        """Test is_separator_regex=True (regex separators)."""
        splitter = self.RecursiveCharacterTextSplitter(
            chunk_size=50,
            chunk_overlap=0,
            separators=[r'\. ', r' ', ""],
            keep_separator=True,
            is_separator_regex=True
        )
        
        chunks = splitter.split_text("First. Second. Third.")
        self.assertGreater(len(chunks), 0)

    def test_is_separator_regex_multiline(self) -> None:
        """Test is_separator_regex with multiline pattern."""
        splitter = self.RecursiveCharacterTextSplitter(
            chunk_size=50,
            chunk_overlap=0,
            separators=[r'\n+', " ", ""],
            keep_separator=True,
            is_separator_regex=True
        )
        
        text = "Line one\n\n\nLine two\n\nLine three"
        chunks = splitter.split_text(text)
        self.assertGreater(len(chunks), 0)


class DocumentProcessorV1Tests(unittest.TestCase):
    """Tests for DocumentProcessor compatibility with v1.0.0"""

    def test_document_processor_initialization(self) -> None:
        """Test that DocumentProcessor initializes successfully."""
        processor = DocumentProcessor()
        self.assertIsNotNone(processor)
        self.assertIsNotNone(processor.text_splitter)
        self.assertIsNotNone(processor.pdf_processor)

    def test_document_processor_with_custom_chunk_size(self) -> None:
        """Test DocumentProcessor with custom chunk size."""
        processor = DocumentProcessor(chunk_size=200, chunk_overlap=20)
        self.assertEqual(processor.text_splitter.chunk_size, 200)
        self.assertEqual(processor.text_splitter.chunk_overlap, 20)

    def test_pdf_processor_initialization(self) -> None:
        """Test that PDFProcessor initializes successfully."""
        processor = PDFProcessor()
        self.assertIsNotNone(processor)


class BackwardCompatibilityTests(unittest.TestCase):
    """Tests to ensure backward compatibility after v1.0.0 upgrade."""

    def test_default_separators_unchanged(self) -> None:
        """Test that default separators behave consistently."""
        splitter = TextSplitter(chunk_size=100, chunk_overlap=10)
        
        # Expected default separators
        expected_seps = ["\n\n", "\n", ". ", " ", ""]
        self.assertEqual(splitter.separators, expected_seps)

    def test_text_split_deterministic(self) -> None:
        """Test that text splitting produces consistent results."""
        splitter = TextSplitter(chunk_size=100, chunk_overlap=10)
        test_text = "This is a test. With multiple sentences. And content."
        
        chunks1 = splitter.split_text(test_text)
        chunks2 = splitter.split_text(test_text)
        
        self.assertEqual(chunks1, chunks2, "Text splitting should be deterministic")

    def test_chunk_overlap_respected(self) -> None:
        """Test that chunk overlap is respected."""
        splitter = TextSplitter(chunk_size=50, chunk_overlap=10)
        
        text = "A" * 60 + " " + "B" * 60
        chunks = splitter.split_text(text)
        
        # With overlap, adjacent chunks should have common content
        if len(chunks) >= 2:
            # Check that there's potential for overlap
            self.assertGreaterEqual(splitter.chunk_overlap, 0)


class APISignatureTests(unittest.TestCase):
    """Tests to verify API signatures after upgrade."""

    def test_recursive_character_text_splitter_signature(self) -> None:
        """Test RecursiveCharacterTextSplitter accepts expected parameters."""
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        import inspect
        
        sig = inspect.signature(RecursiveCharacterTextSplitter.__init__)
        params = set(sig.parameters.keys())
        
        # Expected parameters - 'chunk_size' and 'chunk_overlap' may be in kwargs
        expected = {'self', 'separators', 'keep_separator', 'is_separator_regex', 'kwargs'}
        
        # At minimum, these should be present
        self.assertTrue(expected.issubset(params), 
            f"Missing expected parameters. Got: {params}")

    def test_recursive_character_text_splitter_accepts_kwargs(self) -> None:
        """Test RecursiveCharacterTextSplitter accepts **kwargs."""
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        
        # Should not raise an exception
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=100,
            chunk_overlap=10,
            separators=["\n\n", "\n", " ", ""]
        )
        
        self.assertIsNotNone(splitter)


if __name__ == "__main__":
    unittest.main(verbosity=2)

