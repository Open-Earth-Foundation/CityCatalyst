"""Tests for deterministic Concept Note Builder project-tag normalization."""

from app.services.cnb_project_tag_normalizer import (
    normalize_project_tag,
    normalize_project_tags,
)


def test_normalize_project_tag_lowercases_and_replaces_spacing_and_punctuation() -> None:
    """One tag should normalize to a stable hyphenated token."""
    assert normalize_project_tag("  Green / Infrastructure  ") == "green-infrastructure"


def test_normalize_project_tags_deduplicates_without_inventing_new_tags() -> None:
    """Variants collapse to one normalized tag and blanks are dropped."""
    assert normalize_project_tags(
        [
            "Green Infrastructure",
            "green-infrastructure",
            "FLOOD / Heat",
            "flood heat",
            "",
            "  ",
        ]
    ) == ["green-infrastructure", "flood-heat"]
