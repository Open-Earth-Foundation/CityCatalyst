from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import UUID, uuid4

import pytest
from app.main import get_app
from app.models.cnb.concept_note_city_context import HiapContext
from app.persistence.concept_notes.city_context import (
    ConceptNoteCityContextRepository,
    ConceptNoteCityContextRepositoryError,
    ConceptNoteRunContext,
    get_concept_note_city_context_repository,
    merge_cc_context_into_bundle,
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
        self.hiap_before_merge: dict[str, Any] | None = None
        self.load_error: ConceptNoteCityContextRepositoryError | None = None
        self.merge_error: ConceptNoteCityContextRepositoryError | None = None

    async def load_run_context(
        self,
        *,
        user_id: str,
        run_id: UUID,
        city_id: UUID,
    ) -> ConceptNoteRunContext:
        """Validate the fake run and return a detached bundle copy."""
        if self.load_error is not None:
            raise self.load_error
        self._validate(user_id=user_id, run_id=run_id, city_id=city_id)
        return ConceptNoteRunContext(
            city_id=str(self.city_id),
            context_bundle=deepcopy(self.context_bundle),
        )

    async def merge_cc_context(
        self,
        *,
        user_id: str,
        run_id: UUID,
        city_id: UUID,
        ghgi_context: dict[str, Any] | None = None,
        hiap_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Apply the same targeted merge as the production adapter."""
        if self.merge_error is not None:
            raise self.merge_error
        self._validate(user_id=user_id, run_id=run_id, city_id=city_id)
        self.merge_calls += 1
        if self.hiap_before_merge is not None:
            self.context_bundle["cc_context"]["hiap"] = deepcopy(
                self.hiap_before_merge
            )
        self.context_bundle = merge_cc_context_into_bundle(
            current_bundle=self.context_bundle,
            ghgi_context=ghgi_context,
            hiap_context=hiap_context,
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
        self.hiap_calls = 0
        self.no_inventories = False
        self.reject_city = False
        self.invalid_emissions = False
        self.invalid_hiap = False

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

    async def load_hiap_context(
        self,
        *,
        request_payload: dict[str, Any],
        token: str,
    ) -> dict[str, Any]:
        """Return persisted HIAP context for the selected GHGI inventory."""
        self.hiap_calls += 1
        assert request_payload["inventory_id"] == str(INVENTORY_ID)
        assert request_payload["language"] in {"en", "es", "pt", "de", "fr"}
        if self.invalid_hiap:
            return capability({})
        return capability(hiap_data(language=request_payload["language"]))


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
    include_hiap: bool | None = None,
    language: str | None = None,
):
    """Post one city-context request with an optional bearer token."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    payload: dict[str, Any] = {"city_id": str(city_id)}
    if include_hiap is not None:
        payload["include_hiap"] = include_hiap
    if language is not None:
        payload["language"] = language
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
    second = post_context(client, include_hiap=False)

    assert first.status_code == second.status_code == 200
    payload = first.json()
    ghgi = payload["context_bundle"]["cc_context"]["ghgi"]
    assert payload["run_id"] == str(RUN_ID)
    assert payload["city_id"] == str(CITY_ID)
    assert "hiap" not in payload["context_bundle"]["cc_context"]
    assert ghgi["availability"] == "partial"
    assert ghgi["inventory"] == {
        "id": str(INVENTORY_ID),
        "year": 2024,
        "type": "gpc_basic",
        "gwp": "ar6",
    }
    assert ghgi["emissions"]["total_kgco2e"] == 83950000.0
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
        item["emissions_kgco2e"]
        for item in ghgi["emissions"]["top_sources"]
    ] == [40399000.0, 20000000.0, 10000000.0, 8000000.0, 4000000.0]

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
    assert cc_client.list_calls == 2
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


def test_rejects_removed_meed_request_flag(city_context_client) -> None:
    client, repository, cc_client = city_context_client

    response = client.post(
        f"/v1/concept-notes/{RUN_ID}/cc-context",
        json={"city_id": str(CITY_ID), "include_meed": True},
        headers={"Authorization": "Bearer owner-user"},
    )

    assert response.status_code == 422
    assert repository.merge_calls == 0
    assert cc_client.list_calls == 0


def test_loads_and_persists_hiap_only_when_requested(
    city_context_client,
) -> None:
    client, repository, cc_client = city_context_client

    without_hiap = post_context(client)
    with_hiap = post_context(client, include_hiap=True, language="es")

    assert without_hiap.status_code == with_hiap.status_code == 200
    assert "hiap" not in without_hiap.json()["context_bundle"]["cc_context"]
    hiap = with_hiap.json()["context_bundle"]["cc_context"]["hiap"]
    assert hiap["inventory_id"] == str(INVENTORY_ID)
    assert hiap["requested_language"] == "es"
    assert hiap["mitigation"]["selection_mode"] == "city_selected"
    assert hiap["mitigation"]["actions"][0]["action_id"] == "selected-mitigation"
    assert hiap["adaptation"]["selection_mode"] == "ranked_fallback"
    assert repository.context_bundle["cc_context"]["hiap"] == hiap
    assert repository.merge_calls == 2
    assert cc_client.list_calls == 2
    assert cc_client.hiap_calls == 1


def test_omits_unrequested_hiap_without_deleting_it(
    city_context_client,
) -> None:
    client, repository, _ = city_context_client
    stored_hiap = hiap_data()
    repository.context_bundle["cc_context"]["hiap"] = stored_hiap

    response = post_context(client)

    assert response.status_code == 200
    assert "hiap" not in response.json()["context_bundle"]["cc_context"]
    assert repository.context_bundle["cc_context"]["hiap"] == stored_hiap


def test_reuses_cached_hiap_after_revalidating_city_access(
    city_context_client,
) -> None:
    client, repository, cc_client = city_context_client

    first = post_context(client, include_hiap=True)
    second = post_context(client, include_hiap=True)

    assert first.status_code == second.status_code == 200
    assert second.json() == first.json()
    assert repository.merge_calls == 1
    assert cc_client.list_calls == 2
    assert cc_client.hiap_calls == 1


def test_refreshes_cached_hiap_for_a_different_language(
    city_context_client,
) -> None:
    client, repository, cc_client = city_context_client

    first = post_context(client, include_hiap=True)
    spanish = post_context(client, include_hiap=True, language="es")

    assert first.status_code == spanish.status_code == 200
    hiap = spanish.json()["context_bundle"]["cc_context"]["hiap"]
    assert hiap["requested_language"] == "es"
    assert hiap["mitigation"]["language"] == "es"
    assert repository.merge_calls == 2
    assert cc_client.list_calls == 2
    assert cc_client.hiap_calls == 2


def test_preserves_newer_hiap_written_during_ghgi_loading(
    city_context_client,
) -> None:
    client, repository, _ = city_context_client
    newer_hiap = hiap_data()
    newer_hiap["mitigation"]["actions"][0]["name"] = "Concurrent newer name"
    repository.hiap_before_merge = newer_hiap

    response = post_context(client)

    assert response.status_code == 200
    assert "hiap" not in response.json()["context_bundle"]["cc_context"]
    assert repository.context_bundle["cc_context"]["hiap"] == newer_hiap


def test_returns_missing_hiap_without_triggering_a_capability(
    city_context_client,
) -> None:
    client, repository, cc_client = city_context_client
    cc_client.no_inventories = True

    response = post_context(client, include_hiap=True)

    assert response.status_code == 200
    hiap = response.json()["context_bundle"]["cc_context"]["hiap"]
    assert hiap["availability"] == "missing"
    assert hiap["inventory_id"] is None
    assert hiap["mitigation"]["actions"] == []
    assert hiap["adaptation"]["actions"] == []
    assert cc_client.hiap_calls == 0
    assert repository.merge_calls == 1


def test_rejects_invalid_hiap_capability_data(city_context_client) -> None:
    client, repository, cc_client = city_context_client
    cc_client.invalid_hiap = True

    response = post_context(client, include_hiap=True)

    assert response.status_code == 503
    assert response.json()["code"] == "invalid_cc_context"
    assert repository.merge_calls == 0


def test_does_not_serve_cached_context_after_city_access_is_revoked(
    city_context_client,
) -> None:
    client, repository, cc_client = city_context_client
    assert post_context(client, include_hiap=True).status_code == 200
    assert repository.merge_calls == 1

    cc_client.reject_city = True
    response = post_context(client, include_hiap=True)

    assert response.status_code == 403
    assert response.json()["code"] == "city_context_forbidden"
    assert cc_client.list_calls == 2
    assert cc_client.hiap_calls == 1


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


@pytest.mark.parametrize("failure_point", ["load", "merge"])
def test_repository_error_details_are_not_exposed(
    city_context_client,
    failure_point: str,
) -> None:
    client, repository, _ = city_context_client
    internal_detail = "SECRET_DATABASE_DETAIL"
    error = ConceptNoteCityContextRepositoryError(
        "cnb_storage_unavailable",
        599,
        internal_detail,
    )
    if failure_point == "load":
        repository.load_error = error
    else:
        repository.merge_error = error

    response = post_context(client)

    assert response.status_code == 503
    assert response.json() == {
        "code": "cnb_storage_unavailable",
        "detail": "Concept Note context storage is not available",
        "status": 503,
    }
    assert internal_detail not in response.text


def test_unknown_repository_error_uses_safe_public_fallback(
    city_context_client,
) -> None:
    client, repository, _ = city_context_client
    internal_detail = "SECRET_DATABASE_DETAIL"
    repository.load_error = ConceptNoteCityContextRepositoryError(
        "internal_database_failure",
        599,
        internal_detail,
    )

    response = post_context(client)

    assert response.status_code == 503
    assert response.json() == {
        "code": "cnb_storage_unavailable",
        "detail": "Concept Note context storage is not available",
        "status": 503,
    }
    assert internal_detail not in response.text


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


def test_hiap_contract_requires_unique_actions_and_matching_counts() -> None:
    validated = HiapContext.model_validate(hiap_data())

    assert validated.mitigation.counts.returned == 1
    invalid = hiap_data()
    invalid["mitigation"]["counts"]["returned"] = 2
    with pytest.raises(ValidationError):
        HiapContext.model_validate(invalid)

    duplicate = hiap_data()
    duplicate["mitigation"]["actions"].append(
        deepcopy(duplicate["mitigation"]["actions"][0])
    )
    duplicate["mitigation"]["counts"]["selected"] = 2
    duplicate["mitigation"]["counts"]["returned"] = 2
    with pytest.raises(ValidationError):
        HiapContext.model_validate(duplicate)


@pytest.mark.parametrize("payload_name", ["status", "emissions"])
@pytest.mark.parametrize("bad_shape", ["missing", "duplicate", "unexpected"])
def test_rejects_noncanonical_sector_sets(
    payload_name: str,
    bad_shape: str,
) -> None:
    invalid_status = status_data()
    invalid_emissions = emissions_data()
    sectors = (
        invalid_status["by_sector"]
        if payload_name == "status"
        else invalid_emissions["by_sector"]
    )
    if bad_shape == "missing":
        sectors.pop()
    elif bad_shape == "duplicate":
        sectors[-1]["reference"] = "I"
    else:
        sectors[-1]["reference"] = "VI"

    with pytest.raises(ConceptNoteCityContextDataError):
        compact_ghgi_context(
            inventory=inventory_choices()[0],
            status_data=invalid_status,
            emissions_data=invalid_emissions,
        )


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
            {
                "sector": "Waste",
                "reference": "III",
                "required": 0,
                "filled": 0,
                "missing": 0,
                "completion_percent": 100,
                "data_state": {
                    "third_party": 0,
                    "manual_or_uploaded": 0,
                    "not_estimated": 0,
                    "not_occurring": 0,
                },
            },
            {
                "sector": "IPPU",
                "reference": "IV",
                "required": 0,
                "filled": 0,
                "missing": 0,
                "completion_percent": 100,
                "data_state": {
                    "third_party": 0,
                    "manual_or_uploaded": 0,
                    "not_estimated": 0,
                    "not_occurring": 0,
                },
            },
            {
                "sector": "AFOLU",
                "reference": "V",
                "required": 0,
                "filled": 0,
                "missing": 0,
                "completion_percent": 100,
                "data_state": {
                    "third_party": 0,
                    "manual_or_uploaded": 0,
                    "not_estimated": 0,
                    "not_occurring": 0,
                },
            },
        ],
    }


def emissions_data() -> dict[str, Any]:
    """Return sector emissions and more than five unsorted top emitters."""
    emitters = [
        ("Waste", "Solid waste", "Scope 1", "4000000", 4.76),
        ("Transportation", "Railways", "Scope 1", "10000000", 11.91),
        ("AFOLU", "Livestock", "Scope 1", "1000000", 1.19),
        (
            "Stationary Energy",
            "Residential buildings",
            "Scope 1",
            "40399000",
            48.12,
        ),
        ("IPPU", "Industrial products", "Scope 1", "8000000", 9.53),
        ("Transportation", "On-road", "Scope 1", "20000000", 23.82),
    ]
    return {
        "total_emissions_kgco2e": "83950000",
        "by_sector": [
            {
                "sector": "Waste",
                "reference": "III",
                "emissions_kgco2e": "4000000",
                "share_percent": 4.76,
            },
            {
                "sector": "Stationary Energy",
                "reference": "I",
                "emissions_kgco2e": "40399000",
                "share_percent": 48.12,
            },
            {
                "sector": "Transportation",
                "reference": "II",
                "emissions_kgco2e": "30000000",
                "share_percent": 35.74,
            },
            {
                "sector": "IPPU",
                "reference": "IV",
                "emissions_kgco2e": "8000000",
                "share_percent": 9.53,
            },
            {
                "sector": "AFOLU",
                "reference": "V",
                "emissions_kgco2e": "1551000",
                "share_percent": 1.85,
            },
        ],
        "top_emitters": [
            {
                "sector": sector,
                "subsector": subsector,
                "scope": scope,
                "emissions_kgco2e": emissions,
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


def hiap_data(*, language: str = "en") -> dict[str, Any]:
    """Return valid compact persisted HIAP context."""
    return {
        "availability": "available",
        "inventory_id": str(INVENTORY_ID),
        "requested_language": language,
        "mitigation": {
            "status": "available",
            "ranking_id": "40000000-0000-4000-8000-000000000001",
            "updated_at": "2026-07-29T10:00:00Z",
            "language": language,
            "selection_mode": "city_selected",
            "counts": {
                "ranked": 2,
                "selected": 1,
                "returned": 1,
            },
            "actions": [
                {
                    "action_id": "selected-mitigation",
                    "name": "Selected mitigation",
                    "type": "mitigation",
                    "rank": 1,
                    "selected": True,
                    "source": "ranked",
                    "language": language,
                    "description": "A city-selected mitigation action.",
                    "sectors": ["Stationary Energy"],
                    "hazards": [],
                    "primary_purposes": ["Mitigation"],
                    "timeline": "<5 years",
                    "investment_cost": "medium",
                    "explanation": "Highest impact for the city.",
                }
            ],
        },
        "adaptation": {
            "status": "available",
            "ranking_id": "40000000-0000-4000-8000-000000000002",
            "updated_at": "2026-07-29T10:00:00Z",
            "language": language,
            "selection_mode": "ranked_fallback",
            "counts": {
                "ranked": 1,
                "selected": 0,
                "returned": 1,
            },
            "actions": [
                {
                    "action_id": "ranked-adaptation",
                    "name": "Ranked adaptation",
                    "type": "adaptation",
                    "rank": 1,
                    "selected": False,
                    "source": "ranked",
                    "language": language,
                    "description": "A persisted adaptation fallback.",
                    "sectors": [],
                    "hazards": ["Floods"],
                    "primary_purposes": ["Adaptation"],
                    "timeline": "5-10 years",
                    "investment_cost": "high",
                    "explanation": "Highest ranked adaptation.",
                }
            ],
        },
    }
