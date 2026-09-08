#!/usr/bin/env python3
"""Validate CC-771 structured artifacts against committed schemas."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
DOC_SCHEMA = ROOT / "schemas" / "document.structured.schema.json"
VISUAL_SCHEMA = ROOT / "schemas" / "visual-annotation.schema.json"


def validate_file(path: Path, schema: dict) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
    messages = []
    for err in errors:
        loc = "/".join(str(p) for p in err.path) or "<root>"
        messages.append(f"{path}: {loc}: {err.message}")
    if path.name == "document.structured.json":
        for page in data.get("pages") or []:
            for image in page.get("images") or []:
                ann = image.get("annotation")
                if not ann:
                    continue
                visual = Draft202012Validator(
                    json.loads(VISUAL_SCHEMA.read_text(encoding="utf-8"))
                )
                for err in sorted(visual.iter_errors(ann), key=lambda e: list(e.path)):
                    loc = "/".join(str(p) for p in err.path) or "<root>"
                    messages.append(
                        f"{path}: images[{image.get('image_id')}].annotation/{loc}: {err.message}"
                    )
    return messages


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    doc_schema = json.loads(DOC_SCHEMA.read_text(encoding="utf-8"))
    all_errors: list[str] = []
    for path in args.paths:
        if path.name.endswith("visual") or "visual-annotation" in path.name:
            schema = json.loads(VISUAL_SCHEMA.read_text(encoding="utf-8"))
        else:
            schema = doc_schema
        all_errors.extend(validate_file(path, schema))
    if all_errors:
        print("INVALID")
        for message in all_errors:
            print(message)
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
