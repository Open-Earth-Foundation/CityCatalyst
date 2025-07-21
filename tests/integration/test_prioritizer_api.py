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

    @patch("services.get_context.get_context")
    @patch("services.get_actions.get_actions")
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
        assert data["status"] in ["pending", "running"]  # Accept both statuses

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

    def test_start_prioritization_language_validation(self, client):
        """Test prioritization with various language field scenarios."""
        # Test missing language field
        invalid_request: dict = {
            "cityData": {
                "cityContextData": {
                    "locode": "BR RIO",
                    "populationSize": 6748000,
                },
                "cityEmissionsData": {
                    "stationaryEnergyEmissions": 1500.0,
                    "transportationEmissions": 2200.0,
                    "wasteEmissions": 800.0,
                    "ippuEmissions": 300.0,
                    "afoluEmissions": 150.0,
                },
            }
            # Missing language field
        }

        response = client.post(
            "/prioritizer/v1/start_prioritization", json=invalid_request
        )
        assert response.status_code == 422

        # Test empty language list
        invalid_request_with_empty_lang = invalid_request.copy()
        invalid_request_with_empty_lang["language"] = []
        response = client.post(
            "/prioritizer/v1/start_prioritization", json=invalid_request_with_empty_lang
        )
        assert response.status_code == 422

        # Test single language (should succeed)
        valid_request = invalid_request.copy()
        valid_request["language"] = ["en"]
        response = client.post(
            "/prioritizer/v1/start_prioritization", json=valid_request
        )
        assert response.status_code == 202
        data = response.json()
        assert "taskId" in data
        assert "status" in data

    def test_check_progress_nonexistent_task(self, client):
        """Test checking progress for non-existent task."""
        fake_uuid = str(uuid.uuid4())

        response = client.get(
            f"/prioritizer/v1/check_prioritization_progress/{fake_uuid}"
        )

        assert response.status_code == 404

    def test_get_prioritization_nonexistent_tasks(self, client):
        """Test getting results for non-existent tasks (both single and bulk)."""
        fake_uuid = str(uuid.uuid4())

        # Test single prioritization
        response = client.get(f"/prioritizer/v1/get_prioritization/{fake_uuid}")
        assert response.status_code == 404

        # Test bulk prioritization
        response = client.get(f"/prioritizer/v1/get_prioritization_bulk/{fake_uuid}")
        assert response.status_code == 404

    @patch("services.get_context.get_context")
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
class TestPrioritizerWorkflow:
    """Test complete prioritizer workflow"""

    @patch("prioritizer.utils.add_explanations.generate_multilingual_explanation")
    @patch("prioritizer.utils.tournament.tournament_ranking")
    @patch("prioritizer.utils.filter_actions_by_biome.filter_actions_by_biome")
    @patch("services.get_actions.get_actions")
    @patch("services.get_context.get_context")
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
            "explanations": {
                "en": "Highly effective action",
                "es": "Acción muy efectiva",
                "pt": "Ação muito eficaz",
            }
        }

        # Start prioritization
        response = client.post(
            "/prioritizer/v1/start_prioritization", json=sample_city_data_request
        )
        assert response.status_code == 202

        task_id = response.json()["taskId"]
        # Note: Status could be "pending" or "running" depending on background thread timing

        # Note: In a real test, you'd need to wait for the background task
        # or use async testing to properly test the complete workflow
        # This test mainly verifies the endpoint structure

    @patch("services.get_context.get_context")
    @patch("services.get_actions.get_actions")
    def test_bulk_prioritization_workflow(
        self, mock_get_actions, mock_get_context, client
    ):
        """Test bulk prioritization workflow including validation."""
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

        # Test bulk request with missing language field (should fail)
        bulk_request_invalid = {
            "cityDataList": [
                {
                    "cityContextData": {"locode": "BR RIO", "populationSize": 6748000},
                    "cityEmissionsData": {
                        "stationaryEnergyEmissions": 1500.0,
                        "transportationEmissions": 2200.0,
                        "wasteEmissions": 800.0,
                        "ippuEmissions": 300.0,
                        "afoluEmissions": 150.0,
                    },
                }
            ]
            # Missing language field
        }

        response = client.post(
            "/prioritizer/v1/start_prioritization_bulk", json=bulk_request_invalid
        )
        assert response.status_code == 422

        # Test valid bulk request (should succeed)
        bulk_request_valid = {
            "cityDataList": [
                {
                    "cityContextData": {"locode": "BR RIO", "populationSize": 6748000},
                    "cityEmissionsData": {
                        "stationaryEnergyEmissions": 1500.0,
                        "transportationEmissions": 2200.0,
                        "wasteEmissions": 800.0,
                        "ippuEmissions": 300.0,
                        "afoluEmissions": 150.0,
                    },
                },
                {
                    "cityContextData": {"locode": "BR SAO", "populationSize": 12300000},
                    "cityEmissionsData": {
                        "stationaryEnergyEmissions": 2500.0,
                        "transportationEmissions": 3500.0,
                        "wasteEmissions": 1200.0,
                        "ippuEmissions": 500.0,
                        "afoluEmissions": 200.0,
                    },
                },
            ],
            "language": ["en", "es", "pt"],
        }

        response = client.post(
            "/prioritizer/v1/start_prioritization_bulk", json=bulk_request_valid
        )

        # Verify response
        assert response.status_code == 202
        data = response.json()

        assert "taskId" in data
        assert "status" in data
        assert data["status"] in ["pending", "running"]  # Accept both statuses

        # Verify taskId is a valid UUID
        try:
            uuid.UUID(data["taskId"])
        except ValueError:
            pytest.fail("taskId is not a valid UUID")
