"""Static deployment-contract tests for CNB credentials and migration ordering."""

from __future__ import annotations

from pathlib import Path

import yaml

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
K8S_ROOT = REPOSITORY_ROOT / "climate-advisor" / "k8s"
WORKFLOW_ROOT = REPOSITORY_ROOT / ".github" / "workflows"
DEV_CNB_DATABASE_URL = (
    "postgresql://cnb:cnb@"
    "dev-db-aurora.cluster-c5ipsfxjhb0m.us-east-1.rds.amazonaws.com/cnb"
)
PROD_CNB_DATABASE_URL = (
    "postgresql://cnb:cnb@"
    "oef-prod-db.cluster-ck89kopkx0x4.us-east-1.rds.amazonaws.com/cnb"
)

ENVIRONMENTS = {
    "dev": {
        "image": "ghcr.io/open-earth-foundation/citycatalyst-climate-advisor:dev",
        "configmap": "climate-advisor-db-configmap-dev",
        "database_url": DEV_CNB_DATABASE_URL,
        "workflow": "climate-advisor-develop.yml",
    },
    "test": {
        "image": "ghcr.io/open-earth-foundation/citycatalyst-climate-advisor:test",
        "configmap": "climate-advisor-db-configmap-test",
        "database_url": DEV_CNB_DATABASE_URL,
        "workflow": "climate-advisor-test.yml",
    },
    "prod": {
        "image": "ghcr.io/open-earth-foundation/citycatalyst-climate-advisor:stable",
        "configmap": "climate-advisor-db-configmap-prod",
        "database_url": PROD_CNB_DATABASE_URL,
        "workflow": "climate-advisor-tag.yml",
    },
}


def _load_yaml(path: Path) -> dict[str, object]:
    """Load one checked-in Kubernetes manifest."""
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def test_cnb_jobs_and_deployments_use_environment_configmaps() -> None:
    """Require each CNB consumer to use its environment database ConfigMap."""
    for environment, expected in ENVIRONMENTS.items():
        job = _load_yaml(K8S_ROOT / f"cnb-migrate-{environment}.yml")
        job_container = job["spec"]["template"]["spec"]["containers"][0]
        assert job_container["image"] == expected["image"]
        expected_env_from = [{"configMapRef": {"name": expected["configmap"]}}]
        assert job_container["envFrom"] == expected_env_from
        assert job_container["command"] == [
            "alembic",
            "-c",
            "cnb-alembic.ini",
            "upgrade",
            "head",
        ]

        deployment = _load_yaml(K8S_ROOT / f"deployment-{environment}.yml")
        deployment_container = deployment["spec"]["template"]["spec"]["containers"][0]
        assert deployment_container["envFrom"] == expected_env_from


def test_environment_configmaps_define_cnb_database_url() -> None:
    """Keep each environment's explicit CNB connection URL in its ConfigMap."""
    for environment, expected in ENVIRONMENTS.items():
        configmap = _load_yaml(K8S_ROOT / f"db-configmap-{environment}.yml")
        assert configmap["metadata"]["name"] == expected["configmap"]
        assert configmap["data"]["CNB_DATABASE_URL"] == expected["database_url"]


def test_workflows_wait_for_cnb_migration_before_rollout() -> None:
    """Require the new CNB migration to succeed before application rollout."""
    for environment, expected in ENVIRONMENTS.items():
        workflow = (WORKFLOW_ROOT / expected["workflow"]).read_text(encoding="utf-8")
        configmap_apply = (
            f"kubectl apply -f climate-advisor/k8s/db-configmap-{environment}.yml"
        )
        ca_job_create = (
            f"kubectl create -f climate-advisor/k8s/migrate-{environment}.yml"
        )
        cnb_job_create = (
            f"kubectl create -f climate-advisor/k8s/cnb-migrate-{environment}.yml"
        )
        cnb_job_wait = "kubectl wait"
        deployment_apply = (
            f"kubectl apply -f climate-advisor/k8s/deployment-{environment}.yml"
        )

        assert "secrets.CNB_DATABASE_URL" not in workflow
        assert "climate-advisor-cnb-db-secret" not in workflow
        assert configmap_apply in workflow
        assert "run-climate-advisor-migrations.sh" not in workflow
        assert 'cnb_migration_job="$(' in workflow
        assert "--for=condition=complete" in workflow
        assert "--timeout=300s" in workflow
        assert '"${cnb_migration_job}"' in workflow
        assert workflow.index(configmap_apply) < workflow.index(ca_job_create)
        assert workflow.index(ca_job_create) < workflow.index(cnb_job_create)
        assert workflow.index(cnb_job_create) < workflow.index(cnb_job_wait)
        assert workflow.index(cnb_job_wait) < workflow.index(deployment_apply)
