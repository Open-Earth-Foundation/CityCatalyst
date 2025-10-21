"""
Unit tests for the sync climate_vector_search function tool.

This test verifies that the synchronous wrapper for ClimateVectorSearchTool
works correctly with the OpenAI Agents SDK.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.tools.climate_vector_sync import climate_vector_search_sync, _format_tool_result_for_llm
from app.tools.climate_vector_tool import ClimateToolResult, VectorSearchMatch


class SyncToolWrapperTests(unittest.TestCase):
    """Tests for the synchronous climate_vector_search wrapper."""
    
    def test_format_tool_result_for_llm_with_prompt_context(self):
        """Test formatting when prompt_context is available."""
        result = ClimateToolResult(
            used=True,
            prompt_context="Here is formatted context from the knowledge base.",
            matches=[],
            reason=None
        )
        
        formatted = _format_tool_result_for_llm(result)
        self.assertEqual(formatted, "Here is formatted context from the knowledge base.")
    
    def test_format_tool_result_for_llm_not_used(self):
        """Test formatting when tool was not used."""
        result = ClimateToolResult(
            used=False,
            prompt_context=None,
            matches=[],
            reason="empty_question"
        )
        
        formatted = _format_tool_result_for_llm(result)
        self.assertIn("not used", formatted)
        self.assertIn("empty_question", formatted)
    
    def test_format_tool_result_for_llm_no_matches(self):
        """Test formatting when no matches found."""
        result = ClimateToolResult(
            used=True,
            prompt_context=None,
            matches=[],
            reason="no_results"
        )
        
        formatted = _format_tool_result_for_llm(result)
        self.assertIn("No relevant climate information", formatted)
    
    def test_format_tool_result_for_llm_with_matches(self):
        """Test formatting with actual matches."""
        matches = [
            VectorSearchMatch(
                filename="test.pdf",
                chunk_index=1,
                chunk_size=100,
                content="This is test content about climate.",
                score=0.85,
                distance=0.15,
                model_name="test-model",
                file_path="/docs/test.pdf"
            )
        ]
        
        result = ClimateToolResult(
            used=True,
            prompt_context=None,
            matches=matches,
            reason=None
        )
        
        formatted = _format_tool_result_for_llm(result)
        self.assertIn("Found 1 relevant", formatted)
        self.assertIn("test.pdf", formatted)
        self.assertIn("This is test content about climate.", formatted)
        self.assertIn("Relevance Score: 0.85", formatted)
    
    @patch('app.tools.climate_vector_sync.ClimateVectorSearchTool')
    @patch('app.tools.climate_vector_sync.get_settings')
    def test_climate_vector_search_function_success(self, mock_settings, mock_tool_class):
        """Test the sync function tool executes successfully."""
        # Setup mocks
        mock_tool_instance = AsyncMock()
        mock_tool_class.return_value = mock_tool_instance
        
        mock_result = ClimateToolResult(
            used=True,
            prompt_context="Mocked climate information",
            matches=[],
            reason=None
        )
        mock_tool_instance.run.return_value = mock_result
        
        # Execute
        result = climate_vector_search_sync("What is climate change?")
        
        # Verify
        self.assertEqual(result, "Mocked climate information")
        mock_tool_instance.run.assert_awaited_once()
    
    @patch('app.tools.climate_vector_sync.ClimateVectorSearchTool')
    @patch('app.tools.climate_vector_sync.get_settings')
    def test_climate_vector_search_function_error_handling(self, mock_settings, mock_tool_class):
        """Test the sync function tool handles errors gracefully."""
        # Setup mocks to raise an error
        mock_tool_instance = AsyncMock()
        mock_tool_class.return_value = mock_tool_instance
        mock_tool_instance.run.side_effect = Exception("Database error")
        
        # Execute
        result = climate_vector_search_sync("Test question")
        
        # Verify error is caught and returned as string
        self.assertIn("Error executing climate search", result)
        self.assertIn("Database error", result)


if __name__ == "__main__":
    unittest.main(verbosity=2)

