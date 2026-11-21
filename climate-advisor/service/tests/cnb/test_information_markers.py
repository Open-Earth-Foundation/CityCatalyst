"""Marker parsing and marker-to-gap pairing shared with the app.

The vectors match `app/tests/concept-note-draft-markdown.jest.ts`, which checks
the app's mirror (`informationMarkerKey`) against the same pairs.
"""

import pytest

from app.utils.cnb_information_markers import (
    find_information_marker,
    information_marker_key,
    information_needed_markers,
)

QUESTION = "What is Richfield's local share?"

# (marker as written in the chapter, gap question it must pair with)
SAME_GAP = [
    ("[Information needed: What is Richfield's local share?]", QUESTION),
    ("[Information needed: **What is Richfield's local share?**]", QUESTION),
    ("[Information needed: What is Richfield's local share]", QUESTION),
    ("[Information needed: What is Richfield’s local share?]", QUESTION),
    ("[Information needed: What is  Richfield's local share?]", QUESTION),
    ("[Information needed: What is Richfield's\nlocal share?]", QUESTION),
    ("[Information needed: What is Richfield's _local_ share?]", QUESTION),
    ("[information needed:What is RICHFIELD'S local share?]", QUESTION),
    (
        "[Information needed: What is Richfield's local share?]",
        f"Information needed: {QUESTION}",
    ),
]
OTHER_GAP = [
    ("[Information needed: What is Richfield's total cost?]", QUESTION),
    ("[Information needed: What is Richfield's local share in 2027?]", QUESTION),
]


@pytest.mark.parametrize("marker,question", SAME_GAP)
def test_formatting_never_splits_a_marker_from_its_gap(marker: str, question: str):
    assert information_needed_markers(f"Text. {marker} More.") == [marker]
    assert information_marker_key(marker) == information_marker_key(question)
    assert information_marker_key(marker) == "what is richfield s local share"


@pytest.mark.parametrize("marker,question", OTHER_GAP)
def test_different_words_stay_different_gaps(marker: str, question: str):
    assert information_marker_key(marker) != information_marker_key(question)


def test_a_marker_ends_at_its_first_closing_bracket():
    body = "[Information needed: Who signs\nthe application?] and [x](y)"
    assert information_needed_markers(body) == [
        "[Information needed: Who signs\nthe application?]"
    ]


def test_finds_the_marker_that_pairs_with_a_question():
    body = (
        "Intro. [Information needed: Other?] Text [Information needed: **Who signs**]"
    )
    assert find_information_marker(body, "Who signs?") == body.index(
        "[Information needed: **"
    )
    assert find_information_marker(body, "Missing?") == -1
