"""Brief: Install original benchmark PDFs from supplied local Drive ZIPs.

Inputs: --zip PATH (repeatable), --pdf-dir PATH (repeatable), and optional
--answer-keys PATH for private Product JSON. Only manifest filenames are imported;
Paris and unlisted files are ignored. No publisher downloads or provider calls.
Outputs: PDF bytes and SHA-256/source/page provenance under benchmarks/.local.
Usage (from pdf-extraction):
.venv\\Scripts\\python.exe -m examples.prepare_benchmarks
--zip C:\\Users\\mirco\\Downloads\\round1.zip
--zip C:\\Users\\mirco\\Downloads\\round2.zip
--zip C:\\Users\\mirco\\Downloads\\holdout.zip
"""

import argparse
import hashlib
import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader
from extractor.benchmarks import BenchmarkCatalog, ROOT, read_json

LOGGER = logging.getLogger(__name__)
MAX_PDF = 45 * 1024 * 1024


def parse_args() -> argparse.Namespace:
    """Accept original ZIPs/directories and optional private keys only."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--zip",
        type=Path,
        action="append",
        default=[],
        help="Original Drive folder ZIP; repeatable",
    )
    parser.add_argument(
        "--pdf-dir",
        type=Path,
        action="append",
        default=[],
        help="Folder of original canonical filenames; repeatable",
    )
    parser.add_argument(
        "--answer-keys", type=Path, help="Private Product key JSON with a files object"
    )
    return parser.parse_args()


def install_pdf(destination: Path, data: bytes, source: str, provenance: dict) -> None:
    """Validate original PDF bytes before writing and recording exact provenance."""
    if len(data) > MAX_PDF or not data.startswith(b"%PDF-"):
        raise ValueError("Expected a PDF of 45 MiB or smaller: " + source)
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted or not reader.pages:
        raise ValueError("Encrypted or empty PDF: " + source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    provenance[destination.name] = {
        "source": source,
        "sha256": hashlib.sha256(data).hexdigest(),
        "pages": len(reader.pages),
        "bytes": len(data),
        "installed_at": datetime.now(timezone.utc).isoformat(),
    }
    LOGGER.info("Ready: %s (%s pages)", destination.name, len(reader.pages))


def prepare(args: argparse.Namespace, root: Path = ROOT) -> list[str]:
    """Import allowlisted originals; reject ambiguous differing copies."""
    catalog = BenchmarkCatalog(root)
    local = root / ".local"
    local.mkdir(parents=True, exist_ok=True)
    provenance_path = local / "provenance.json"
    provenance = read_json(provenance_path) if provenance_path.exists() else {}
    errors = []
    if args.answer_keys:
        keys = read_json(args.answer_keys)
        if not isinstance(keys.get("files"), dict):
            raise ValueError("Expected Product answer-key JSON with a files object.")
        (local / "answer-keys.json").write_text(
            json.dumps(keys, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    for case in catalog.cases.values():
        target = catalog.path(case["pdf"])
        candidates = []
        try:
            for folder in args.pdf_dir:
                path = folder / target.name
                if path.is_file():
                    if path.stat().st_size > MAX_PDF:
                        raise ValueError("Local PDF exceeds 45 MiB.")
                    candidates.append((path.read_bytes(), str(path.resolve())))
            for archive in args.zip:
                with zipfile.ZipFile(archive) as zipped:
                    for member in zipped.infolist():
                        # ZIP paths are never extracted; output names come from the manifest.
                        if not member.is_dir() and Path(member.filename).name in {
                            target.name,
                            target.stem,
                        }:
                            if member.file_size > MAX_PDF:
                                raise ValueError("ZIP PDF exceeds 45 MiB.")
                            with zipped.open(member) as stream:
                                candidates.append(
                                    (
                                        stream.read(MAX_PDF + 1),
                                        f"{archive.resolve()}:{member.filename}",
                                    )
                                )
            if candidates:
                if (
                    len({hashlib.sha256(data).hexdigest() for data, _ in candidates})
                    != 1
                ):
                    raise ValueError(
                        "Different original files share a canonical filename; resolve the source conflict."
                    )
                install_pdf(target, *candidates[0], provenance)
        except (OSError, ValueError, zipfile.BadZipFile) as error:
            errors.append(f"{case['id']}: {error}")
            LOGGER.error("%s", errors[-1])
    active_names = {catalog.path(case["pdf"]).name for case in catalog.cases.values()}
    provenance = {
        name: record for name, record in provenance.items() if name in active_names
    }
    provenance_path.write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return errors


def main() -> None:
    """Prepare originals and summarize readiness without provider calls."""
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    errors = prepare(args)
    listing = BenchmarkCatalog().listing()
    LOGGER.info(
        "Original cases ready: %s/%s",
        sum(case["pdf_ready"] for case in listing),
        len(listing),
    )
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
