"""Static deployment-contract tests for CNB credentials and migration ordering."""

from __future__ import annotations

from pathlib import Path

import yaml

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
K8S_ROOT = REPOSITORY_ROOT / "climate-advisor" / "k8s"
WORKFLOW_ROOT = REPOSITORY_ROOT / ".github" / "workflows"

ENVIRONMENTS = {
    "dev": {
        "image": "ghcr.io/open-earth-foundation/citycatalyst-climate-advisor:dev",
        "secret": "climate-advisor-cnb-db-secret-dev",
        "workflow": "climate-advisor-develop.yml",
        "github_secret": "CNB_DATABASE_URL_DEV",
    },
    "test": {
        "image": "ghcr.io/open-earth-foundation/citycatalyst-climate-advisor:test",
        "secret": "climate-advisor-cnb-db-secret-test",
        "workflow": "climate-advisor-test.yml",
        "github_secret": "CNB_DATABASE_URL_DEV",
    },
    "prod": {
        "image": "ghcr.io/open-earth-foundation/citycatalyst-climate-advisor:stable",
        "secret": "climate-advisor-cnb-db-secret-prod",
        "workflow": "climate-advisor-tag.yml",
        "github_secret": "CNB_DATABASE_URL_PROD",
    },
}


def _load_yaml(path: Path) -> dict[str, object]:
    """Load one checked-in Kubernetes manifest."""
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def test_cnb_jobs_and_deployments_use_only_environment_secrets() -> None:
    """Require the CNB URL through secretRef in jobs and service deployments."""
    for environment, expected in ENVIRONMENTS.items():
        job = _load_yaml(K8S_ROOT / f"cnb-migrate-{environment}.yml")
        job_container = job["spec"]["template"]["spec"]["containers"][0]
        assert job_container["image"] == expected["image"]
        assert job_container["envFrom"] == [{"secretRef": {"name": expected["secret"]}}]
        assert job_container["command"] == [
            "alembic",
            "-c",
            "cnb-alembic.ini",
            "upgrade",
            "head",
        ]

        deployment = _load_yaml(K8S_ROOT / f"deployment-{environment}.yml")
        deployment_container = deployment["spec"]["template"]["spec"]["containers"][0]
        assert {"secretRef": {"name": expected["secret"]}} in deployment_container[
            "envFrom"
        ]


def test_configmaps_and_manifests_contain_no_cnb_values() -> None:
    """Keep CNB URLs and credential material out of checked-in manifests."""
    for path in K8S_ROOT.glob("db-configmap-*.yml"):
        content = path.read_text(encoding="utf-8")
        assert "CNB_DATABASE_URL" not in content
        assert "cnb-db-secret" not in content

    cnb_paths = [
        *K8S_ROOT.glob("cnb-migrate-*.yml"),
        *K8S_ROOT.glob("deployment-*.yml"),
    ]
    for path in cnb_paths:
        content = path.read_text(encoding="utf-8")
        assert "postgresql://" not in content
        assert "DB_PASSWORD" not in content
        assert "stringData:" not in content


def test_workflows_launch_both_migration_jobs_before_rollout() -> None:
    """Keep CNB deployment wiring consistent with the existing CA Job flow."""
    secret_reconcile = "--dry-run=client --output yaml | kubectl apply -f - -n default"

    for environment, expected in ENVIRONMENTS.items():
        workflow = (WORKFLOW_ROOT / expected["workflow"]).read_text(encoding="utf-8")
        secret_create = f"kubectl create secret generic {expected['secret']}"
        ca_job_create = (
            f"kubectl create -f climate-advisor/k8s/migrate-{environment}.yml"
        )
        cnb_job_create = (
            f"kubectl create -f climate-advisor/k8s/cnb-migrate-{environment}.yml"
        )
        deployment_apply = (
            f"kubectl apply -f climate-advisor/k8s/deployment-{environment}.yml"
        )

        assert f"secrets.{expected['github_secret']}" in workflow
        assert "${CNB_DATABASE_URL:?CNB_DATABASE_URL GitHub secret is required}" in workflow
        assert secret_create in workflow
        assert '--from-literal=CNB_DATABASE_URL="${CNB_DATABASE_URL}"' in workflow
        assert secret_reconcile in workflow
        assert "run-climate-advisor-migrations.sh" not in workflow
        assert workflow.index(secret_create) < workflow.index(ca_job_create)
        assert workflow.index(ca_job_create) < workflow.index(cnb_job_create)
        assert workflow.index(cnb_job_create) < workflow.index(deployment_apply)
