"""
Integration tests for the prioritizer API endpoints.
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch
import uuid

# Add the app directory to the Python path
app_dir = Path(__file__).parent.parent.parent / "app"
sys.path.insert(0, str(app_dir))


@pytest.mark.integration
class TestPrioritizerAPI:
    """Test cases for prioritizer API endpoints."""

    @patch("prioritizer.api.get_context")
    @patch("prioritizer.api.get_actions")
    def test_start_prioritization_success(
        self, mock_get_actions, mock_get_context, client, sample_city_data_request
    ):
        """Test successful start of prioritization process."""
        # Mock the external API calls
        mock_get_context.return_value = {
            "locode": "BR RIO",
            "name": "Rio de Janeiro",
            "biome": "Atlantic Forest",
        }

        mock_get_actions.return_value = [
            {
                "ActionID": "MIT001",
                "ActionName": "Solar Installation",
                "ActionType": ["mitigation"],
                "BiomeCompatibility": ["Atlantic Forest"],
            },
            {
                "ActionID": "ADA001",
                "ActionName": "Flood Defense",
                "ActionType": ["adaptation"],
                "BiomeCompatibility": ["Atlantic Forest"],
            },
        ]

        # Make the API call
        response = client.post(
            "/prioritizer/v1/start_prioritization", json=sample_city_data_request
        )

        # Verify response
        assert response.status_code == 202
        data = response.json()

        assert "taskId" in data
        assert "status" in data
        assert data["status"] == "running"

        # Verify taskId is a valid UUID
        try:
            uuid.UUID(data["taskId"])
        except ValueError:
            pytest.fail("taskId is not a valid UUID")

    def test_start_prioritization_invalid_request(self, client):
        """Test prioritization with invalid request data."""
        invalid_request = {
            "cityData": {
                "cityContextData": {
                    "locode": "",  # Invalid empty locode
                    "populationSize": -1000,  # Invalid negative population
                }
            }
        }

        response = client.post(
            "/prioritizer/v1/start_prioritization", json=invalid_request
        )

        # Should return validation error
        assert response.status_code == 422

    def test_check_progress_nonexistent_task(self, client):
        """Test checking progress for non-existent task."""
        fake_uuid = str(uuid.uuid4())

        response = client.get(
            f"/prioritizer/v1/check_prioritization_progress/{fake_uuid}"
        )

        assert response.status_code == 404

    def test_get_prioritization_nonexistent_task(self, client):
        """Test getting results for non-existent task."""
        fake_uuid = str(uuid.uuid4())

        response = client.get(f"/prioritizer/v1/get_prioritization/{fake_uuid}")

        assert response.status_code == 404

    @patch("prioritizer.api.get_context")
    def test_start_prioritization_no_context_data(
        self, mock_get_context, client, sample_city_data_request
    ):
        """Test prioritization when context data is not available."""
        # Mock context API to return None
        mock_get_context.return_value = None

        response = client.post(
            "/prioritizer/v1/start_prioritization", json=sample_city_data_request
        )

        # Should still start the task, but it will fail in background
        assert response.status_code == 202
        data = response.json()
        assert "taskId" in data

    def test_prioritizer_endpoints_require_post_data(self, client):
        """Test that prioritizer endpoints require proper POST data."""
        response = client.post("/prioritizer/v1/start_prioritization")

        # Should return 422 for missing request body
        assert response.status_code == 422


@pytest.mark.integration
@pytest.mark.slow
class TestPrioritizerWorkflow:
    """Test complete prioritizer workflow (marked as slow)."""

    @patch("prioritizer.api.get_context")
    @patch("prioritizer.api.get_actions")
    @patch("prioritizer.api.filter_actions_by_biome")
    @patch("prioritizer.api.tournament_ranking")
    @patch("prioritizer.api.generate_multilingual_explanation")
    def test_complete_prioritization_workflow(
        self,
        mock_explanation,
        mock_tournament,
        mock_filter,
        mock_get_actions,
        mock_get_context,
        client,
        sample_city_data_request,
    ):
        """Test the complete prioritization workflow from start to finish."""

        # Setup all mocks
        mock_get_context.return_value = {
            "locode": "BRRIO",
            "name": "Rio de Janeiro",
            "biome": "Atlantic Forest",
        }

        mock_actions = [
            {
                "ActionID": "MIT001",
                "ActionName": "Solar Installation",
                "ActionType": ["mitigation"],
            }
        ]
        mock_get_actions.return_value = mock_actions
        mock_filter.return_value = mock_actions
        mock_tournament.return_value = [(mock_actions[0], 1)]
        mock_explanation.return_value = {
            "en": "Highly effective action",
            "es": "Acción muy efectiva",
            "pt": "Ação muito eficaz",
        }

        # Start prioritization
        response = client.post(
            "/prioritizer/v1/start_prioritization", json=sample_city_data_request
        )
        assert response.status_code == 202

        task_id = response.json()["taskId"]

        # Note: In a real test, you'd need to wait for the background task
        # or use async testing to properly test the complete workflow
        # This test mainly verifies the endpoint structure
