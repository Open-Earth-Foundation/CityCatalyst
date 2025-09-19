# tests/test_ml_compare_properties.py
"""
Property-based tests for the `ml_compare` function.

* Antisymmetry:   sign(ml_compare(c, A, B)) == -sign(ml_compare(c, B, A))
* Transitivity:   if A > B and B > C then A > C

Run with:      pytest -q tests/unit/test_ml_compare_properties.py
Run without slow tests: pytest -m "not slow"
"""

import random
from typing import List
import pytest

# ---------------------------------------------------------------------------
# 1.  Imports from your code base
# ---------------------------------------------------------------------------

# Adjust these import paths to your project layout
from prioritizer.utils.ml_comparator import ml_compare
from services.get_actions import get_actions

# ---------------------------------------------------------------------------
# 2.  Configuration
# ---------------------------------------------------------------------------

# Set to True to test specific actions instead of random ones
TEST_SPECIFIC_ACTIONS = False

# Specific actions to test when TEST_SPECIFIC_ACTIONS is True
SPECIFIC_ACTION_A = "c40_0010"
SPECIFIC_ACTION_B = "c40_0012"

# ---------------------------------------------------------------------------
# 3.  Static dummy city  (small, deterministic)
#     – Use any city dict you like; properties not used by the model are ignored
# ---------------------------------------------------------------------------

CITY = {
    "locode": "TESTCITY",
    "populationSize": 500000,
    "populationDensity": 1500,
    "elevation": 50,
    "biome": "temperate_forest",
    "stationaryEnergyEmissions": 1000000,
    "transportationEmissions": 500000,
    "wasteEmissions": 300000,
    "ippuEmissions": 150000,
    "afoluEmissions": 20000,
    "ccra": [],  # keep empty for speed
}

# ---------------------------------------------------------------------------
# 4.  Fetch actions for each test
# ---------------------------------------------------------------------------


@pytest.fixture(scope="function")
def actions():
    """Fetch actions for each test."""
    actions = get_actions(language="en")
    if not actions:
        raise RuntimeError("Could not fetch climate-actions catalogue.")
    return actions


def _find_action_by_id(actions: List[dict], action_id: str) -> dict:
    """Find an action by its ActionID."""
    for action in actions:
        if action.get("ActionID") == action_id:
            return action
    raise ValueError(f"Action with ID '{action_id}' not found in actions list")


# ---------------------------------------------------------------------------
# 5.  Helpers
# ---------------------------------------------------------------------------


def sign(x: int) -> int:
    """Return +1 or -1 only (binary classification)."""
    if x not in (1, -1):
        raise ValueError(
            f"ml_compare returned {x}, expected 1 or -1 for binary classification"
        )
    return x


# ---------------------------------------------------------------------------
# 6.  Property tests
# ---------------------------------------------------------------------------

N_PAIRS = 200  # number of random pairs for antisymmetry
M_TRIPLES = 100  # number of random triples for transitivity
RNG_SEED = 42  # reproducible randomness


@pytest.mark.slow
def test_antisymmetry(actions):
    """
    For random pairs A,B assert:
        compare(A,B) == +1  ⇒  compare(B,A) == -1
        compare(A,B) == -1  ⇒  compare(B,A) == +1
    """
    if TEST_SPECIFIC_ACTIONS:
        # Test specific actions
        a = _find_action_by_id(actions, SPECIFIC_ACTION_A)
        b = _find_action_by_id(actions, SPECIFIC_ACTION_B)

        s1 = sign(ml_compare(CITY, a, b))
        s2 = sign(ml_compare(CITY, b, a))
        assert s1 == -s2, (
            "Antisymmetry violated:\n"
            f"  compare(A,B) = {s1}\n"
            f"  compare(B,A) = {s2}\n"
            f"A = {a['ActionID']},  B = {b['ActionID']}"
        )
    else:
        # Original random testing logic - collect all failures
        rng = random.Random(RNG_SEED)
        failures = []

        for i in range(N_PAIRS):
            a, b = rng.sample(actions, 2)
            s1 = sign(ml_compare(CITY, a, b))
            s2 = sign(ml_compare(CITY, b, a))

            if s1 != -s2:
                failures.append(
                    {
                        "pair_index": i,
                        "action_a": a["ActionID"],
                        "action_b": b["ActionID"],
                        "compare_ab": s1,
                        "compare_ba": s2,
                    }
                )

        # Report all failures
        if failures:
            failure_details = "\n".join(
                [
                    f"  Pair {f['pair_index']}: A={f['action_a']}, B={f['action_b']}, "
                    f"compare(A,B)={f['compare_ab']}, compare(B,A)={f['compare_ba']}"
                    for f in failures
                ]
            )

            assert False, (
                f"Antisymmetry violated in {len(failures)} out of {N_PAIRS} pairs:\n"
                f"{failure_details}"
            )


@pytest.mark.slow
def test_transitivity(actions):
    """
    For random triples A,B,C assert transitivity (binary classification only):
        if A > B and B > C  then A > C
        if A < B and B < C  then A < C
    """
    if TEST_SPECIFIC_ACTIONS:
        # Test specific actions (need a third action for transitivity)
        a = _find_action_by_id(actions, SPECIFIC_ACTION_A)
        b = _find_action_by_id(actions, SPECIFIC_ACTION_B)

        # Find a third action that's different from A and B
        third_action = None
        for action in actions:
            if action["ActionID"] not in [SPECIFIC_ACTION_A, SPECIFIC_ACTION_B]:
                third_action = action
                break

        if third_action is None:
            pytest.skip("Need at least 3 actions for transitivity test")

        c = third_action

        # Test transitivity cases (binary classification only)
        ab = sign(ml_compare(CITY, a, b))
        bc = sign(ml_compare(CITY, b, c))
        ac = sign(ml_compare(CITY, a, c))

        # Check transitivity rules for binary classification
        if ab == 1 and bc == 1:  # A > B and B > C
            assert ac == 1, f"A > B ({ab}) and B > C ({bc}) but A <= C ({ac})"
        elif ab == -1 and bc == -1:  # A < B and B < C
            assert ac == -1, f"A < B ({ab}) and B < C ({bc}) but A >= C ({ac})"

    else:
        # Original random testing logic - collect all failures
        rng = random.Random(RNG_SEED + 1)
        failures = []

        for i in range(M_TRIPLES):
            a, b, c = rng.sample(actions, 3)
            ab = sign(ml_compare(CITY, a, b))
            bc = sign(ml_compare(CITY, b, c))
            ac = sign(ml_compare(CITY, a, c))

            # Check transitivity violations for binary classification
            violation_type = None
            if ab == 1 and bc == 1 and ac == -1:
                violation_type = "A > B and B > C but A < C"
            elif ab == -1 and bc == -1 and ac == 1:
                violation_type = "A < B and B < C but A > C"

            if violation_type:
                failures.append(
                    {
                        "triple_index": i,
                        "action_a": a["ActionID"],
                        "action_b": b["ActionID"],
                        "action_c": c["ActionID"],
                        "compare_ab": ab,
                        "compare_bc": bc,
                        "compare_ac": ac,
                        "violation_type": violation_type,
                    }
                )

        # Report all failures
        if failures:
            failure_details = "\n".join(
                [
                    f"  Triple {f['triple_index']}: A={f['action_a']}, B={f['action_b']}, C={f['action_c']}, "
                    f"A:B={f['compare_ab']}, B:C={f['compare_bc']}, A:C={f['compare_ac']} - {f['violation_type']}"
                    for f in failures
                ]
            )

            assert False, (
                f"Transitivity violated in {len(failures)} out of {M_TRIPLES} triples:\n"
                f"{failure_details}"
            )
