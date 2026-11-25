from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import unittest

from app.db import Base
from app.models.db.stationary_energy_draft import StationaryEnergyDraftRun


class StationaryEnergyMigrationTests(unittest.TestCase):
    def test_migration_contains_required_tables_and_indexes(self) -> None:
        table_names = {
            StationaryEnergyDraftRun.__tablename__,
            "stationary_energy_draft_source_candidates",
            "stationary_energy_draft_proposals",
            "stationary_energy_review_decisions",
            "stationary_energy_staged_review_selections",
        }
        for table_name in table_names:
            self.assertIn(table_name, Base.metadata.tables)

        source_indexes = {
            tuple(index.columns.keys())
            for index in Base.metadata.tables[
                "stationary_energy_draft_source_candidates"
            ].indexes
        }
        self.assertIn(("draft_run_id",), source_indexes)
        self.assertIn(("draft_run_id", "datasource_id"), source_indexes)
        self.assertIn(("draft_run_id", "applicability_status"), source_indexes)
        review_decision_columns = Base.metadata.tables[
            "stationary_energy_review_decisions"
        ].columns
        self.assertIn("decision_version", review_decision_columns)
        staged_selection_columns = Base.metadata.tables[
            "stationary_energy_staged_review_selections"
        ].columns
        self.assertIn("tool_call_id", staged_selection_columns)
