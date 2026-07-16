from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml


REPO_ROOT = Path(__file__).resolve().parents[3]

ENVIRONMENTS = {
    "dev": {
        "web_workflow": ".github/workflows/web-develop.yml",
        "pdf_ocr_cron": "k8s/cc-process-pdf-ocr-jobs.yml",
        "mistral_secret": "MISTRAL_API_KEY_DEV",
    },
    "test": {
        "web_workflow": ".github/workflows/web-test.yml",
        "pdf_ocr_cron": "k8s/test/cc-test-process-pdf-ocr-jobs.yml",
        "mistral_secret": "MISTRAL_API_KEY_TEST",
    },
    "prod": {
        "web_workflow": ".github/workflows/web-tag.yml",
        "pdf_ocr_cron": "k8s/prod/cc-prod-process-pdf-ocr-jobs.yml",
        "mistral_secret": "MISTRAL_API_KEY_PROD",
    },
}


def load_yaml(path: str) -> dict:
    """Load a single Kubernetes YAML document relative to the repository root."""
    with (REPO_ROOT / path).open(encoding="utf-8") as handle:
        document = yaml.safe_load(handle)
    assert isinstance(document, dict), f"{path} did not parse as a YAML mapping"
    return document


def workflow_text(path: str) -> str:
    """Read a GitHub workflow or manifest relative to the repository root."""
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def workflow_env_value(text: str, key: str) -> str:
    """Extract one kubectl-set environment value from a workflow script block."""
    pattern = rf'(?<![A-Z0-9_])["\']?{re.escape(key)}=([^"\'\\\s]+)'
    match = re.search(pattern, text)
    assert match, f"{key} was not set in workflow"
    return match.group(1)


def normalized_secret_reference(value: str) -> str:
    """Normalize GitHub expression spacing for secret-reference comparisons."""
    return re.sub(r"\s+", "", value)


@pytest.mark.parametrize("environment, config", ENVIRONMENTS.items())
def test_pdf_ocr_cron_and_mistral_secret_are_deployed(
    environment: str,
    config: dict[str, str],
) -> None:
    """Ensure each environment runs the authenticated non-overlapping OCR worker."""
    cron_path = config["pdf_ocr_cron"]
    workflow_path = config["web_workflow"]
    cron = load_yaml(cron_path)
    workflow = workflow_text(workflow_path)

    assert cron["kind"] == "CronJob"
    assert cron["spec"]["schedule"] == "* * * * *"
    assert cron["spec"]["concurrencyPolicy"] == "Forbid"
    command = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"][
        "containers"
    ][0]["command"][-1]
    assert "/api/v1/cron/process-pdf-ocr-jobs" in command
    assert "Authorization: Bearer $CC_CRON_JOB_API_KEY" in command
    assert cron_path in workflow, f"{cron_path} missing from {workflow_path}"
    assert f"kubectl apply -f {cron_path}" in workflow

    expected_secret = "${{secrets." + config["mistral_secret"] + "}}"
    assert (
        normalized_secret_reference(workflow_env_value(workflow, "MISTRAL_API_KEY"))
        == expected_secret
    ), f"{environment} uses the wrong Mistral secret"


def test_ca_has_no_ocr_runtime_or_cnb_migration() -> None:
    """Keep OCR, Mistral, S3 permissions, and CNB persistence out of CA."""
    pyproject = (
        (REPO_ROOT / "climate-advisor/pyproject.toml")
        .read_text(encoding="utf-8")
        .lower()
    )
    assert "mistral" not in pyproject

    for deployment_path in (
        "climate-advisor/k8s/deployment-dev.yml",
        "climate-advisor/k8s/deployment-test.yml",
        "climate-advisor/k8s/deployment-prod.yml",
    ):
        deployment_text = workflow_text(deployment_path)
        assert "MISTRAL_API_KEY" not in deployment_text
        assert "AWS_ACCESS_KEY_ID" not in deployment_text

    migrations = list(
        (REPO_ROOT / "climate-advisor/service/migrations/versions").glob("*.py")
    )
    assert not any(
        "concept_note" in path.name.lower()
        or "concept_note" in path.read_text(encoding="utf-8").lower()
        for path in migrations
    )
