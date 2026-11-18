"""Hash the executable demo and prompt contracts without reading credentials."""

import hashlib
import json
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]


def implementation_hashes(root: Path = SERVICE_ROOT) -> dict[str, str]:
    """Return stable hashes for code, schema, prompts and scoring dependencies."""
    files = []
    for pattern in [
        "extractor/**/*.py",
        "extractor/prompts/*.md",
        "examples/*.py",
        "benchmarks/schemas/*.json",
        "benchmarks/prompts/*.md",
        "benchmarks/comparison-bridge.ts",
        "benchmarks/references/*.json",
        "benchmarks/cases.json",
        "requirements*.txt",
    ]:
        files.extend(root.glob(pattern))
    return {
        str(path.relative_to(root))
        .replace("\\", "/"): hashlib.sha256(path.read_bytes())
        .hexdigest()
        for path in sorted(set(files))
    }


def implementation_fingerprint(root: Path = SERVICE_ROOT) -> str:
    """Identify one loaded implementation; API captures this at server startup."""
    return hashlib.sha256(
        json.dumps(implementation_hashes(root), sort_keys=True).encode()
    ).hexdigest()
