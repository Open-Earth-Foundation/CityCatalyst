"""
Text processing utilities for document splitting and embedding preparation.

This module provides functions for:
- PDF text extraction
- Text chunking/splitting
- Text cleaning and preprocessing
"""

import re
from pathlib import Path
from typing import List, Optional, Dict, Any

from PyPDF2 import PdfReader

# Import configuration
try:
    from ..config_loader import get_embedding_config
except ImportError:
    # Handle case when running module directly
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(__file__)))
    from config_loader import get_embedding_config


class PDFProcessor:
    """Handles PDF text extraction and processing."""

    @staticmethod
    def extract_text_from_pdf(file_path: str) -> str:
        """
        Extract text content from a PDF file.

        Args:
            file_path: Path to the PDF file

        Returns:
            Extracted text content as a string

        Raises:
            FileNotFoundError: If the PDF file doesn't exist
            Exception: If there's an error reading the PDF
        """
        if not Path(file_path).exists():
            raise FileNotFoundError(f"PDF file not found: {file_path}")

        try:
            reader = PdfReader(file_path)
            text_content = []

            for page in reader.pages:
                text = page.extract_text()
                if text.strip():  # Only add non-empty pages
                    text_content.append(text.strip())

            return "\n\n".join(text_content)
        except Exception as e:
            raise Exception(f"Error extracting text from PDF {file_path}: {str(e)}")


class TextSplitter:
    """Handles text splitting for embedding generation."""

    MIN_CHUNK_CHARS = 50

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
        separators: Optional[List[str]] = None
    ):
        """
        Initialize the text splitter.

        Args:
            chunk_size: Maximum size of each chunk in characters
            chunk_overlap: Number of characters to overlap between chunks
            separators: Custom separators to use for splitting (optional)
        """
        # Get configuration values
        config = get_embedding_config()

        # Use config values if not provided
        if chunk_size is None:
            chunk_size = config.default_chunk_size
        if chunk_overlap is None:
            chunk_overlap = config.default_chunk_overlap

        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

        # Default separators for climate-related documents
        default_separators = [
            "\n\n",  # Paragraph breaks
            "\n",    # Line breaks
            ". ",    # Sentence breaks
            " ",     # Word breaks
            ""       # Character breaks (fallback)
        ]

        self.separators = separators or default_separators

    def split_text(self, text: str) -> List[str]:
        """
        Split text into chunks suitable for embedding.

        Args:
            text: The text to split

        Returns:
            List of text chunks
        """
        if not text or not text.strip():
            return []

        # Clean the text before splitting
        cleaned_text = self._clean_text(text)
        if not cleaned_text:
            return []

        chunks = self._split_cleaned_text(cleaned_text)

        # Filter out very short chunks (less than 50 characters)
        filtered_chunks = [chunk for chunk in chunks if len(chunk.strip()) >= self.MIN_CHUNK_CHARS]

        return filtered_chunks

    def _clean_text(self, text: str) -> str:
        """
        Clean text by removing excessive whitespace and normalizing.

        Args:
            text: Raw text to clean

        Returns:
            Cleaned text
        """
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        text = text.replace('\u00a0', ' ')

        # Normalize horizontal whitespace while preserving line and paragraph boundaries.
        text = re.sub(r'[ \t\f\v]+', ' ', text)
        text = re.sub(r' *\n *', '\n', text)
        text = re.sub(r'\n{3,}', '\n\n', text)

        # Remove leading/trailing whitespace
        text = text.strip()

        return text

    def _split_cleaned_text(self, cleaned_text: str) -> List[str]:
        """Split already-cleaned text into raw chunks before min-size filtering."""
        if not cleaned_text:
            return []

        units = self._split_into_units(cleaned_text, self.separators)
        return self._merge_units(units)

    def _split_into_units(self, text: str, separators: List[str]) -> List[str]:
        """Recursively split text into ordered units that can be merged into chunks."""
        if not text:
            return []

        if len(text) <= self.chunk_size:
            return [text]

        separator, remaining_separators = self._select_separator(text, separators)
        if separator == "":
            return list(text)

        units: List[str] = []
        for part in self._split_keep_separator(text, separator):
            if not part:
                continue
            if len(part) <= self.chunk_size:
                units.append(part)
            else:
                units.extend(self._split_into_units(part, remaining_separators))

        return units

    def _select_separator(self, text: str, separators: List[str]) -> tuple[str, List[str]]:
        """Choose the highest-priority separator present in the text."""
        for index, separator in enumerate(separators):
            if separator == "" or separator in text:
                next_separators = separators[index + 1:] or [""]
                return separator, next_separators
        return "", [""]

    def _split_keep_separator(self, text: str, separator: str) -> List[str]:
        """Split text while keeping the separator attached to the preceding unit."""
        if separator == "":
            return list(text)

        parts = text.split(separator)
        chunks: List[str] = []
        for index, part in enumerate(parts):
            if not part and index == len(parts) - 1:
                continue

            piece = part
            if index < len(parts) - 1:
                piece += separator

            if piece:
                chunks.append(piece)

        return chunks

    def _merge_units(self, units: List[str]) -> List[str]:
        """Merge ordered units into chunks capped by chunk_size with overlap."""
        if not units:
            return []

        chunks: List[str] = []
        start = 0
        overlap_target = max(0, self.chunk_overlap)

        while start < len(units):
            total_size = 0
            end = start

            while end < len(units):
                next_size = len(units[end])
                if total_size and total_size + next_size > self.chunk_size:
                    break
                if not total_size and next_size > self.chunk_size:
                    break
                total_size += next_size
                end += 1

            if end == start:
                # Defensive fallback if an oversized unit survives recursion.
                end = start + 1

            chunks.append("".join(units[start:end]))

            if end >= len(units):
                break

            if overlap_target == 0:
                start = end
                continue

            overlap_size = 0
            next_start = end
            while next_start > start + 1 and overlap_size + len(units[next_start - 1]) <= overlap_target:
                next_start -= 1
                overlap_size += len(units[next_start])

            start = next_start if next_start < end else end

        return chunks


class DocumentProcessor:
    """High-level document processing combining PDF extraction and text splitting."""

    def __init__(self, chunk_size: Optional[int] = None, chunk_overlap: Optional[int] = None):
        """
        Initialize the document processor.

        Args:
            chunk_size: Size of text chunks for splitting (uses config default if None)
            chunk_overlap: Overlap between chunks (uses config default if None)
        """
        # Get configuration values if not provided
        config = get_embedding_config()
        if chunk_size is None:
            chunk_size = config.default_chunk_size
        if chunk_overlap is None:
            chunk_overlap = config.default_chunk_overlap

        self.text_splitter = TextSplitter(chunk_size, chunk_overlap)
        self.pdf_processor = PDFProcessor()

    def process_pdf_file(
        self,
        file_path: str,
        filename: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process a PDF file and return structured data for database storage.

        Args:
            file_path: Path to the PDF file
            filename: Optional custom filename (defaults to actual filename)
            metadata: Optional metadata to store with the document

        Returns:
            Dictionary containing:
            - filename: Original filename
            - file_path: Path to the file
            - file_type: 'pdf'
            - file_size: Size in bytes
            - content: Extracted text content
            - chunks: List of text chunks with metadata
        """
        file_path_obj = Path(file_path)
        if not file_path_obj.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        filename = filename or file_path_obj.name
        file_size = file_path_obj.stat().st_size

        # Extract text from PDF
        text_content = self.pdf_processor.extract_text_from_pdf(str(file_path_obj))

        # Split text into chunks
        chunks = self.text_splitter.split_text(text_content)

        # Prepare chunk data with metadata
        chunk_data = []
        for i, chunk_content in enumerate(chunks):
            chunk_metadata = {
                "chunk_index": i,
                "chunk_size": len(chunk_content),
                "start_char": text_content.find(chunk_content),
                "end_char": text_content.find(chunk_content) + len(chunk_content)
            }

            chunk_data.append({
                "chunk_index": i,
                "content": chunk_content,
                "metadata": chunk_metadata
            })

        return {
            "filename": filename,
            "file_path": str(file_path_obj),
            "file_type": "pdf",
            "file_size": file_size,
            "content": text_content,
            "chunks": chunk_data,
            "metadata": metadata or {}
        }

    def process_directory(self, directory_path: str) -> List[Dict[str, Any]]:
        """
        Process all PDF files in a directory.

        Args:
            directory_path: Path to directory containing PDF files

        Returns:
            List of processed document data
        """
        directory = Path(directory_path)
        if not directory.exists() or not directory.is_dir():
            raise ValueError(f"Directory not found: {directory_path}")

        pdf_files = list(directory.glob("*.pdf"))
        if not pdf_files:
            print(f"No PDF files found in {directory_path}")
            return []

        processed_docs = []
        for pdf_file in pdf_files:
            try:
                print(f"Processing {pdf_file.name}...")
                doc_data = self.process_pdf_file(str(pdf_file))
                processed_docs.append(doc_data)
                print(f"[SUCCESS] Processed {pdf_file.name} ({len(doc_data['chunks'])} chunks)")
            except Exception as e:
                print(f"[FAILED] Failed to process {pdf_file.name}: {str(e)}")

        return processed_docs
