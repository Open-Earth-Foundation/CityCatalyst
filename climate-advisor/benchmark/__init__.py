"""Benchmark suites and shared usage utilities.

The benchmark drives the production service code in ``../service/app``; importing
this package makes ``app`` importable when running from ``climate-advisor/``.
"""

import sys
from pathlib import Path

_SERVICE = str(Path(__file__).resolve().parents[1] / "service")
if _SERVICE not in sys.path:
    sys.path.append(_SERVICE)
