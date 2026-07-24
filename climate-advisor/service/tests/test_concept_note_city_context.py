from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import UUID, uuid4

import pytest
from app.main import get_app
from app.models.concept_note_city_context import MeedContext, MeedPlaceholder
from app.repositories.concept_note_city_context import (
    ConceptNoteCityContextRepository,
    ConceptNoteCityContextRepositoryError,
    ConceptNoteRunContext,
    get_concept_note_city_context_repository,
    merge_ghgi_into_bundle,
)
from app.routes.concept_note_city_context import get_citycatalyst_client
from app.services.citycatalyst_client import CityCatalystClientError
from app.services.concept_note_city_context import (
    ConceptNoteCityContextDataError,
    compact_ghgi_context,
    select_newest_inventory,
)
from fastapi.testclient import TestClient
from pydantic import ValidationError

CITY_ID = UUID("10000000-0000-4000-8000-000000000001")
RUN_ID = UUID("20000000-0000-4000-8000-000000000001")
INVENTORY_ID = UUID("30000000-0000-4000-8000-000000000001")
OLDER_INVENTORY_ID = UUID("30000000-0000-4000-8000-000000000002")
SAME_DATE_LATER_ID = UUID("30000000-0000-4000-8000-000000000003")


class FakeCityContextRepository(ConceptNoteCityContextRepository):
    """In-memory CNB repository for route contract tests."""

    def __init__(self) -> None:
        self.owner_id = "owner-user"
        self.run_id = RUN_ID
        self.city_id = CITY_ID
        self.context_bundle: dict[str, Any] = {
            "cc_context": {
                "city": {"name": "Existing city context"},
                "ccra": {"risk": "preserved"},
            },
            "selected_sources": [{"label": "Preserved source"}],
        }
        self.merge_calls = 0
        self.meed_before_merge: dict[str, Any] | None = None

    async def load_run_context(
        self,
        *,
        user_id: str,
        run_id: UUID,
        city_id: UUID,
    ) -> ConceptNoteRunContext:
        """Validate the fake run and return a detached bundle copy."""
        self._validate(user_id=user_id, run_id=run_id, city_id=city_id)
        return ConceptNoteRunContext(
            city_id=str(self.city_id),
            context_bundle=deepcopy(self.context_bundle),
        )

    async def merge_ghgi_context(
        self,
        *,
        user_id: str,
        run_id: UUID,
        city_id: UUID,
        ghgi_context: dict[str, Any],
    ) -> dict[str, Any]:
        """Apply the same targeted merge as the production adapter."""
        self._validate(user_id=user_id, run_id=run_id, city_id=city_id)
        self.merge_calls += 1
        if self.meed_before_merge is not None:
            self.context_bundle["cc_context"]["meed"] = deepcopy(
                self.meed_before_merge
            )
        self.context_bundle = merge_ghgi_into_bundle(
            current_bundle=self.context_bundle,
            ghgi_context=ghgi_context,
        )
        return deepcopy(self.context_bundle)

    def _validate(self, *, user_id: str, run_id: UUID, city_id: UUID) -> None:
        """Enforce run existence, ownership, and immutable city binding."""
        if run_id != self.run_id:
            raise ConceptNoteCityContextRepositoryError(
                "concept_note_run_not_found",
                404,
                "Concept Note run was not found",
            )
        if user_id != self.owner_id:
            raise ConceptNoteCityContextRepositoryError(
                "concept_note_run_forbidden",
                403,
                "Concept Note run belongs to another user",
            )
        if city_id != self.city_id:
            raise ConceptNoteCityContextRepositoryError(
                "run_city_mismatch",
                409,
                "Requested city does not match the Concept Note run",
            )


class FakeCityCatalystClient:
    """Return bounded GHGI fixtures and record every capability call."""

    def __init__(self) -> None:
        self.list_calls = 0
        self.status_calls = 0
        self.emissions_calls = 0
        self.no_inventories = False
        self.reject_city = False
        self.invalid_emissions = False

    async def validate_user_identity(self, token: str) -> str:
        """Resolve test bearer tokens without external authentication."""
        if token == "invalid":
            raise CityCatalystClientError("invalid", status_code=401)
        return token

    async def load_inventory_list_accessible(
        self,
        *,
        request_payload: dict[str, Any],
        token: str,
    ) -> dict[str, Any]:
        """Return inventories for only the explicitly requested city."""
        self.list_calls += 1
        if self.reject_city:
            raise CityCatalystClientError("forbidden", status_code=403)
        assert request_payload["city_id"] == str(CITY_ID)
        assert request_payload["include_all_city_years"] is True
        inventories = [] if self.no_inventories else inventory_choices()
        return capability(
            {
                "cities": [
                    {
                        "city_id": str(CITY_ID),
                        "inventories": inventories,
                    }
                ]
            }
        )

    async def load_inventory_status_overview(
        self,
        *,
        request_payload: dict[str, Any],
        token: str,
    ) -> dict[str, Any]:
        """Return sector completion and sector-local source-state counts."""
        self.status_calls += 1
        assert request_payload["inventory_id"] == str(INVENTORY_ID)
        return capability(status_data())

    async def load_inventory_emissions_context(
        self,
        *,
        request_payload: dict[str, Any],
        token: str,
    ) -> dict[str, Any]:
        """Return emissions rows in deliberately unsorted source order."""
        self.emissions_calls += 1
        assert request_payload["inventory_id"] == str(INVENTORY_ID)
        if self.invalid_emissions:
            return capability({})
        return capability(emissions_data())


@pytest.fixture
def city_context_client():
    """Provide the API with isolated repository and CityCatalyst fakes."""
    repository = FakeCityContextRepository()
    cc_client = FakeCityCatalystClient()
    app = get_app()
    app.dependency_overrides[get_concept_note_city_context_repository] = (
        lambda: repository
    )
    app.dependency_overrides[get_citycatalyst_client] = lambda: cc_client
    with TestClient(app) as client:
        yield client, repository, cc_client
    app.dependency_overrides.clear()


def post_context(
    client: TestClient,
    *,
    run_id: UUID = RUN_ID,
    city_id: UUID = CITY_ID,
    token: str | None = "owner-user",
    include_meed: bool | None = None,
):
    """Post one city-context request with an optional bearer token."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    payload: dict[str, Any] = {"city_id": str(city_id)}
    if include_meed is not None:
        payload["include_meed"] = include_meed
    return client.post(
        f"/v1/concept-notes/{run_id}/cc-context",
        json=payload,
        headers=headers,
    )


def test_builds_persists_and_reuses_compact_city_context(
    city_context_client,
) -> None:
    client, repository, cc_client = city_context_client

    first = post_context(client)
    second = post_context(client, include_meed=False)

    assert first.status_code == second.status_code == 200
    payload = first.json()
    ghgi = payload["context_bundle"]["cc_context"]["ghgi"]
    assert payload["run_id"] == str(RUN_ID)
    assert payload["city_id"] == str(CITY_ID)
    assert "meed" not in payload["context_bundle"]["cc_context"]
    assert ghgi["availability"] == "partial"
    assert ghgi["inventory"] == {
        "id": str(INVENTORY_ID),
        "year": 2024,
        "type": "gpc_basic",
        "gwp": "ar6",
    }
    assert ghgi["emissions"]["total_tco2e"] == 83950.0
    assert [sector["gpc"] for sector in ghgi["emissions"]["sectors"]] == [
        "I",
        "II",
        "III",
        "IV",
        "V",
    ]
    assert ghgi["emissions"]["sectors"][0]["data_state"] == {
        "third_party": 1,
        "manual_or_uploaded": 20,
        "not_estimated": 1,
        "not_occurring": 1,
    }
    assert len(ghgi["emissions"]["top_sources"]) == 5
    assert [
        item["emissions_tco2e"]
        for item in ghgi["emissions"]["top_sources"]
    ] == [40399.0, 20000.0, 10000.0, 8000.0, 4000.0]

    serialized = first.text.lower()
    for forbidden in (
        "source_mix",
        "limitations",
        "removed_summary",
        '"hiap"',
        '"meed"',
    ):
        assert forbidden not in serialized

    assert repository.merge_calls == 1
    assert repository.context_bundle["selected_sources"] == [
        {"label": "Preserved source"}
    ]
    assert repository.context_bundle["cc_context"]["city"] == {
        "name": "Existing city context"
    }
    assert repository.context_bundle["cc_context"]["ccra"] == {
        "risk": "preserved"
    }
    assert cc_client.list_calls == 1
    assert cc_client.status_calls == 1
    assert cc_client.emissions_calls == 1
    assert second.json() == first.json()


def test_returns_missing_ghgi_without_detail_calls(city_context_client) -> None:
    client, repository, cc_client = city_context_client
    cc_client.no_inventories = True

    response = post_context(client)

    assert response.status_code == 200
    assert response.json()["context_bundle"]["cc_context"] == {
        "ghgi": {
            "availability": "missing",
            "inventory": None,
            "emissions": None,
        }
    }
    assert repository.merge_calls == 1
    assert cc_client.status_calls == 0
    assert cc_client.emissions_calls == 0


def test_returns_empty_meed_only_when_requested(city_context_client) -> None:
    client, repository, cc_client = city_context_client

    without_meed = post_context(client)
    with_meed = post_context(client, include_meed=True)

    assert without_meed.status_code == with_meed.status_code == 200
    assert "meed" not in without_meed.json()["context_bundle"]["cc_context"]
    assert with_meed.json()["context_bundle"]["cc_context"]["meed"] == {}
    assert repository.merge_calls == 1
    assert cc_client.list_calls == 1


def test_omits_unrequested_meed_without_deleting_it(
    city_context_client,
) -> None:
    client, repository, _ = city_context_client
    stored_meed = meed_data()
    repository.context_bundle["cc_context"]["meed"] = stored_meed

    response = post_context(client)

    assert response.status_code == 200
    assert "meed" not in response.json()["context_bundle"]["cc_context"]
    assert repository.context_bundle["cc_context"]["meed"] == stored_meed


def test_preserves_supplied_meed_while_building_ghgi(
    city_context_client,
) -> None:
    client, repository, cc_client = city_context_client
    repository.context_bundle["cc_context"]["meed"] = meed_data()

    response = post_context(client, include_meed=True)

    assert response.status_code == 200
    meed = response.json()["context_bundle"]["cc_context"]["meed"]
    assert meed["availability"] == "available"
    assert meed["counts"]["ranked_actions"] == 1
    assert meed["actions"][0]["action_id"] == "icare_0016"
    assert repository.context_bundle["cc_context"]["meed"] == meed
    assert repository.merge_calls == 1
    assert cc_client.list_calls == 1


def test_preserves_newer_meed_written_during_ghgi_loading(
    city_context_client,
) -> None:
    client, repository, _ = city_context_client
    repository.context_bundle["cc_context"]["meed"] = meed_data()
    newer_meed = meed_data()
    newer_meed["actions"][0]["action_id"] = "newer-action"
    repository.meed_before_merge = newer_meed

    response = post_context(client, include_meed=True)

    assert response.status_code == 200
    response_meed = response.json()["context_bundle"]["cc_context"]["meed"]
    assert response_meed["actions"][0]["action_id"] == "newer-action"
    assert repository.context_bundle["cc_context"]["meed"] == newer_meed


def test_rejects_incomplete_ghgi_capability_data(
    city_context_client,
) -> None:
    client, repository, cc_client = city_context_client
    cc_client.invalid_emissions = True

    response = post_context(client)

    assert response.status_code == 503
    assert response.json()["code"] == "invalid_cc_context"
    assert repository.merge_calls == 0

    with pytest.raises(ConceptNoteCityContextDataError):
        compact_ghgi_context(
            inventory=inventory_choices()[0],
            status_data={},
            emissions_data=emissions_data(),
        )


def test_auth_run_binding_and_city_access_errors(city_context_client) -> None:
    client, _, cc_client = city_context_client

    assert post_context(client, token=None).status_code == 401
    assert post_context(client, token="invalid").status_code == 401
    assert post_context(client, token="other-user").status_code == 403
    assert post_context(client, run_id=uuid4()).status_code == 404

    mismatch = post_context(client, city_id=uuid4())
    assert mismatch.status_code == 409
    assert mismatch.json()["code"] == "run_city_mismatch"

    cc_client.reject_city = True
    forbidden = post_context(client)
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "city_context_forbidden"


def test_inventory_selection_is_deterministic() -> None:
    same_timestamp = "2026-07-20T10:00:00Z"
    lower_id = UUID("30000000-0000-4000-8000-000000000010")
    higher_id = UUID("30000000-0000-4000-8000-000000000011")
    data = {
        "cities": [
            {
                "city_id": str(CITY_ID),
                "inventories": [
                    {
                        "inventory_id": str(higher_id),
                        "year": 2024,
                        "updated_at": same_timestamp,
                    },
                    {
                        "inventory_id": str(lower_id),
                        "year": 2024,
                        "updated_at": same_timestamp,
                    },
                    {
                        "inventory_id": str(uuid4()),
                        "year": 2023,
                        "updated_at": "2026-07-22T10:00:00Z",
                    },
                ],
            }
        ]
    }

    selected = select_newest_inventory(data, city_id=CITY_ID)

    assert selected is not None
    assert selected["inventory_id"] == str(lower_id)

    without_update_times = deepcopy(data)
    for inventory in without_update_times["cities"][0]["inventories"]:
        inventory["updated_at"] = None

    selected_without_update_times = select_newest_inventory(
        without_update_times,
        city_id=CITY_ID,
    )

    assert selected_without_update_times is not None
    assert selected_without_update_times["inventory_id"] == str(lower_id)


def test_complete_inventory_is_available() -> None:
    complete_status = status_data()
    complete_status["completion"]["missing"] = 0
    for sector in complete_status["by_sector"]:
        sector["missing"] = 0

    result = compact_ghgi_context(
        inventory=inventory_choices()[0],
        status_data=complete_status,
        emissions_data=emissions_data(),
    )

    assert result.availability == "available"


def test_meed_placeholder_rejects_fields() -> None:
    with pytest.raises(ValidationError):
        MeedPlaceholder.model_validate({"actions": []})


def test_meed_contract_accepts_at_most_ten_ranked_actions() -> None:
    validated = MeedContext.model_validate(meed_data())

    assert validated.counts.ranked_actions == 1
    assert len(validated.actions) == 1

    too_many = meed_data()
    too_many["counts"]["ranked_actions"] = 11
    too_many["actions"] = [
        {
            **deepcopy(too_many["actions"][0]),
            "rank": rank,
            "action_id": f"action-{rank}",
        }
        for rank in range(1, 12)
    ]
    with pytest.raises(ValidationError):
        MeedContext.model_validate(too_many)


def inventory_choices() -> list[dict[str, Any]]:
    """Return candidates proving year and updated-time selection."""
    return [
        {
            "inventory_id": str(INVENTORY_ID),
            "year": 2024,
            "type": "gpc_basic",
            "gwp": "ar6",
            "updated_at": "2026-07-22T10:00:00Z",
        },
        {
            "inventory_id": str(SAME_DATE_LATER_ID),
            "year": 2024,
            "type": "gpc_basic",
            "gwp": "ar6",
            "updated_at": "2026-07-21T10:00:00Z",
        },
        {
            "inventory_id": str(OLDER_INVENTORY_ID),
            "year": 2023,
            "type": "gpc_basic",
            "gwp": "ar6",
            "updated_at": "2026-07-23T10:00:00Z",
        },
    ]


def status_data() -> dict[str, Any]:
    """Return partial sector progress with source states local to each sector."""
    return {
        "completion": {
            "required": 30,
            "filled": 28,
            "missing": 2,
            "completion_percent": 93,
        },
        "by_sector": [
            {
                "sector": "Transportation",
                "reference": "II",
                "required": 5,
                "filled": 5,
                "missing": 0,
                "completion_percent": 100,
                "data_state": {
                    "third_party": 0,
                    "manual_or_uploaded": 5,
                    "not_estimated": 0,
                    "not_occurring": 0,
                },
            },
            {
                "sector": "Stationary Energy",
                "reference": "I",
                "required": 25,
                "filled": 23,
                "missing": 2,
                "completion_percent": 92,
                "data_state": {
                    "third_party": 1,
                    "manual_or_uploaded": 20,
                    "not_estimated": 1,
                    "not_occurring": 1,
                },
            },
        ],
    }


def emissions_data() -> dict[str, Any]:
    """Return sector emissions and more than five unsorted top emitters."""
    emitters = [
        ("Waste", "Solid waste", "Scope 1", "4000", 4.76),
        ("Transportation", "Railways", "Scope 1", "10000", 11.91),
        ("AFOLU", "Livestock", "Scope 1", "1000", 1.19),
        ("Stationary Energy", "Residential buildings", "Scope 1", "40399", 48.12),
        ("IPPU", "Industrial products", "Scope 1", "8000", 9.53),
        ("Transportation", "On-road", "Scope 1", "20000", 23.82),
    ]
    return {
        "total_emissions_tco2e": "83950",
        "by_sector": [
            {
                "sector": "Waste",
                "reference": "III",
                "emissions_tco2e": "4000",
                "share_percent": 4.76,
            },
            {
                "sector": "Stationary Energy",
                "reference": "I",
                "emissions_tco2e": "40399",
                "share_percent": 48.12,
            },
        ],
        "top_emitters": [
            {
                "sector": sector,
                "subsector": subsector,
                "scope": scope,
                "emissions_tco2e": emissions,
                "share_percent": share,
            }
            for sector, subsector, scope, emissions, share in emitters
        ],
        "source_summary": {
            "third_party_values": 1,
            "manual_or_uploaded_values": 25,
        },
    }


def capability(data: dict[str, Any]) -> dict[str, Any]:
    """Wrap fixture data in the CityCatalyst capability envelope."""
    return {"action": "test", "success": True, "data": data}


def meed_data() -> dict[str, Any]:
    """Return one valid compact externally supplied MEED snapshot."""
    return {
        "availability": "available",
        "city": {"name": "Iquique", "locode": "CL IQQ"},
        "executed_at_utc": "2026-07-23T21:30:09Z",
        "input": {
            "inventory_id": str(INVENTORY_ID),
            "inventory_year": 2022,
            "inventory_values": 8,
            "emitting_values": 7,
        },
        "data_sources": {
            "inventory": "citycatalyst_local_inventory",
            "city": "live_dev_global_api",
            "actions": "live_dev_global_api",
            "policy": "live_dev_global_api",
            "mitigation_feasibility": "live_dev_global_api",
            "financial_feasibility": "live_dev_global_api",
            "legal": "checked_in_chile_fixture",
        },
        "weights": {
            "impact": 0.5,
            "alignment": 0.3,
            "feasibility": 0.2,
        },
        "counts": {
            "total_actions": 102,
            "valid_actions": 82,
            "discarded_excluded": 1,
            "discarded_legal": 19,
            "ranked_actions": 1,
        },
        "actions": [
            {
                "rank": 1,
                "action_id": "icare_0016",
                "name": "Promote solar thermal and heat pump systems",
                "sector": "stationary_energy",
                "timeline": "<5 years",
                "investment_cost": "medium",
                "scores": {
                    "final": 0.642956,
                    "impact": 0.509547,
                    "alignment": 0.672375,
                    "feasibility": 0.93235,
                },
                "legal_verdict": "enabled",
                "finance_route": "own-budget feasible",
            }
        ],
    }
