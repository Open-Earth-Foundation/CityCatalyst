from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

import pytest
import yaml


REPO_ROOT = Path(__file__).resolve().parents[3]
SMOKE_SCRIPT_PATH = ".github/scripts/cc-ca-post-deploy-smoke.sh"

ENVIRONMENTS = {
    "dev": {
        "service": "climate-advisor/k8s/service-dev.yml",
        "deployment": "climate-advisor/k8s/deployment-dev.yml",
        "fixture": "k8s/cc-ca-smoke-fixture.yml",
        "ca_workflow": ".github/workflows/climate-advisor-develop.yml",
        "web_workflow": ".github/workflows/web-develop.yml",
        "web_manifests": ["k8s/cc-web-deploy.yml", "k8s/cc-web.yml"],
        "pdf_ocr_cron": "k8s/cc-process-pdf-ocr-jobs.yml",
        "mistral_secret": "MISTRAL_API_KEY_DEV",
    },
    "test": {
        "service": "climate-advisor/k8s/service-test.yml",
        "deployment": "climate-advisor/k8s/deployment-test.yml",
        "fixture": "k8s/test/cc-test-ca-smoke-fixture.yml",
        "ca_workflow": ".github/workflows/climate-advisor-test.yml",
        "web_workflow": ".github/workflows/web-test.yml",
        "web_manifests": [
            "k8s/test/cc-test-web-deploy.yml",
            "k8s/test/cc-test-web.yml",
        ],
        "pdf_ocr_cron": "k8s/test/cc-test-process-pdf-ocr-jobs.yml",
        "mistral_secret": "MISTRAL_API_KEY_TEST",
    },
    "prod": {
        "service": "climate-advisor/k8s/service-prod.yml",
        "deployment": "climate-advisor/k8s/deployment-prod.yml",
        "fixture": "k8s/prod/cc-prod-ca-smoke-fixture.yml",
        "ca_workflow": ".github/workflows/climate-advisor-tag.yml",
        "web_workflow": ".github/workflows/web-tag.yml",
        "web_manifests": ["k8s/cc-web-deploy.yml", "k8s/cc-web.yml"],
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
    """Read a GitHub workflow file relative to the repository root."""
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def workflow_env_value(text: str, key: str) -> str:
    """Extract a kubectl-set env value from a workflow script block."""
    pattern = rf'(?<![A-Z0-9_])["\']?{re.escape(key)}=([^"\'\\\s]+)'
    match = re.search(pattern, text)
    assert match, f"{key} was not set in workflow"
    return match.group(1)


def env_flag_set(raw_value: str) -> set[str]:
    """Parse a comma-separated feature flag env var into names."""
    return {
        value.strip().strip("\"'")
        for value in raw_value.split(",")
        if value.strip().strip("\"'")
    }


def deployment_env_value(deployment: dict, key: str) -> str:
    """Return a container env var value from a Kubernetes Deployment."""
    containers = deployment["spec"]["template"]["spec"]["containers"]
    for entry in containers[0].get("env", []):
        if entry.get("name") == key:
            return entry.get("value", "")
    raise AssertionError(f"{key} was not set in deployment")


def normalized_secret_reference(value: str) -> str:
    """Normalize GitHub expression spacing for secret-reference comparisons."""
    return re.sub(r"\s+", "", value)


def url_port(url: str) -> int:
    """Return an explicit or default HTTP(S) port for a URL."""
    parsed = urlparse(url)
    if parsed.port is not None:
        return parsed.port
    if parsed.scheme == "https":
        return 443
    return 80


@pytest.mark.parametrize("environment, config", ENVIRONMENTS.items())
def test_web_ca_base_url_targets_matching_ca_service(
    environment: str,
    config: dict[str, str | list[str]],
) -> None:
    """Ensure web points at the CA Service for the same deploy environment."""
    service = load_yaml(str(config["service"]))
    web_workflow = workflow_text(str(config["web_workflow"]))
    ca_base_url = workflow_env_value(web_workflow, "CA_BASE_URL")

    parsed = urlparse(ca_base_url)
    expected_service_name = service["metadata"]["name"]
    assert parsed.scheme == "http"
    assert parsed.hostname == expected_service_name, (
        f"{environment} web CA_BASE_URL targets {parsed.hostname}, "
        f"expected {expected_service_name}"
    )


@pytest.mark.parametrize("environment, config", ENVIRONMENTS.items())
def test_ca_service_selector_and_ports_match_deployment(
    environment: str,
    config: dict[str, str | list[str]],
) -> None:
    """Ensure each CA Service selects the matching Deployment and container port."""
    service = load_yaml(str(config["service"]))
    deployment = load_yaml(str(config["deployment"]))
    web_workflow = workflow_text(str(config["web_workflow"]))

    service_selector = service["spec"]["selector"]
    pod_labels = deployment["spec"]["template"]["metadata"]["labels"]
    match_labels = deployment["spec"]["selector"]["matchLabels"]
    assert service_selector["app"] == pod_labels["app"] == match_labels["app"]

    service_port = service["spec"]["ports"][0]
    container_port = deployment["spec"]["template"]["spec"]["containers"][0]["ports"][
        0
    ]["containerPort"]
    assert service_port["targetPort"] == container_port
    assert service_port["port"] == url_port(
        workflow_env_value(web_workflow, "CA_BASE_URL")
    )


@pytest.mark.parametrize("environment, config", ENVIRONMENTS.items())
def test_ca_points_back_to_matching_cc_host(
    environment: str,
    config: dict[str, str | list[str]],
) -> None:
    """Ensure CA CC_BASE_URL matches the web HOST configured for that env."""
    ca_workflow = workflow_text(str(config["ca_workflow"]))
    web_workflow = workflow_text(str(config["web_workflow"]))

    cc_base_url = workflow_env_value(ca_workflow, "CC_BASE_URL")
    web_host = workflow_env_value(web_workflow, "HOST")
    assert cc_base_url.rstrip("/") == web_host.rstrip("/"), (
        f"{environment} CA CC_BASE_URL does not match web HOST"
    )


@pytest.mark.parametrize("environment, config", ENVIRONMENTS.items())
def test_cc_and_ca_use_same_service_secret_reference(
    environment: str,
    config: dict[str, str | list[str]],
) -> None:
    """Ensure web and CA reference the same GitHub service-key secret."""
    ca_workflow = workflow_text(str(config["ca_workflow"]))
    web_workflow = workflow_text(str(config["web_workflow"]))

    expected = "${{secrets.CC_SERVICE_API_KEY}}"
    assert (
        normalized_secret_reference(
            workflow_env_value(web_workflow, "CC_SERVICE_API_KEY")
        )
        == expected
    )
    assert (
        normalized_secret_reference(workflow_env_value(ca_workflow, "CC_API_KEY"))
        == expected
    )


@pytest.mark.parametrize("environment, config", ENVIRONMENTS.items())
def test_stationary_energy_flag_is_enabled_on_web_and_ca(
    environment: str,
    config: dict[str, str | list[str]],
) -> None:
    """Ensure CA serves Stationary Energy routes when web exposes the UI."""
    deployment = load_yaml(str(config["deployment"]))
    ca_workflow = workflow_text(str(config["ca_workflow"]))
    web_workflow = workflow_text(str(config["web_workflow"]))

    flag = "STATIONARY_ENERGY_AGENTIC"
    web_flags = env_flag_set(
        workflow_env_value(web_workflow, "NEXT_PUBLIC_FEATURE_FLAGS")
    )
    ca_workflow_flags = env_flag_set(
        workflow_env_value(ca_workflow, "CA_FEATURE_FLAGS")
    )
    ca_deployment_flags = env_flag_set(
        deployment_env_value(deployment, "CA_FEATURE_FLAGS")
    )

    assert (flag in ca_workflow_flags) == (flag in web_flags), (
        f"{environment} web and CA workflow disagree on {flag}"
    )
    assert (flag in ca_deployment_flags) == (flag in web_flags), (
        f"{environment} web and CA deployment manifest disagree on {flag}"
    )


@pytest.mark.parametrize("environment, config", ENVIRONMENTS.items())
def test_workflow_path_filters_include_validated_files(
    environment: str,
    config: dict[str, str | list[str]],
) -> None:
    """Ensure manifest and workflow changes trigger the workflows that own them."""
    ca_workflow_path = str(config["ca_workflow"])
    web_workflow_path = str(config["web_workflow"])
    ca_workflow = workflow_text(ca_workflow_path)
    web_workflow = workflow_text(web_workflow_path)

    for path in [
        str(config["service"]),
        str(config["deployment"]),
        str(config["fixture"]),
        SMOKE_SCRIPT_PATH,
        ca_workflow_path,
    ]:
        assert path in ca_workflow, f"{path} missing from {ca_workflow_path} paths"

    for path in [
        *config["web_manifests"],
        str(config["pdf_ocr_cron"]),
        str(config["fixture"]),
        SMOKE_SCRIPT_PATH,
        web_workflow_path,
    ]:
        assert path in web_workflow, f"{path} missing from {web_workflow_path} paths"


@pytest.mark.parametrize("environment, config", ENVIRONMENTS.items())
def test_pdf_ocr_cron_and_mistral_secret_are_deployed(
    environment: str,
    config: dict[str, str | list[str]],
) -> None:
    """Ensure each environment runs the authenticated non-overlapping OCR worker."""
    cron_path = str(config["pdf_ocr_cron"])
    cron = load_yaml(cron_path)
    workflow = workflow_text(str(config["web_workflow"]))
    assert cron["kind"] == "CronJob"
    assert cron["spec"]["schedule"] == "* * * * *"
    assert cron["spec"]["concurrencyPolicy"] == "Forbid"
    command = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0][
        "command"
    ][-1]
    assert "/api/v1/cron/process-pdf-ocr-jobs" in command
    assert "Authorization: Bearer $CC_CRON_JOB_API_KEY" in command
    assert f"kubectl apply -f {cron_path}" in workflow
    expected_secret = "${{secrets." + str(config["mistral_secret"]) + "}}"
    assert (
        normalized_secret_reference(workflow_env_value(workflow, "MISTRAL_API_KEY"))
        == expected_secret
    )


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


@pytest.mark.parametrize("environment, config", ENVIRONMENTS.items())
def test_smoke_fixture_job_is_wired_before_runtime_smoke(
    environment: str,
    config: dict[str, str | list[str]],
) -> None:
    """Ensure deploy workflows seed the deterministic fixture before smoke."""
    fixture_path = str(config["fixture"])
    fixture = load_yaml(fixture_path)
    web_workflow = workflow_text(str(config["web_workflow"]))
    ca_workflow = workflow_text(str(config["ca_workflow"]))

    container = fixture["spec"]["template"]["spec"]["containers"][0]
    assert container["command"] == ["npm", "run", "upsert-ca-smoke-fixture"]
    assert (
        "configMapRef"
        in fixture["spec"]["template"]["spec"]["containers"][0]["envFrom"][0]
    )

    expected_fixture_env = f"SMOKE_FIXTURE_MANIFEST={fixture_path}"
    expected_smoke_command = f"bash {SMOKE_SCRIPT_PATH}"
    for workflow_name, text in [
        (str(config["web_workflow"]), web_workflow),
        (str(config["ca_workflow"]), ca_workflow),
    ]:
        fixture_position = text.find(expected_fixture_env)
        smoke_position = text.find(expected_smoke_command)
        assert fixture_position != -1, f"{workflow_name} does not pass fixture manifest"
        assert smoke_position != -1, f"{workflow_name} does not run runtime smoke"
        assert fixture_position < smoke_position, (
            f"{workflow_name} runs smoke before selecting fixture in {environment}"
        )


def test_single_smoke_script_runs_fixture_job_and_runtime_smoke() -> None:
    """Ensure the single deploy-smoke script owns fixture setup and runtime checks."""
    script = (REPO_ROOT / SMOKE_SCRIPT_PATH).read_text(encoding="utf-8")

    assert "SMOKE_FIXTURE_MANIFEST" in script
    assert 'kubectl create -f "${SMOKE_FIXTURE_MANIFEST}"' in script
    assert "kubectl wait --for=condition=complete" in script
    assert 'kubectl logs "job/${JOB_NAME}"' in script
    assert "kubectl rollout status" in script
    assert 'kubectl exec "${CA_POD}"' in script
    assert "python -m scripts.smoke_cc_contract" in script
