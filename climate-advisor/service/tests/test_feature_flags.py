from __future__ import annotations

import unittest

from app.config.feature_flags import FeatureFlags, has_feature_flag, parse_feature_flags


class FeatureFlagTests(unittest.TestCase):
    """Tests for Climate Advisor feature flag parsing."""

    def test_parse_feature_flags_defaults_to_empty(self) -> None:
        """Verify empty feature flag input returns no flags."""

        self.assertEqual(parse_feature_flags(None), [])
        self.assertEqual(parse_feature_flags(""), [])

    def test_parse_feature_flags_cleans_comma_separated_values(self) -> None:
        """Verify quoted comma-separated feature flags are normalized."""

        self.assertEqual(
            parse_feature_flags('"STATIONARY_ENERGY_AGENTIC", OTHER_FLAG'),
            ["STATIONARY_ENERGY_AGENTIC", "OTHER_FLAG"],
        )

    def test_has_feature_flag_checks_known_flag(self) -> None:
        """Verify feature flag lookup checks configured values."""

        self.assertTrue(
            has_feature_flag(
                FeatureFlags.STATIONARY_ENERGY_AGENTIC,
                "OTHER_FLAG,STATIONARY_ENERGY_AGENTIC",
            )
        )
        self.assertFalse(has_feature_flag(FeatureFlags.STATIONARY_ENERGY_AGENTIC, ""))


if __name__ == "__main__":
    unittest.main()
