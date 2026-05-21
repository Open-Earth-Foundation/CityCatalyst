"""Live contract checks for the implemented upstream action pathways API path."""

from __future__ import annotations

import pytest

from app.modules.prioritizer.models import ActionPathwaysApiResponse
from app.services.action_pathways_api import (
    ACTION_PATHWAYS_ENDPOINT,
    ActionPathwaysApiService,
)
from app.services.http_client import get_json_with_retries

EXPECTED_ACTION_KEYS = {
    "actionId",
    "actionType",
    "actionName",
    "description",
    "interventionSummary",
    "outcomeSummary",
    "interventionType",
    "actionRole",
    "costInvestmentNeeded",
    "timelineForImplementation",
    "coBenefits",
    "emissions",
    "publisherId",
    "generationMethod",
    "nameI18n",
    "descriptionI18n",
    "interventionSummaryI18n",
    "outcomeSummaryI18n",
}
REMOVED_ACTION_KEYS = {
    "actionCategory",
    "actionSubcategory",
    "biome",
    "socioeconomicIndicators",
}
EXPECTED_META_KEYS = {
    "generatedAtUtc",
    "backendConsumer",
    "upstreamProvider",
    "apiContext",
    "totalRecords",
}
EXPECTED_EMISSIONS_KEYS = {
    "impactRelationship",
    "impactText",
    "impactNumeric",
    "methodology",
    "sectorNumber",
    "subsectorNumber",
    "gpcReferenceNumber",
}
EXPECTED_CO_BENEFIT_KEYS = {
    "impactRelationship",
    "impactText",
    "impactNumeric",
    "methodology",
}


def _assert_i18n_map(value: object, field_name: str) -> None:
    """Assert one i18n payload is a string-to-string mapping."""
    assert isinstance(value, dict), field_name
    for locale, text in value.items():
        assert isinstance(locale, str), field_name
        assert locale, field_name
        assert isinstance(text, str), field_name


def _assert_live_co_benefit_shape(
    co_benefit_payload: dict[str, object],
    field_name: str,
) -> None:
    """Assert one live co-benefit row keeps the expected shape."""
    assert EXPECTED_CO_BENEFIT_KEYS.issubset(co_benefit_payload.keys()), field_name
    assert co_benefit_payload["impactRelationship"] is None or isinstance(
        co_benefit_payload["impactRelationship"],
        str,
    ), field_name
    assert co_benefit_payload["impactText"] is None or isinstance(
        co_benefit_payload["impactText"],
        str,
    ), field_name
    assert co_benefit_payload["impactNumeric"] is None or isinstance(
        co_benefit_payload["impactNumeric"],
        int,
    ), field_name
    if isinstance(co_benefit_payload["impactNumeric"], int):
        assert -2 <= co_benefit_payload["impactNumeric"] <= 2, field_name
    assert co_benefit_payload["methodology"] is None or isinstance(
        co_benefit_payload["methodology"],
        str,
    ), field_name


def _assert_live_emissions_shape(emissions_payload: dict[str, object]) -> None:
    """Assert one live emissions row keeps the expected shape."""
    assert EXPECTED_EMISSIONS_KEYS.issubset(emissions_payload.keys())
    assert emissions_payload["impactRelationship"] is None or isinstance(
        emissions_payload["impactRelationship"],
        str,
    )
    assert isinstance(emissions_payload["impactText"], str)
    assert emissions_payload["impactText"]
    assert emissions_payload["impactNumeric"] is None or isinstance(
        emissions_payload["impactNumeric"],
        int,
    )
    assert emissions_payload["methodology"] is None or isinstance(
        emissions_payload["methodology"],
        str,
    )
    assert isinstance(emissions_payload["sectorNumber"], str)
    assert emissions_payload["sectorNumber"]
    subsector_numbers = emissions_payload["subsectorNumber"]
    assert isinstance(subsector_numbers, list)
    assert subsector_numbers
    for subsector_number in subsector_numbers:
        assert isinstance(subsector_number, int)
        assert subsector_number > 0
    gpc_reference_numbers = emissions_payload["gpcReferenceNumber"]
    assert isinstance(gpc_reference_numbers, list)
    assert gpc_reference_numbers
    for gpc_reference_number in gpc_reference_numbers:
        assert isinstance(gpc_reference_number, str)
        assert gpc_reference_number


@pytest.mark.integration
@pytest.mark.external
def test_action_pathways_live_payload_matches_expected_contract() -> None:
    """The live action catalog keeps the contract our service implements."""
    service = ActionPathwaysApiService()
    url = service._build_action_pathways_url()

    payload, status_code = get_json_with_retries(
        url=url,
        operation_name="action pathways API call",
        headers={"accept": "application/json"},
    )

    assert status_code == 200
    assert {"meta", "actions"}.issubset(payload.keys())
    assert "?" not in url
    meta = payload["meta"]
    assert EXPECTED_META_KEYS.issubset(meta.keys())
    assert isinstance(meta["generatedAtUtc"], str)
    assert meta["generatedAtUtc"]
    assert meta["backendConsumer"] is None or isinstance(meta["backendConsumer"], str)
    assert meta["upstreamProvider"] is None or isinstance(meta["upstreamProvider"], str)
    api_context = meta["apiContext"]
    assert isinstance(api_context, dict)
    assert {"endpoint"}.issubset(api_context.keys())
    assert api_context["endpoint"] == ACTION_PATHWAYS_ENDPOINT
    assert isinstance(meta["totalRecords"], int)
    assert meta["totalRecords"] == len(payload["actions"])

    actions = payload["actions"]
    assert isinstance(actions, list)
    assert actions
    for action in actions:
        assert EXPECTED_ACTION_KEYS.issubset(action.keys())
        assert not REMOVED_ACTION_KEYS.intersection(action.keys())
        assert isinstance(action["actionId"], str)
        assert action["actionId"]
        assert action["actionType"] == "mitigation"
        assert isinstance(action["actionName"], str)
        assert action["actionName"]
        assert action["description"] is None or isinstance(action["description"], str)
        assert action["interventionSummary"] is None or isinstance(
            action["interventionSummary"],
            str,
        )
        assert action["outcomeSummary"] is None or isinstance(
            action["outcomeSummary"],
            str,
        )
        assert action["interventionType"] is None or isinstance(
            action["interventionType"],
            str,
        )
        assert action["actionRole"] is None or isinstance(action["actionRole"], str)
        assert action["costInvestmentNeeded"] is None or isinstance(
            action["costInvestmentNeeded"],
            str,
        )
        assert action["timelineForImplementation"] is None or isinstance(
            action["timelineForImplementation"],
            str,
        )
        assert action["publisherId"] is None or isinstance(action["publisherId"], str)
        assert action["generationMethod"] is None or isinstance(
            action["generationMethod"],
            str,
        )
        _assert_i18n_map(action["nameI18n"], "nameI18n")
        _assert_i18n_map(action["descriptionI18n"], "descriptionI18n")
        _assert_i18n_map(
            action["interventionSummaryI18n"],
            "interventionSummaryI18n",
        )
        _assert_i18n_map(action["outcomeSummaryI18n"], "outcomeSummaryI18n")

        co_benefits = action["coBenefits"]
        assert isinstance(co_benefits, dict)
        for co_benefit_key, co_benefit_payload in co_benefits.items():
            assert isinstance(co_benefit_key, str)
            assert co_benefit_key
            assert isinstance(co_benefit_payload, dict)
            _assert_live_co_benefit_shape(co_benefit_payload, co_benefit_key)

        emissions = action["emissions"]
        assert isinstance(emissions, dict)
        _assert_live_emissions_shape(emissions)

    validated = ActionPathwaysApiResponse.model_validate(payload)
    assert validated.actions


@pytest.mark.integration
@pytest.mark.external
def test_action_pathways_live_service_maps_current_upstream_payload() -> None:
    """The synchronous action service maps the live upstream payload into actions."""
    actions = ActionPathwaysApiService().list_actions()

    assert actions
    assert all(action.action_type == "mitigation" for action in actions)
    assert actions[0].action_id
    assert actions[0].action_name
    assert "socioeconomicIndicators" not in actions[0].raw
