"""Regression tests for thread-safe vector store caching."""

import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent.parent.parent / "app"
if str(app_dir) not in sys.path:
    sys.path.insert(0, str(app_dir))

from utils import get_vectorstore_local


def test_get_vectorstore_initializes_collection_only_once(monkeypatch):
    """Serialize first-load initialization so concurrent callers share one cache entry."""
    collection_name = "all_docs_db_small_chunks"
    sentinel = object()
    load_calls: list[str] = []
    start_barrier = threading.Barrier(4)

    def fake_load_vectorstore(name: str, embedding_model: str = "unused"):
        """Return a sentinel vector store after a short delay."""
        load_calls.append(name)
        time.sleep(0.05)
        return sentinel

    monkeypatch.setattr(
        get_vectorstore_local,
        "load_vectorstore",
        fake_load_vectorstore,
    )
    get_vectorstore_local.VECTOR_STORES.clear()

    try:
        def worker():
            """Call the shared cache after synchronizing thread start."""
            start_barrier.wait()
            return get_vectorstore_local.get_vectorstore(collection_name)

        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda _idx: worker(), range(4)))

        assert results == [sentinel, sentinel, sentinel, sentinel]
        assert load_calls == [collection_name]
    finally:
        get_vectorstore_local.VECTOR_STORES.clear()
