import random, functools
from typing import List, Dict, Callable, Tuple


def quickselect_top_k(
    city: Dict,
    actions: List[Dict],
    k: int,
    comparator: Callable[[Dict, Dict, Dict], int],  # +1 if 1st wins, else –1
) -> List[Tuple[Dict, int]]:
    """
    Return the k best actions (exact) together with their rank.

    Parameters
    ----------
    city : dict
        Context passed verbatim to `comparator`.
    actions : list[dict]
        Candidate actions.  The list is modified in-place for speed; pass
        `actions[:]` if you need to keep an untouched copy.
    k : int
        Number of top actions to return (1 ≤ k ≤ len(actions)).
    comparator : Callable[[dict, dict, dict], int]
        Deterministic, transitive preference:
            +1  → first action better than second
            -1  → second action better than first
        (No ties allowed.)

    Returns
    -------
    list[tuple[dict, int]]
        Exactly k tuples, already sorted best→worst:
            [(action₁, 1), (action₂, 2), …, (action_k, k)]

    Complexity
    ----------
    Expected O(n + k log k) comparisons of `comparator`
    (≈ 280 for n = 200, k = 20).

    Notes
    -----
    • Any exception raised inside `comparator` is propagated.
    • Input list order on return is undefined; rely only on the return value.
    """

    n = len(actions)
    if k >= n:
        ordered = sorted(
            actions, key=functools.cmp_to_key(lambda a, b: -comparator(city, a, b))
        )
        return [(act, rank) for rank, act in enumerate(ordered, 1)]

    def is_better(a, b) -> bool:
        return comparator(city, a, b) == 1

    def partition(lo: int, hi: int, pivot_idx: int) -> int:
        pivot = actions[pivot_idx]
        actions[pivot_idx], actions[hi] = actions[hi], actions[pivot_idx]
        store = lo
        for i in range(lo, hi):
            if is_better(actions[i], pivot):
                actions[store], actions[i] = actions[i], actions[store]
                store += 1
        actions[store], actions[hi] = actions[hi], actions[store]
        return store

    lo, hi = 0, n - 1
    while True:
        pivot_idx = random.randint(lo, hi)
        pivot_idx = partition(lo, hi, pivot_idx)
        if pivot_idx == k:
            break
        elif pivot_idx < k:
            lo = pivot_idx + 1
        else:
            hi = pivot_idx - 1

    top_k_unsorted = actions[:k]
    top_k_sorted = sorted(
        top_k_unsorted, key=functools.cmp_to_key(lambda a, b: -comparator(city, a, b))
    )

    return [(act, rank) for rank, act in enumerate(top_k_sorted, 1)]
