"""
Integration tests for the prioritizer API endpoints.
"""

import uuid
import sys
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

# Add the app directory to the Python path
app_dir = Path(__file__).parent.parent.parent / "app"
sys.path.insert(0, str(app_dir))


@pytest.mark.integration
class TestPrioritizerAPI:
    """Test cases for prioritizer API endpoints."""

    @patch("prioritizer.api._execute_prioritization")
    @patch("prioritizer.api.get_actions")
    def test_start_prioritization_success(
        self,
        mock_get_actions,
        mock_execute_prioritization,
        client,
        sample_city_data_request,
    ):
        """Test successful start of prioritization process."""
        mock_execute_prioritization.return_value = None
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

    def test_start_prioritization_strict_type_validation(self, client):
        """Test stricter Pydantic datatypes (non-negative ints, strict ints, patterns)."""
        # populationSize as string (strict int), invalid locode pattern
        invalid_request_1 = {
            "cityData": {
                "cityContextData": {"locode": "BRRIO", "populationSize": "6748000"},
                "cityEmissionsData": {
                    "stationaryEnergyEmissions": 1500,
                    "transportationEmissions": 2200,
                    "wasteEmissions": 800,
                    "ippuEmissions": 300,
                    "afoluEmissions": 150,
                },
            }
        }

        # negative value for a NonNegativeInteger field
        invalid_request_2 = {
            "cityData": {
                "cityContextData": {"locode": "BR RIO", "populationSize": 6748000},
                "cityEmissionsData": {
                    "stationaryEnergyEmissions": -1,
                    "transportationEmissions": 2200,
                    "wasteEmissions": 800,
                    "ippuEmissions": 300,
                    "afoluEmissions": 0,
                },
            }
        }

        # float provided where strict int is required
        invalid_request_3 = {
            "cityData": {
                "cityContextData": {"locode": "BR RIO", "populationSize": 6748000},
                "cityEmissionsData": {
                    "stationaryEnergyEmissions": 1500,
                    "transportationEmissions": 2200.5,
                    "wasteEmissions": 800,
                    "ippuEmissions": 300,
                    "afoluEmissions": -10,  # allowed to be negative but must be int
                },
            }
        }

        for payload in (invalid_request_1, invalid_request_2, invalid_request_3):
            response = client.post("/prioritizer/v1/start_prioritization", json=payload)
            assert response.status_code == 422

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

    @patch("prioritizer.api._execute_prioritization")
    @patch("prioritizer.api.get_actions")
    def test_start_prioritization_no_context_data(
        self,
        mock_get_actions,
        mock_execute_prioritization,
        client,
        sample_city_data_request,
    ):
        """Test prioritization can still be enqueued when background work is deferred."""
        mock_execute_prioritization.return_value = None
        mock_get_actions.return_value = [
            {
                "ActionID": "MIT001",
                "ActionName": "Solar Installation",
                "ActionType": ["mitigation"],
            }
        ]

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

    @patch("prioritizer.api._execute_prioritization")
    @patch("prioritizer.api.get_actions")
    def test_start_prioritization_different_types(
        self,
        mock_get_actions,
        mock_execute_prioritization,
        client,
    ):
        """Test prioritization with different PrioritizationType values."""
        mock_execute_prioritization.return_value = None
        mock_get_actions.return_value = [
            {
                "ActionID": "MIT001",
                "ActionName": "Solar Installation",
                "ActionType": ["mitigation"],
            },
            {
                "ActionID": "ADA001",
                "ActionName": "Flood Defense",
                "ActionType": ["adaptation"],
            },
        ]
        base_request = {
            "cityData": {
                "cityContextData": {"locode": "BR RIO", "populationSize": 6748000},
                "cityEmissionsData": {
                    "stationaryEnergyEmissions": 1500,
                    "transportationEmissions": 2200,
                    "wasteEmissions": 800,
                    "ippuEmissions": 300,
                    "afoluEmissions": 150,
                },
            },
            "language": ["en"],
        }

        # Test mitigation only
        mitigation_request = base_request.copy()
        mitigation_request["prioritizationType"] = "mitigation"
        response = client.post(
            "/prioritizer/v1/start_prioritization", json=mitigation_request
        )
        assert response.status_code == 202
        data = response.json()
        assert "taskId" in data
        assert "status" in data

        # Test adaptation only
        adaptation_request = base_request.copy()
        adaptation_request["prioritizationType"] = "adaptation"
        response = client.post(
            "/prioritizer/v1/start_prioritization", json=adaptation_request
        )
        assert response.status_code == 202
        data = response.json()
        assert "taskId" in data
        assert "status" in data

        # Test both (default value)
        both_request = base_request.copy()
        both_request["prioritizationType"] = "both"
        response = client.post(
            "/prioritizer/v1/start_prioritization", json=both_request
        )
        assert response.status_code == 202
        data = response.json()
        assert "taskId" in data
        assert "status" in data

        # Test invalid type
        invalid_request = base_request.copy()
        invalid_request["prioritizationType"] = "invalid_type"
        response = client.post(
            "/prioritizer/v1/start_prioritization", json=invalid_request
        )
        assert response.status_code == 422

    @patch("prioritizer.api._execute_create_explanations")
    def test_create_explanations_start_success(
        self,
        mock_execute_create_explanations,
        client,
        sample_city_data_request,
    ):
        """Start explanation creation task when no explanations are present."""
        mock_execute_create_explanations.return_value = None

        payload = {
            "cityData": sample_city_data_request["cityData"],
            "countryCode": "BR",
            "prioritizationType": "mitigation",
            "language": ["en"],
            "rankedActionsMitigation": [
                {"actionId": "MIT001", "rank": 1},
            ],
            "rankedActionsAdaptation": [],
        }

        response = client.post(
            "/prioritizer/v1/create_explanations",
            json=payload,
        )

        assert response.status_code == 202
        data = response.json()
        assert "taskId" in data
        assert "status" in data

    @patch("prioritizer.api._execute_translate_explanations")
    def test_translate_explanations_start_success(
        self,
        mock_execute_translate_explanations,
        client,
    ):
        """Start translation task when source language is present on all actions."""
        mock_execute_translate_explanations.return_value = None

        payload = {
            "locode": "BR RIO",
            "rankedActionsMitigation": [
                {
                    "actionId": "MIT001",
                    "rank": 1,
                    "explanation": {"explanations": {"en": "Source text"}},
                }
            ],
            "rankedActionsAdaptation": [],
            "sourceLanguage": "en",
            "targetLanguages": ["de"],
        }

        response = client.post(
            "/prioritizer/v1/translate_explanations",
            json=payload,
        )

        assert response.status_code == 202
        data = response.json()
        assert "taskId" in data
        assert "status" in data

    def test_translate_explanations_missing_source_language(self, client):
        """Return a general error when requested source language is missing."""
        payload = {
            "locode": "BR RIO",
            "rankedActionsMitigation": [
                {
                    "actionId": "MIT001",
                    "rank": 1,
                    "explanation": {"explanations": {"pt": "Texto de origem"}},
                }
            ],
            "rankedActionsAdaptation": [],
            "sourceLanguage": "en",
            "targetLanguages": ["de"],
        }

        response = client.post(
            "/prioritizer/v1/translate_explanations",
            json=payload,
        )

        assert response.status_code == 422
        body = response.json()
        assert "detail" in body
        assert "Requested source language 'en' must be present" in body["detail"]

    def test_create_explanations_rejects_existing_explanations(self, client):
        """Reject explanation creation when any action already has explanations."""
        payload = {
            "cityData": {
                "cityContextData": {"locode": "BR RIO", "populationSize": 6748000},
                "cityEmissionsData": {
                    "stationaryEnergyEmissions": 1500,
                    "transportationEmissions": 2200,
                    "wasteEmissions": 800,
                    "ippuEmissions": 300,
                    "afoluEmissions": 150,
                },
            },
            "countryCode": "BR",
            "prioritizationType": "mitigation",
            "language": ["en"],
            "rankedActionsMitigation": [
                {
                    "actionId": "MIT001",
                    "rank": 1,
                    "explanation": {"explanations": {"en": "Already present"}},
                }
            ],
            "rankedActionsAdaptation": [],
        }

        response = client.post(
            "/prioritizer/v1/create_explanations",
            json=payload,
        )

        assert response.status_code == 422
        body = response.json()
        assert "detail" in body
        assert "explanation text" in body["detail"]


@pytest.mark.integration
class TestPrioritizerWorkflow:
    """Test complete prioritizer workflow"""

    @patch("prioritizer.api._execute_prioritization")
    @patch("prioritizer.api.get_actions")
    def test_complete_prioritization_workflow(
        self,
        mock_get_actions,
        mock_execute_prioritization,
        client,
        sample_city_data_request,
    ):
        """Test the endpoint returns a task id without running the worker."""
        mock_execute_prioritization.return_value = None

        mock_actions = [
            {
                "ActionID": "MIT001",
                "ActionName": "Solar Installation",
                "ActionType": ["mitigation"],
            }
        ]
        mock_get_actions.return_value = mock_actions

        # Start prioritization
        response = client.post(
            "/prioritizer/v1/start_prioritization", json=sample_city_data_request
        )
        assert response.status_code == 202

        task_id = response.json()["taskId"]
        assert task_id

    @patch("prioritizer.api._get_bulk_executor")
    @patch("prioritizer.api.get_actions")
    def test_bulk_prioritization_workflow(
        self,
        mock_get_actions,
        mock_get_bulk_executor,
        client,
    ):
        """Test bulk prioritization workflow including validation."""
        mock_future = Mock()
        mock_future.done.return_value = False
        mock_future.cancel.return_value = False
        mock_future.add_done_callback.return_value = None

        mock_executor = Mock()
        mock_executor.submit.return_value = mock_future
        mock_get_bulk_executor.return_value = mock_executor

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

        # Test valid bulk request (should succeed)
        bulk_request_valid = {
            "cityDataList": [
                {
                    "cityContextData": {"locode": "BR RIO", "populationSize": 6748000},
                    "cityEmissionsData": {
                        "stationaryEnergyEmissions": 1500,
                        "transportationEmissions": 2200,
                        "wasteEmissions": 800,
                        "ippuEmissions": 300,
                        "afoluEmissions": 150,
                    },
                },
                {
                    "cityContextData": {"locode": "BR SAO", "populationSize": 12300000},
                    "cityEmissionsData": {
                        "stationaryEnergyEmissions": 2500,
                        "transportationEmissions": 3500,
                        "wasteEmissions": 1200,
                        "ippuEmissions": 500,
                        "afoluEmissions": 200,
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
