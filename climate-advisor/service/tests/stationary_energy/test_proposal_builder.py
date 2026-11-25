"""Source agreement and conflict classification for deterministic proposals."""

from __future__ import annotations

import unittest
from typing import Any
from uuid import uuid4

from app.services.stationary_energy.stationary_energy_proposal_builder import (
    build_deterministic_proposals,
)
from tests.stationary_energy.fixtures import _context_payload


class StationaryEnergyProposalBuilderTests(unittest.TestCase):
    def _assert_multi_source_result(
        self, second_value: str, expected_status: str
    ) -> None:
        taxonomy = [_context_payload()["taxonomy"][0]]
        candidates: list[dict[str, Any]] = []
        for datasource_id, publisher, value in [
            ("ds-a", "A", "1000000"),
            ("ds-b", "B", second_value),
        ]:
            candidates.append(
                {
                    "candidate_id": str(uuid4()),
                    "datasource_id": datasource_id,
                    "publisher_name": publisher,
                    "dataset_year": 2024,
                    "geography_match": "city",
                    "source_scope": taxonomy[0],
                    "normalized_rows": [
                        {
                            "emissions_value_100yr": value,
                            "emissions_unit": "kgCO2e",
                        }
                    ],
                    "applicability_status": "applicable",
                }
            )
        proposals = build_deterministic_proposals(
            taxonomy_rows=taxonomy,
            stored_source_candidates=candidates,
            current_values=[],
            inventory_year=2024,
        )
        self.assertEqual(len(proposals), 1)
        proposal = proposals[0]
        self.assertEqual(proposal["status"], expected_status)
        self.assertEqual(proposal["recommended_datasource_id"], "ds-a")
        self.assertEqual(
            proposal["alternative_candidate_ids"], [candidates[1]["candidate_id"]]
        )

    def test_equal_multi_source_values_become_needs_review(self) -> None:
        self._assert_multi_source_result("1000000.0", "needs_review")

    def test_different_multi_source_values_become_deterministic_conflict(self) -> None:
        self._assert_multi_source_result("2000000", "conflict")
