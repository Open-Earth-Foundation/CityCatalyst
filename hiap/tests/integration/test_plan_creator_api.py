"""Integration tests for the non-legacy plan creator API endpoints."""

from datetime import UTC, datetime
from pathlib import Path
import sys
from unittest.mock import patch
import uuid

import pytest

# Add the app directory to the Python path
app_dir = Path(__file__).parent.parent.parent / "app"
if str(app_dir) not in sys.path:
    sys.path.insert(0, str(app_dir))

from plan_creator_bundle.plan_creator.models import (  # type: ignore
    AdaptationList,
    CheckProgressResponse,
    CostBudget,
    Introduction,
    InstitutionList,
    MerIndicatorList,
    MilestoneList,
    MitigationList,
    PlanContent,
    PlanCreatorMetadata,
    PlanResponse,
    SDGList,
    SubactionList,
    Timeline,
)
from plan_creator_bundle.plan_creator.task_storage import task_storage  # type: ignore


@pytest.fixture(autouse=True)
def clear_plan_creator_task_storage():
    """Isolate plan creator task storage between tests."""
    task_storage.clear()
    yield
    task_storage.clear()


def _sample_plan_request() -> dict:
    """Build a valid plan creator request payload."""
    return {
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
        "actionId": "MIT001",
        "language": "en",
    }


def _sample_plan_response() -> PlanResponse:
    """Build a minimal valid plan response for retrieval tests."""
    return PlanResponse(
        metadata=PlanCreatorMetadata(
            locode="BR RIO",
            cityName="Rio de Janeiro",
            actionId="MIT001",
            actionName="Solar Installation",
            language="en",
            createdAt=datetime.now(UTC),
        ),
        content=PlanContent(
            introduction=Introduction(
                city_description="Rio is a coastal city.",
                action_description="Install solar on public buildings.",
                national_strategy_explanation="Aligned with national climate policy.",
            ),
            subactions=SubactionList(items=[]),
            institutions=InstitutionList(items=[]),
            milestones=MilestoneList(items=[]),
            timeline=[Timeline()],
            costBudget=[CostBudget()],
            merIndicators=MerIndicatorList(items=[]),
            mitigations=MitigationList(items=[]),
            adaptations=AdaptationList(items=[]),
            sdgs=SDGList(items=[]),
        ),
    )


@pytest.mark.integration
class TestPlanCreatorAPI:
    """Test cases for the non-legacy plan creator routes."""

    @patch("plan_creator_bundle.plan_creator.api._execute_plan_creation")
    @patch("plan_creator_bundle.plan_creator.api.get_context")
    @patch("plan_creator_bundle.plan_creator.api.get_actions")
    def test_start_plan_creation_success(
        self,
        mock_get_actions,
        mock_get_context,
        mock_execute_plan_creation,
        client,
    ):
        """Start plan creation and return a task id without running the background worker."""
        mock_get_actions.return_value = [
            {
                "ActionID": "MIT001",
                "ActionName": "Solar Installation",
                "ActionType": ["mitigation"],
            }
        ]
        mock_get_context.return_value = None
        mock_execute_plan_creation.return_value = None

        response = client.post(
            "/plan-creator/v1/start_plan_creation",
            json=_sample_plan_request(),
        )

        assert response.status_code == 202
        body = response.json()
        assert body["status"] == "pending"
        uuid.UUID(body["taskId"])

    @patch("plan_creator_bundle.plan_creator.api.get_actions")
    def test_start_plan_creation_action_not_found(
        self,
        mock_get_actions,
        client,
    ):
        """Return 404 when the requested action id is missing from the actions catalog."""
        mock_get_actions.return_value = [
            {
                "ActionID": "OTHER001",
                "ActionName": "Different Action",
                "ActionType": ["mitigation"],
            }
        ]

        response = client.post(
            "/plan-creator/v1/start_plan_creation",
            json=_sample_plan_request(),
        )

        assert response.status_code == 404
        assert "Action not found" in response.json()["detail"]

    def test_check_progress_failed_task_includes_error(self, client):
        """Return failed task progress including the stored error message."""
        task_uuid = str(uuid.uuid4())
        task_storage[task_uuid] = {"status": "failed", "error": "boom"}

        response = client.get(f"/plan-creator/v1/check_progress/{task_uuid}")

        assert response.status_code == 200
        assert response.json() == CheckProgressResponse(status="failed", error="boom").model_dump()

    def test_get_plan_returns_conflict_for_pending_task(self, client):
        """Return 409 while a plan task is still pending."""
        task_uuid = str(uuid.uuid4())
        task_storage[task_uuid] = {"status": "pending"}

        response = client.get(f"/plan-creator/v1/get_plan/{task_uuid}")

        assert response.status_code == 409
        assert "not ready yet" in response.json()["detail"]

    def test_get_plan_returns_error_for_failed_task(self, client):
        """Return 500 with the background-task error when plan creation failed."""
        task_uuid = str(uuid.uuid4())
        task_storage[task_uuid] = {"status": "failed", "error": "vector store init failed"}

        response = client.get(f"/plan-creator/v1/get_plan/{task_uuid}")

        assert response.status_code == 500
        assert "vector store init failed" in response.json()["detail"]

    def test_get_plan_returns_completed_plan_response(self, client):
        """Return the serialized plan response for completed tasks."""
        task_uuid = str(uuid.uuid4())
        task_storage[task_uuid] = {
            "status": "completed",
            "plan_response": _sample_plan_response(),
        }

        response = client.get(f"/plan-creator/v1/get_plan/{task_uuid}")

        assert response.status_code == 200
        body = response.json()
        assert body["metadata"]["locode"] == "BR RIO"
        assert body["metadata"]["actionId"] == "MIT001"
        assert body["content"]["introduction"]["city_description"] == "Rio is a coastal city."

    @patch("plan_creator_bundle.plan_creator.api._execute_plan_translation")
    def test_translate_plan_starts_background_task(
        self, mock_execute_plan_translation, client
    ):
        """Return a task id for plan translation without executing the worker."""
        mock_execute_plan_translation.return_value = None
        plan_response = _sample_plan_response().model_dump(mode="json")

        response = client.post(
            "/plan-creator/v1/translate_plan",
            json={
                "inputPlan": plan_response,
                "inputLanguage": "en",
                "outputLanguage": "de",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "pending"
        uuid.UUID(body["taskId"])
