from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import ValidationError

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.main import get_app
from app.models.draft_review import (
    DraftReviewActionType,
    DraftReviewDecision,
    SectorDraftRequest,
)
from app.services.draft_inventory_service import generate_stationary_energy_draft


def build_payload(**overrides):
    payload = {
        "inventory": {
            "inventory_id": "inventory-1",
            "city_id": "city-1",
            "city_name": "Quilmes",
            "locode": "AR QLM",
            "country_code": "AR",
            "year": 2023,
            "locale": "es",
        },
        "sector": {
            "code": "I",
            "name": "Stationary Energy",
            "subsectors": [
                {"code": "I.1", "label": "Residential"},
                {"code": "I.2", "label": "Commercial"},
                {"code": "I.3", "label": "Industry"},
            ],
        },
        "current_state": [
            {"subsector_code": "I.1", "is_locked": False},
            {"subsector_code": "I.2", "is_locked": False},
            {"subsector_code": "I.3", "is_locked": True},
        ],
        "candidates": [
            {
                "subsector_code": "I.1",
                "options": [
                    {
                        "source_id": "source-seeg",
                        "source_name": "SEEG",
                        "value": 100,
                        "unit": "kgCO2e",
                        "year": 2023,
                        "tier": 2,
                        "method": "global_api",
                        "geography_match": "city_direct",
                        "coverage": "complete",
                        "confidence": 0.9,
                        "citation": "https://example.test/seeg",
                    }
                ],
            },
            {
                "subsector_code": "I.2",
                "options": [
                    {
                        "source_id": "source-trace",
                        "source_name": "ClimateTRACE",
                        "value": 200,
                        "unit": "kgCO2e",
                        "year": 2023,
                        "tier": 3,
                        "method": "global_api",
                        "geography_match": "city_direct",
                        "coverage": "complete",
                        "confidence": 0.85,
                    },
                    {
                        "source_id": "source-bpjp",
                        "source_name": "BPJP_BULK",
                        "value": 130,
                        "unit": "kgCO2e",
                        "year": 2023,
                        "tier": 2,
                        "method": "bulk_inventory",
                        "geography_match": "city_proxy",
                        "coverage": "partial",
                        "confidence": 0.75,
                    },
                ],
            },
        ],
        "policy": {
            "allowed_sources": ["SEEG", "ClimateTRACE", "BPJP_BULK"],
            "conflict_variance_threshold": 0.15,
            "require_explicit_acceptance": True,
        },
    }
    payload.update(overrides)
    return payload


class InventoryDraftServiceTests(unittest.TestCase):
    def test_generates_ready_conflict_and_gap_proposals(self) -> None:
        output = generate_stationary_energy_draft(
            SectorDraftRequest(**build_payload())
        )

        proposals = {proposal.subsector_code: proposal for proposal in output.proposals}

        self.assertEqual(proposals["I.1"].status.value, "ready")
        self.assertEqual(proposals["I.1"].recommended.source_id, "source-seeg")
        self.assertEqual(proposals["I.2"].status.value, "conflict")
        self.assertTrue(proposals["I.2"].needs_user_choice)
        self.assertEqual(proposals["I.2"].recommended.source_id, "source-trace")
        self.assertEqual(proposals["I.3"].status.value, "gap")
        self.assertIsNone(proposals["I.3"].recommended)

    def test_review_decision_requires_override_payload(self) -> None:
        with self.assertRaises(ValidationError):
            DraftReviewDecision(
                proposal_id="proposal-1",
                subsector_code="I.2",
                action=DraftReviewActionType.OVERRIDE,
            )

        decision = DraftReviewDecision(
            proposal_id="proposal-1",
            subsector_code="I.2",
            action=DraftReviewActionType.OVERRIDE,
            selected_source_id="source-bpjp",
        )
        self.assertEqual(decision.selected_source_id, "source-bpjp")


class InventoryDraftRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(get_app())

    def test_stationary_energy_route_returns_structured_output(self) -> None:
        response = self.client.post(
            "/v1/inventory-drafts/stationary-energy",
            json=build_payload(),
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["inventory_id"], "inventory-1")
        self.assertEqual(body["city_id"], "city-1")
        self.assertEqual(body["locode"], "AR QLM")
        self.assertEqual(body["sector_code"], "I")
        self.assertEqual(len(body["proposals"]), 3)
