from __future__ import annotations

import unittest
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.config.feature_flags import FeatureFlags, has_feature_flag, parse_feature_flags


class FeatureFlagTests(unittest.TestCase):
    def test_parse_feature_flags_defaults_to_empty(self) -> None:
        self.assertEqual(parse_feature_flags(None), [])
        self.assertEqual(parse_feature_flags(""), [])

    def test_parse_feature_flags_cleans_comma_separated_values(self) -> None:
        self.assertEqual(
            parse_feature_flags('"STATIONARY_ENERGY_AGENTIC", OTHER_FLAG'),
            ["STATIONARY_ENERGY_AGENTIC", "OTHER_FLAG"],
        )

    def test_has_feature_flag_checks_known_flag(self) -> None:
        self.assertTrue(
            has_feature_flag(
                FeatureFlags.STATIONARY_ENERGY_AGENTIC,
                "OTHER_FLAG,STATIONARY_ENERGY_AGENTIC",
            )
        )
        self.assertFalse(has_feature_flag(FeatureFlags.STATIONARY_ENERGY_AGENTIC, ""))


if __name__ == "__main__":
    unittest.main()
