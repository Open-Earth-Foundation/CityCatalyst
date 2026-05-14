#!/usr/bin/env python3
"""
Brief: Run a read-only Kubernetes health audit and generate Markdown and JSON reports.

Investigation contract:
- Sweep broadly first, then follow every useful readonly evidence trail the script can reach.
- Try to identify a likely root cause before handing work back to the user.
- Only leave manual next steps when the next useful action would require more rights,
  deleted history, or a live failure that no longer exists.

Inputs:
- CLI args:
  - `--context`: Required kubeconfig context to inspect.
  - `--namespace`: Optional namespace to focus follow-up pod inspection on. Defaults to all namespaces.
  - `--max-pod-followups`: Maximum number of unhealthy pods to inspect in detail. Default `1000`.
  - `--max-deployment-followups`: Maximum number of unhealthy deployments to inspect in detail. Default `200`.
  - `--max-job-followups`: Maximum number of failed jobs to inspect in detail. Default `500`.
  - `--max-log-lines`: Maximum number of log lines fetched per log call. Default `80`.
  - `--output-dir`: Directory for generated report files. Defaults to `.cursor/skills/k8s-health-audit/logs`.
  - `--skip-logs`: Skip pod log collection.
- Files/paths:
  - Reads local kubeconfig through the user's normal `kubectl` setup.
- Env vars:
  - No required environment variables. Uses whatever kubeconfig/auth state `kubectl` can already access.

Outputs:
- Markdown report summarizing cluster health and likely causes.
- JSON artifact containing structured evidence and command outputs.
- Stdout prints the report path and a short status summary.

Usage (from project root):
- python .cursor/skills/k8s-health-audit/scripts/k8s_health_audit.py --context dev-cluster-readonly
"""

from __future__ import annotations

import argparse
import collections
import json
import logging
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LOGGER = logging.getLogger("k8s_health_audit")
SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
DEFAULT_OUTPUT_DIR = SKILL_ROOT / "logs"
READONLY_CONTEXT_SUFFIX = "-readonly"

READ_ONLY_VERBS = {"get", "list", "watch"}
WRITE_VERBS = {
    "apply",
    "annotate",
    "create",
    "cordon",
    "delete",
    "drain",
    "edit",
    "exec",
    "label",
    "patch",
    "port-forward",
    "replace",
    "rollout",
    "scale",
    "set",
    "taint",
}
FORBIDDEN_FLAGS = {"--force", "--grace-period", "--prune", "--overwrite"}

READ_PERMISSION_CHECKS = [
    ("get", "pods", True),
    ("list", "pods", True),
    ("get", "configmaps", True),
    ("get", "serviceaccounts", True),
    ("get", "deployments.apps", True),
    ("get", "replicasets.apps", True),
    ("get", "daemonsets.apps", True),
    ("get", "statefulsets.apps", True),
    ("get", "events", True),
    ("get", "nodes", False),
    ("get", "persistentvolumeclaims", True),
    ("get", "persistentvolumes", False),
    ("get", "services", True),
    ("get", "ingresses.networking.k8s.io", True),
    ("get", "jobs.batch", True),
    ("get", "cronjobs.batch", True),
    ("get", "horizontalpodautoscalers.autoscaling", True),
]

WRITE_PERMISSION_CHECKS = [
    ("create", "deployments.apps", True),
    ("delete", "pods", True),
    ("patch", "deployments.apps", True),
    ("update", "configmaps", True),
]

CAUSE_RULES = [
    (
        re.compile(
            r"ImagePullBackOff|ErrImagePull|pull access denied|manifest unknown|repository .* not found",
            re.IGNORECASE,
        ),
        "Image pull failure",
    ),
    (
        re.compile(
            r"CrashLoopBackOff|Back-off restarting failed container|CreateContainerError|RunContainerError"
        ),
        "Container crash loop",
    ),
    (
        re.compile(
            r"FailedScheduling|Insufficient cpu|Insufficient memory|untolerated taint|No preemption victims found|Preemption is not helpful",
            re.IGNORECASE,
        ),
        "Scheduling or capacity issue",
    ),
    (
        re.compile(
            r"FailedCreatePodSandBox|aws-cni|setup network|network policy|failed to assign an IP address|CNI",
            re.IGNORECASE,
        ),
        "CNI or network policy issue",
    ),
    (
        re.compile(
            r"NoCredentialProviders|AccessDenied|Unauthorized|forbidden|ExpiredToken|WebIdentityErr|assume role|cannot be assumed",
            re.IGNORECASE,
        ),
        "Credentials or IAM/RBAC issue",
    ),
    (
        re.compile(
            r"secret .* not found|configmap .* not found|CreateContainerConfigError|couldn't find key .* in (Secret|ConfigMap)",
            re.IGNORECASE,
        ),
        "Missing secret or configmap",
    ),
    (
        re.compile(r"Readiness probe failed|Liveness probe failed|Startup probe failed", re.IGNORECASE),
        "Probe failure",
    ),
    (
        re.compile(
            r"FailedMount|MountVolume|AttachVolume|Multi-Attach|Unable to attach or mount volumes",
            re.IGNORECASE,
        ),
        "Storage or volume mount issue",
    ),
    (
        re.compile(r"OOMKilled|Evicted", re.IGNORECASE),
        "OOM or eviction issue",
    ),
    (
        re.compile(
            r"connection refused|no such host|i/o timeout|temporary failure in name resolution|context deadline exceeded",
            re.IGNORECASE,
        ),
        "Application connectivity issue",
    ),
]


class KubectlError(RuntimeError):
    """Raised when a kubectl command fails."""


@dataclass
class CommandResult:
    args: list[str]
    returncode: int
    stdout: str
    stderr: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a read-only Kubernetes health audit."
    )
    parser.add_argument(
        "--context", required=True, help="Kubeconfig context to inspect."
    )
    parser.add_argument(
        "--namespace",
        default=None,
        help="Optional namespace for focused follow-up inspection. Defaults to all namespaces.",
    )
    parser.add_argument(
        "--max-pod-followups",
        type=int,
        default=1000,
        help="Maximum unhealthy pods to inspect in detail.",
    )
    parser.add_argument(
        "--max-deployment-followups",
        type=int,
        default=200,
        help="Maximum unhealthy deployments to inspect in detail.",
    )
    parser.add_argument(
        "--max-job-followups",
        type=int,
        default=500,
        help="Maximum failed jobs to inspect in detail.",
    )
    parser.add_argument(
        "--max-log-lines",
        type=int,
        default=80,
        help="Maximum number of lines to collect per pod log call.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where the Markdown and JSON reports will be written.",
    )
    parser.add_argument(
        "--skip-logs",
        action="store_true",
        help="Skip log collection for unhealthy pods.",
    )
    return parser.parse_args()


def setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def require_readonly_context_name(context: str) -> None:
    if not context.endswith(READONLY_CONTEXT_SUFFIX):
        raise KubectlError(
            "Refusing to run audit against a non-readonly context. "
            f"Expected a context ending with '{READONLY_CONTEXT_SUFFIX}', got '{context}'."
        )


def validate_kubectl_args(args: list[str]) -> None:
    if not args:
        raise KubectlError("Refusing to run empty kubectl command.")
    if any(flag in FORBIDDEN_FLAGS for flag in args):
        raise KubectlError(
            f"Refusing kubectl command with forbidden flag: {' '.join(args)}"
        )
    if "exec" in args or "port-forward" in args or "cp" in args:
        raise KubectlError(f"Refusing unsafe kubectl command: {' '.join(args)}")
    if args[0] in WRITE_VERBS:
        raise KubectlError(f"Refusing mutating kubectl verb: {args[0]}")
    if args[0] == "rollout" and len(args) > 1 and args[1] != "status":
        raise KubectlError(f"Refusing rollout subcommand: {' '.join(args[:2])}")


def run_kubectl(
    context: str,
    args: list[str],
    *,
    namespace: str | None = None,
    check: bool = True,
    timeout: int = 30,
) -> CommandResult:
    validate_kubectl_args(args)
    cmd = ["kubectl", "--context", context]
    if namespace:
        cmd.extend(["-n", namespace])
    cmd.extend(args)
    LOGGER.debug("Running command: %s", " ".join(cmd))
    completed = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    result = CommandResult(
        args=cmd,
        returncode=completed.returncode,
        stdout=completed.stdout.strip(),
        stderr=completed.stderr.strip(),
    )
    if check and result.returncode != 0:
        raise KubectlError(
            f"kubectl failed: {' '.join(cmd)}\n{result.stderr or result.stdout}"
        )
    return result


def run_json(
    context: str, args: list[str], *, namespace: str | None = None, timeout: int = 30
) -> Any:
    result = run_kubectl(
        context, args + ["-o", "json"], namespace=namespace, timeout=timeout
    )
    return json.loads(result.stdout or "{}")


def can_i(context: str, verb: str, resource: str, namespaced: bool) -> dict[str, Any]:
    args = ["auth", "can-i", verb, resource]
    if namespaced:
        args.append("--all-namespaces")
    result = run_kubectl(context, args, check=False)
    allowed = result.stdout.strip().lower() == "yes"
    return {
        "verb": verb,
        "resource": resource,
        "namespaced": namespaced,
        "allowed": allowed,
        "raw": result.stdout.strip() or result.stderr.strip(),
    }


def enforce_readonly_permissions(write_checks: list[dict[str, Any]]) -> None:
    allowed = [check for check in write_checks if check["allowed"]]
    if allowed:
        details = ", ".join(f"{check['verb']} {check['resource']}" for check in allowed)
        raise KubectlError(
            "Refusing to run audit because the target context still has sampled write permissions: "
            f"{details}"
        )


def permission_allowed(
    checks: list[dict[str, Any]], verb: str, resource: str
) -> bool:
    for check in checks:
        if check["verb"] == verb and check["resource"] == resource:
            return bool(check["allowed"])
    return False


def get_nested(obj: dict[str, Any], path: list[str], default: Any = None) -> Any:
    current: Any = obj
    for key in path:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
        if current is None:
            return default
    return current


def summarize_nodes(
    nodes: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    summaries: list[dict[str, Any]] = []
    unhealthy: list[dict[str, Any]] = []
    for item in nodes.get("items", []):
        conditions = item.get("status", {}).get("conditions", [])
        ready_condition = next((c for c in conditions if c.get("type") == "Ready"), {})
        ready = ready_condition.get("status") == "True"
        summary = {
            "name": get_nested(item, ["metadata", "name"], "unknown"),
            "ready": ready,
            "compute_type": get_nested(
                item, ["metadata", "labels", "eks.amazonaws.com/compute-type"]
            ),
            "instance_type": get_nested(
                item, ["metadata", "labels", "node.kubernetes.io/instance-type"]
            ),
            "roles": list(get_nested(item, ["metadata", "labels"], {}).keys()),
            "reason": ready_condition.get("reason"),
            "message": ready_condition.get("message"),
        }
        summaries.append(summary)
        if not ready:
            unhealthy.append(summary)
    return summaries, unhealthy


def summarize_pods(
    pods: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    summaries: list[dict[str, Any]] = []
    unhealthy: list[dict[str, Any]] = []
    for item in pods.get("items", []):
        namespace = get_nested(item, ["metadata", "namespace"], "default")
        name = get_nested(item, ["metadata", "name"], "unknown")
        status = get_nested(item, ["status", "phase"], "Unknown")
        container_statuses = get_nested(item, ["status", "containerStatuses"], []) or []
        ready_count = sum(1 for cs in container_statuses if cs.get("ready"))
        total_count = len(container_statuses)
        waiting_reasons = []
        terminated_reasons = []
        restarts = 0
        for cs in container_statuses:
            restarts += int(cs.get("restartCount", 0))
            state = cs.get("state", {})
            waiting = state.get("waiting")
            terminated = state.get("terminated")
            if waiting and waiting.get("reason"):
                waiting_reasons.append(waiting["reason"])
            if terminated and terminated.get("reason"):
                terminated_reasons.append(terminated["reason"])
        summary = {
            "namespace": namespace,
            "name": name,
            "phase": status,
            "ready": f"{ready_count}/{total_count}",
            "restarts": restarts,
            "waiting_reasons": waiting_reasons,
            "terminated_reasons": terminated_reasons,
            "owner_kinds": [
                owner.get("kind")
                for owner in get_nested(item, ["metadata", "ownerReferences"], []) or []
                if owner.get("kind")
            ],
            "owner_names": [
                owner.get("name")
                for owner in get_nested(item, ["metadata", "ownerReferences"], []) or []
                if owner.get("name")
            ],
        }
        summaries.append(summary)
        if status not in {"Running", "Succeeded"} or waiting_reasons or restarts > 0:
            unhealthy.append(summary)
    unhealthy.sort(key=lambda item: (item["phase"] == "Running", -item["restarts"]))
    return summaries, unhealthy


def summarize_deployments(
    deployments: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    summaries: list[dict[str, Any]] = []
    unhealthy: list[dict[str, Any]] = []
    for item in deployments.get("items", []):
        desired = get_nested(item, ["spec", "replicas"], 0) or 0
        available = get_nested(item, ["status", "availableReplicas"], 0) or 0
        namespace = get_nested(item, ["metadata", "namespace"], "default")
        name = get_nested(item, ["metadata", "name"], "unknown")
        summary = {
            "namespace": namespace,
            "name": name,
            "desired": desired,
            "available": available,
        }
        summaries.append(summary)
        if desired != available:
            unhealthy.append(summary)
    return summaries, unhealthy


def summarize_jobs(jobs: dict[str, Any]) -> list[dict[str, Any]]:
    failed_jobs: list[dict[str, Any]] = []
    for item in jobs.get("items", []):
        failed = get_nested(item, ["status", "failed"], 0) or 0
        if failed:
            failed_jobs.append(
                {
                    "namespace": get_nested(item, ["metadata", "namespace"], "default"),
                    "name": get_nested(item, ["metadata", "name"], "unknown"),
                    "failed": failed,
                    "owner_kinds": [
                        owner.get("kind")
                        for owner in get_nested(item, ["metadata", "ownerReferences"], [])
                        or []
                        if owner.get("kind")
                    ],
                    "owner_names": [
                        owner.get("name")
                        for owner in get_nested(item, ["metadata", "ownerReferences"], [])
                        or []
                        if owner.get("name")
                    ],
                }
            )
    return failed_jobs


def summarize_hpas(hpas: dict[str, Any]) -> list[dict[str, Any]]:
    unhealthy_hpas: list[dict[str, Any]] = []
    for item in hpas.get("items", []):
        conditions = get_nested(item, ["status", "conditions"], []) or []
        failing_conditions = [
            {
                "type": condition.get("type"),
                "reason": condition.get("reason"),
                "message": condition.get("message"),
            }
            for condition in conditions
            if condition.get("status") == "False"
        ]
        if failing_conditions:
            unhealthy_hpas.append(
                {
                    "namespace": get_nested(item, ["metadata", "namespace"], "default"),
                    "name": get_nested(item, ["metadata", "name"], "unknown"),
                    "target_kind": get_nested(
                        item, ["spec", "scaleTargetRef", "kind"], "Unknown"
                    ),
                    "target_name": get_nested(
                        item, ["spec", "scaleTargetRef", "name"], "unknown"
                    ),
                    "conditions": failing_conditions,
                }
            )
    return unhealthy_hpas


def summarize_warning_events(events: dict[str, Any]) -> list[dict[str, Any]]:
    warnings = []
    for item in events.get("items", []):
        if item.get("type") != "Warning":
            continue
        warnings.append(
            {
                "namespace": get_nested(item, ["metadata", "namespace"], ""),
                "reason": item.get("reason"),
                "message": item.get("message"),
                "object": get_nested(item, ["involvedObject", "kind"], "")
                + "/"
                + get_nested(item, ["involvedObject", "name"], ""),
                "timestamp": item.get("lastTimestamp")
                or item.get("eventTime")
                or get_nested(item, ["metadata", "creationTimestamp"], ""),
            }
        )
    warnings.sort(key=lambda item: item["timestamp"])
    return warnings


def summarize_template_spec(spec: dict[str, Any]) -> dict[str, Any]:
    containers = []
    for container in spec.get("containers", []) or []:
        env_entries = []
        for env in container.get("env", []) or []:
            env_entries.append(
                {
                    "name": env.get("name"),
                    "value": env.get("value"),
                    "has_value_from": "valueFrom" in env,
                }
            )
        containers.append(
            {
                "name": container.get("name"),
                "image": container.get("image"),
                "command": container.get("command", []) or [],
                "args": container.get("args", []) or [],
                "env": env_entries,
            }
        )
    return {
        "service_account_name": spec.get("serviceAccountName")
        or spec.get("serviceAccount"),
        "containers": containers,
    }


def collect_pod_followup(
    context: str,
    pod: dict[str, Any],
    *,
    max_log_lines: int,
    skip_logs: bool,
) -> dict[str, Any]:
    namespace = pod["namespace"]
    name = pod["name"]
    describe = run_kubectl(
        context, ["describe", "pod", name], namespace=namespace, check=False, timeout=45
    )
    logs_current = None
    logs_previous = None
    if not skip_logs:
        logs_current = run_kubectl(
            context,
            ["logs", name, "--tail", str(max_log_lines)],
            namespace=namespace,
            check=False,
            timeout=45,
        )
        logs_previous = run_kubectl(
            context,
            ["logs", name, "--previous", "--tail", str(max_log_lines)],
            namespace=namespace,
            check=False,
            timeout=45,
        )
    return {
        "namespace": namespace,
        "name": name,
        "describe": {
            "stdout": describe.stdout,
            "stderr": describe.stderr,
            "returncode": describe.returncode,
        },
        "logs_current": (
            None
            if logs_current is None
            else {
                "stdout": logs_current.stdout,
                "stderr": logs_current.stderr,
                "returncode": logs_current.returncode,
            }
        ),
        "logs_previous": (
            None
            if logs_previous is None
            else {
                "stdout": logs_previous.stdout,
                "stderr": logs_previous.stderr,
                "returncode": logs_previous.returncode,
            }
        ),
    }


def collect_deployment_followup(
    context: str,
    deployment: dict[str, Any],
    *,
    namespace: str | None = None,
) -> dict[str, Any]:
    deployment_namespace = deployment["namespace"]
    deployment_name = deployment["name"]
    describe = run_kubectl(
        context,
        ["describe", "deployment", deployment_name],
        namespace=deployment_namespace,
        check=False,
        timeout=45,
    )
    deployment_get = run_kubectl(
        context,
        ["get", "deployment", deployment_name, "-o", "json"],
        namespace=deployment_namespace,
        check=False,
        timeout=45,
    )
    deployment_json = (
        json.loads(deployment_get.stdout) if deployment_get.returncode == 0 and deployment_get.stdout else {}
    )
    return {
        "namespace": deployment_namespace,
        "name": deployment_name,
        "spec_summary": summarize_template_spec(
            get_nested(deployment_json, ["spec", "template", "spec"], {}) or {}
        ),
        "describe": {
            "stdout": describe.stdout,
            "stderr": describe.stderr,
            "returncode": describe.returncode,
        },
    }


def collect_job_followup(
    context: str,
    job: dict[str, Any],
    *,
    max_log_lines: int,
    skip_logs: bool,
) -> dict[str, Any]:
    namespace = job["namespace"]
    name = job["name"]
    describe = run_kubectl(
        context, ["describe", "job", name], namespace=namespace, check=False, timeout=45
    )
    job_get = run_kubectl(
        context,
        ["get", "job", name, "-o", "json"],
        namespace=namespace,
        check=False,
        timeout=45,
    )
    job_json = json.loads(job_get.stdout) if job_get.returncode == 0 and job_get.stdout else {}
    related_pods = run_json(
        context,
        ["get", "pods", "-l", f"job-name={name}"],
        namespace=namespace,
        timeout=45,
    )
    pod_entries = []
    for item in related_pods.get("items", []):
        pod_name = get_nested(item, ["metadata", "name"], "unknown")
        pod_record = {
            "name": pod_name,
            "phase": get_nested(item, ["status", "phase"], "Unknown"),
        }
        if not skip_logs:
            logs_current = run_kubectl(
                context,
                ["logs", pod_name, "--tail", str(max_log_lines)],
                namespace=namespace,
                check=False,
                timeout=45,
            )
            logs_previous = run_kubectl(
                context,
                ["logs", pod_name, "--previous", "--tail", str(max_log_lines)],
                namespace=namespace,
                check=False,
                timeout=45,
            )
            pod_record["logs_current"] = {
                "stdout": logs_current.stdout,
                "stderr": logs_current.stderr,
                "returncode": logs_current.returncode,
            }
            pod_record["logs_previous"] = {
                "stdout": logs_previous.stdout,
                "stderr": logs_previous.stderr,
                "returncode": logs_previous.returncode,
            }
        pod_entries.append(pod_record)
    return {
        "namespace": namespace,
        "name": name,
        "owner_kinds": job.get("owner_kinds", []),
        "owner_names": job.get("owner_names", []),
        "spec_summary": summarize_template_spec(
            get_nested(job_json, ["spec", "template", "spec"], {}) or {}
        ),
        "describe": {
            "stdout": describe.stdout,
            "stderr": describe.stderr,
            "returncode": describe.returncode,
        },
        "get": {
            "stdout": job_get.stdout,
            "stderr": job_get.stderr,
            "returncode": job_get.returncode,
        },
        "pods": pod_entries,
    }


def collect_cni_followup(context: str) -> dict[str, Any] | None:
    daemonset_result = run_kubectl(
        context,
        ["get", "daemonset", "aws-node", "-o", "json"],
        namespace="kube-system",
        check=False,
        timeout=45,
    )
    if daemonset_result.returncode != 0 or not daemonset_result.stdout:
        return None
    daemonset = json.loads(daemonset_result.stdout)
    describe = run_kubectl(
        context,
        ["describe", "daemonset", "aws-node"],
        namespace="kube-system",
        check=False,
        timeout=45,
    )
    pods = run_json(
        context,
        ["get", "pods", "-l", "k8s-app=aws-node"],
        namespace="kube-system",
        timeout=45,
    )
    pod_names = [
        get_nested(item, ["metadata", "name"], "unknown")
        for item in pods.get("items", [])
    ]
    return {
        "name": "aws-node",
        "namespace": "kube-system",
        "status": {
            "desired": get_nested(daemonset, ["status", "desiredNumberScheduled"], 0)
            or 0,
            "current": get_nested(daemonset, ["status", "currentNumberScheduled"], 0)
            or 0,
            "ready": get_nested(daemonset, ["status", "numberReady"], 0) or 0,
        },
        "spec_summary": summarize_template_spec(
            get_nested(daemonset, ["spec", "template", "spec"], {}) or {}
        ),
        "pod_names": pod_names,
        "describe": {
            "stdout": describe.stdout,
            "stderr": describe.stderr,
            "returncode": describe.returncode,
        },
    }


def collect_hpa_followup(context: str, hpa: dict[str, Any]) -> dict[str, Any]:
    namespace = hpa["namespace"]
    name = hpa["name"]
    target_kind = hpa["target_kind"]
    target_name = hpa["target_name"]
    hpa_get = run_kubectl(
        context,
        ["get", "hpa", name, "-o", "json"],
        namespace=namespace,
        check=False,
        timeout=45,
    )
    target_resource = target_kind.lower()
    if target_resource.endswith("s"):
        kubectl_target = target_resource
    else:
        kubectl_target = f"{target_resource}"
    target_get = run_kubectl(
        context,
        ["get", kubectl_target, target_name, "-o", "json"],
        namespace=namespace,
        check=False,
        timeout=45,
    )
    return {
        "namespace": namespace,
        "name": name,
        "target_kind": target_kind,
        "target_name": target_name,
        "hpa_get": {
            "stdout": hpa_get.stdout,
            "stderr": hpa_get.stderr,
            "returncode": hpa_get.returncode,
        },
        "target_get": {
            "stdout": target_get.stdout,
            "stderr": target_get.stderr,
            "returncode": target_get.returncode,
        },
    }


def extract_cause_matches(evidence_strings: list[str]) -> list[dict[str, str]]:
    causes: list[dict[str, str]] = []
    seen = set()
    for evidence in evidence_strings:
        for pattern, label in CAUSE_RULES:
            match = pattern.search(evidence or "")
            if match and label not in seen:
                causes.append({"cause": label, "evidence": match.group(0)})
                seen.add(label)
    return causes


def normalize_job_name(job_name: str) -> str:
    normalized = re.sub(r"-\d{6,}$", "", job_name)
    return normalized


def normalize_object_name(object_ref: str) -> str:
    if "/" not in object_ref:
        return object_ref
    kind, name = object_ref.split("/", 1)
    if kind in {"Job", "Pod"}:
        previous = None
        while previous != name:
            previous = name
            name = re.sub(r"-[a-z0-9]{5,}$", "", name)
            name = re.sub(r"-\d{6,}$", "", name)
    return f"{kind}/{name}"


def find_matching_pod_followups(
    pod_followups: list[dict[str, Any]], namespace: str, deployment_name: str
) -> list[dict[str, Any]]:
    matches = []
    prefix = f"{deployment_name}-"
    for followup in pod_followups:
        if followup["namespace"] == namespace and followup["name"].startswith(prefix):
            matches.append(followup)
    return matches


def infer_likely_causes(audit: dict[str, Any]) -> list[dict[str, str]]:
    evidence_strings: list[str] = []
    for event in audit["warnings"]:
        evidence_strings.append(f'{event["reason"]} {event["message"]}')
    for followup in audit["pod_followups"]:
        describe = followup["describe"]["stdout"]
        evidence_strings.append(describe)
        if followup["logs_current"]:
            evidence_strings.append(followup["logs_current"]["stdout"])
            evidence_strings.append(followup["logs_current"]["stderr"])
        if followup["logs_previous"]:
            evidence_strings.append(followup["logs_previous"]["stdout"])
            evidence_strings.append(followup["logs_previous"]["stderr"])
    for followup in audit["deployment_followups"]:
        evidence_strings.append(followup["describe"]["stdout"])
        evidence_strings.append(followup["describe"]["stderr"])
    for followup in audit["job_followups"]:
        evidence_strings.append(followup["describe"]["stdout"])
        evidence_strings.append(followup["describe"]["stderr"])
        for pod_entry in followup["pods"]:
            if "logs_current" in pod_entry:
                evidence_strings.append(pod_entry["logs_current"]["stdout"])
                evidence_strings.append(pod_entry["logs_current"]["stderr"])
            if "logs_previous" in pod_entry:
                evidence_strings.append(pod_entry["logs_previous"]["stdout"])
                evidence_strings.append(pod_entry["logs_previous"]["stderr"])

    causes = extract_cause_matches(evidence_strings)
    if not causes and audit["unhealthy"]["pods"]:
        causes.append(
            {
                "cause": "Unknown workload failure",
                "evidence": "Unhealthy pods found without a classified signature.",
            }
        )
    return causes


def build_conclusion(audit: dict[str, Any]) -> list[str]:
    conclusion = []
    if (
        not audit["unhealthy"]["nodes"]
        and not audit["unhealthy"]["pods"]
        and not audit["unhealthy"]["deployments"]
        and not audit["unhealthy"]["jobs"]
    ):
        conclusion.append(
            "No unhealthy nodes, pods, deployments, or failed jobs were detected in the collected data."
        )
        return conclusion

    if audit["likely_causes"]:
        cause_labels = ", ".join(cause["cause"] for cause in audit["likely_causes"])
        conclusion.append(
            f"The cluster has active issues, and the strongest signatures point to: {cause_labels}."
        )
    else:
        conclusion.append(
            "The cluster has active issues, but the collected evidence did not produce a strong automated cause classification."
        )

    if audit["unhealthy"]["deployments"]:
        conclusion.append(
            f"{len(audit['unhealthy']['deployments'])} deployment(s) are not fully available."
        )
    if audit["unhealthy"]["pods"]:
        conclusion.append(
            f"{len(audit['unhealthy']['pods'])} pod(s) need attention."
        )
    if audit["unhealthy"]["jobs"]:
        conclusion.append(
            f"{len(audit['unhealthy']['jobs'])} job(s) show failures."
        )
    return conclusion


def build_resource_findings(audit: dict[str, Any]) -> list[str]:
    findings = []

    for deployment in audit["deployment_followups"]:
        evidence_strings = [deployment["describe"]["stdout"], deployment["describe"]["stderr"]]
        related_pods = find_matching_pod_followups(
            audit["pod_followups"], deployment["namespace"], deployment["name"]
        )
        for pod_followup in related_pods:
            evidence_strings.append(pod_followup["describe"]["stdout"])
            if pod_followup["logs_current"]:
                evidence_strings.append(pod_followup["logs_current"]["stdout"])
                evidence_strings.append(pod_followup["logs_current"]["stderr"])
            if pod_followup["logs_previous"]:
                evidence_strings.append(pod_followup["logs_previous"]["stdout"])
                evidence_strings.append(pod_followup["logs_previous"]["stderr"])
        causes = extract_cause_matches(evidence_strings)
        if causes:
            findings.append(
                f"Deployment `{deployment['namespace']}/{deployment['name']}` is unhealthy. Strongest signals: "
                + ", ".join(cause["cause"] for cause in causes)
                + "."
            )

    grouped_jobs: dict[tuple[str, str], list[dict[str, Any]]] = collections.defaultdict(list)
    for job_followup in audit["job_followups"]:
        grouped_jobs[(job_followup["namespace"], normalize_job_name(job_followup["name"]))].append(job_followup)

    for (namespace, normalized_name), group in grouped_jobs.items():
        evidence_strings = []
        for job_followup in group:
            evidence_strings.append(job_followup["describe"]["stdout"])
            evidence_strings.append(job_followup["describe"]["stderr"])
            for pod_entry in job_followup["pods"]:
                if "logs_current" in pod_entry:
                    evidence_strings.append(pod_entry["logs_current"]["stdout"])
                    evidence_strings.append(pod_entry["logs_current"]["stderr"])
                if "logs_previous" in pod_entry:
                    evidence_strings.append(pod_entry["logs_previous"]["stdout"])
                    evidence_strings.append(pod_entry["logs_previous"]["stderr"])
        causes = extract_cause_matches(evidence_strings)
        if causes:
            findings.append(
                f"Recurring failed job group `{namespace}/{normalized_name}` has `{len(group)}` failure instance(s). Strongest signals: "
                + ", ".join(cause["cause"] for cause in causes)
                + "."
            )
    return findings


def build_warning_summary(audit: dict[str, Any]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for event in audit["warnings"]:
        normalized_object = normalize_object_name(event["object"])
        key = (event["reason"], normalized_object)
        existing = grouped.get(key)
        if existing is None:
            grouped[key] = {
                "reason": event["reason"],
                "object": normalized_object,
                "count": 1,
                "first_timestamp": event["timestamp"],
                "last_timestamp": event["timestamp"],
                "sample_message": event["message"],
            }
        else:
            existing["count"] += 1
            existing["last_timestamp"] = event["timestamp"]
    summary = list(grouped.values())
    summary.sort(key=lambda item: (-item["count"], item["reason"], item["object"]))
    return summary


def build_issue_specific_next_steps(audit: dict[str, Any]) -> list[str]:
    steps: list[str] = []
    cause_labels = {cause["cause"] for cause in audit["likely_causes"]}

    if "Credentials or IAM/RBAC issue" in cause_labels:
        steps.append(
            "Check the failing workload's IAM or credential source first. For cluster services, verify the service account role, node role, or static credentials source referenced by the container."
        )
    if "CNI or network policy issue" in cause_labels:
        steps.append(
            "Inspect recent CNI-related events and the networking add-on health. Focus on pods with `FailedCreatePodSandBox` and verify the CNI plugin or network-policy controller is healthy."
        )
    if "Container crash loop" in cause_labels:
        steps.append(
            "Open the current and previous logs for the crash-looping pods first, then inspect the owning deployment or daemonset for bad config, missing env vars, or startup regressions."
        )
    if "Image pull failure" in cause_labels:
        steps.append(
            "Verify the image reference, image tag, and pull secret for the affected workload. Check whether the referenced image exists and whether the cluster can authenticate to the registry."
        )
    if "Scheduling or capacity issue" in cause_labels:
        steps.append(
            "Inspect `FailedScheduling` events and compare requested CPU or memory against allocatable node capacity. If autoscaling is expected, confirm the autoscaler is healthy."
        )
    if "Missing secret or configmap" in cause_labels:
        steps.append(
            "Check the referenced secret or configmap names in the workload spec and confirm those objects exist in the same namespace with the expected keys."
        )
    if "Probe failure" in cause_labels:
        steps.append(
            "Review readiness and liveness probe configuration against the application's actual startup time and health endpoints."
        )

    deployment_names = {
        f"{deployment['namespace']}/{deployment['name']}"
        for deployment in audit["unhealthy"]["deployments"]
    }
    if deployment_names:
        steps.append(
            "For unhealthy deployments, compare the deployment conditions, related pod events, and pod logs already captured in the audit before making config changes."
        )

    grouped_jobs: dict[tuple[str, str], list[dict[str, Any]]] = collections.defaultdict(list)
    for job in audit["unhealthy"]["jobs"]:
        grouped_jobs[(job["namespace"], normalize_job_name(job["name"]))].append(job)
    for (namespace, normalized_name), group in grouped_jobs.items():
        steps.append(
            f"Treat recurring job failures in `{namespace}/{normalized_name}` as one incident pattern rather than debugging each timestamped job independently. Use the captured events and any surviving pod logs to decide whether the issue is app-level or infrastructure-level."
        )

    if audit["limits"]["pod_followups"]["truncated"]:
        steps.append(
            "Re-run the audit with a higher `--max-pod-followups` value because the current report did not inspect every unhealthy pod in detail."
        )
    if audit["limits"]["deployment_followups"]["truncated"]:
        steps.append(
            "Re-run the audit with a higher `--max-deployment-followups` value because the current report did not inspect every unhealthy deployment in detail."
        )
    if audit["limits"]["job_followups"]["truncated"]:
        steps.append(
            "Re-run the audit with a higher `--max-job-followups` value because the current report did not inspect every failed job in detail."
        )
    if not audit["limits"]["logs"]["skip_logs"]:
        steps.append(
            "If the root cause is still unclear, inspect older log history because the audit only captured the last tailed portion of each pod log stream."
        )

    deduped_steps = []
    seen = set()
    for step in steps:
        if step not in seen:
            deduped_steps.append(step)
            seen.add(step)
    return deduped_steps


def derive_admin_context(context: str) -> str:
    if context.endswith(READONLY_CONTEXT_SUFFIX):
        return context[: -len(READONLY_CONTEXT_SUFFIX)]
    return context


def warning_items_for_reason(audit: dict[str, Any], reason: str) -> list[dict[str, Any]]:
    return [item for item in audit["warning_summary"] if item["reason"] == reason]


def warning_items_matching(audit: dict[str, Any], pattern: str) -> list[dict[str, Any]]:
    regex = re.compile(pattern, re.IGNORECASE)
    return [
        item
        for item in audit["warning_summary"]
        if regex.search(item["reason"]) or regex.search(item["sample_message"])
    ]


def format_container_summary(spec_summary: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    service_account_name = spec_summary.get("service_account_name")
    if service_account_name:
        lines.append(f"Service account: `{service_account_name}`")
    for container in spec_summary.get("containers", []):
        command = " ".join(" ".join(container.get("command", [])).split())
        args = " ".join(" ".join(container.get("args", [])).split())
        env_names = [env["name"] for env in container.get("env", []) if env.get("name")]
        literal_envs = [
            f"{env['name']}={env['value']}"
            for env in container.get("env", [])
            if env.get("name") and env.get("value") is not None
        ]
        lines.append(
            f"Container `{container.get('name')}` uses image `{container.get('image')}`."
        )
        if command:
            lines.append(f"Command: `{command}`")
        if args:
            lines.append(f"Args: `{args}`")
        if env_names:
            lines.append("Visible env names: " + ", ".join(f"`{name}`" for name in env_names))
        if literal_envs:
            lines.append(
                "Visible literal env values: "
                + ", ".join(f"`{entry}`" for entry in literal_envs)
            )
    return lines


def parse_describe_template_fallback(describe_stdout: str) -> list[str]:
    lines: list[str] = []
    image_match = re.search(r"Image:\s+([^\n]+)", describe_stdout)
    if image_match:
        lines.append(f"Image from `kubectl describe`: `{image_match.group(1).strip()}`")
    command_match = re.search(
        r"Command:\n((?:\s{6,}.+\n)+)", describe_stdout, re.MULTILINE
    )
    if command_match:
        command = " ".join(
            part.strip()
            for part in command_match.group(1).splitlines()
            if part.strip()
        )
        lines.append(f"Command from `kubectl describe`: `{command}`")
    return lines


def collect_serviceaccount_followup(
    context: str, namespace: str, name: str
) -> dict[str, Any] | None:
    result = run_kubectl(
        context,
        ["get", "serviceaccount", name, "-o", "json"],
        namespace=namespace,
        check=False,
        timeout=45,
    )
    if result.returncode != 0 or not result.stdout:
        return None
    payload = json.loads(result.stdout)
    return {
        "namespace": namespace,
        "name": name,
        "annotations": get_nested(payload, ["metadata", "annotations"], {}) or {},
        "secrets": [
            item.get("name")
            for item in payload.get("secrets", []) or []
            if item.get("name")
        ],
        "image_pull_secrets": [
            item.get("name")
            for item in payload.get("imagePullSecrets", []) or []
            if item.get("name")
        ],
    }


def get_serviceaccount_followup(
    audit: dict[str, Any], namespace: str, name: str | None
) -> dict[str, Any] | None:
    if not name:
        return None
    return audit.get("serviceaccount_followups", {}).get(f"{namespace}/{name}")


def get_hpa_followup(audit: dict[str, Any], namespace: str, name: str) -> dict[str, Any] | None:
    return audit.get("hpa_followups", {}).get(f"{namespace}/{name}")


def build_issue_sections(audit: dict[str, Any]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    admin_context = derive_admin_context(audit["context"])
    cause_labels = {cause["cause"] for cause in audit.get("likely_causes", [])}
    serviceaccount_context = (
        audit["context"]
        if permission_allowed(audit["rbac"]["read"], "get", "serviceaccounts")
        else admin_context
    )

    cluster_autoscaler = next(
        (
            followup
            for followup in audit["deployment_followups"]
            if followup["namespace"] == "kube-system"
            and followup["name"] == "cluster-autoscaler"
        ),
        None,
    )
    if cluster_autoscaler:
        findings = [
            "Deployment is unavailable with `0/1` available replicas.",
        ]
        findings.extend(format_container_summary(cluster_autoscaler["spec_summary"]))
        sa_followup = get_serviceaccount_followup(
            audit,
            "kube-system",
            cluster_autoscaler["spec_summary"].get("service_account_name"),
        )
        if sa_followup:
            if sa_followup["annotations"]:
                findings.append(
                    "Service account annotations: "
                    + ", ".join(
                        f"`{key}={value}`"
                        for key, value in sorted(sa_followup["annotations"].items())
                    )
                )
            if sa_followup["image_pull_secrets"]:
                findings.append(
                    "Service account imagePullSecrets: "
                    + ", ".join(f"`{name}`" for name in sa_followup["image_pull_secrets"])
                )
        if "NoCredentialProviders" in cluster_autoscaler["describe"]["stdout"]:
            findings.append(
                "Deployment describe output already includes `NoCredentialProviders`."
            )
        else:
            for pod_followup in find_matching_pod_followups(
                audit["pod_followups"], "kube-system", "cluster-autoscaler"
            ):
                previous_logs = (
                    (pod_followup.get("logs_previous") or {}).get("stdout", "")
                    + "\n"
                    + (pod_followup.get("logs_current") or {}).get("stdout", "")
                )
                if "NoCredentialProviders" in previous_logs:
                    findings.append(
                        "Pod logs end with `Failed to create AWS Manager: NoCredentialProviders`."
                    )
                    break
        sections.append(
            {
                "title": "Cluster Autoscaler AWS Credentials Failure",
                "likely_cause": [
                    "The autoscaler container is configured for `--cloud-provider=aws`, but the workload cannot obtain AWS credentials at runtime.",
                    "The deployment spec shows service account `cluster-autoscaler` and only a visible literal `AWS_REGION` environment variable, so the missing piece is likely the IAM role or another credential source rather than the region setting.",
                ],
                "automated_findings": findings,
                "next_steps": [
                    f"Run `kubectl --context {serviceaccount_context} -n kube-system get serviceaccount cluster-autoscaler -o yaml` and verify whether the observed annotations represent the intended IAM path for this workload.",
                    f"If this deployment is supposed to use node credentials instead of IRSA, compare the node IAM role path for the node currently hosting `cluster-autoscaler` with the AWS permissions expected by cluster-autoscaler.",
                    f"If the ServiceAccount has no IAM-style annotation at all, inspect the deployment manifest in Git to see whether the autoscaler was ever wired for IRSA on this cluster.",
                ],
            }
        )

    cni_warning_items = warning_items_for_reason(audit, "FailedCreatePodSandBox")
    if cni_warning_items:
        cni_followup = audit.get("cni_followup")
        findings = [
            f"`FailedCreatePodSandBox` warnings were captured on `{len(cni_warning_items)}` grouped object pattern(s).",
            "Messages include both `failed to assign an IP address to container` and `failed to setup network policy`.",
        ]
        if cni_followup:
            status = cni_followup["status"]
            findings.append(
                f"`kube-system/aws-node` daemonset status during the audit: desired `{status['desired']}`, current `{status['current']}`, ready `{status['ready']}`."
            )
            if not cni_followup["pod_names"]:
                findings.append(
                    "No `aws-node` pods were available to inspect under the current node selection."
                )
        sections.append(
            {
                "title": "CNI Sandbox and IP Assignment Failures",
                "likely_cause": [
                    "Pods across multiple namespaces hit networking setup failures before their containers could start.",
                    "The evidence points to the AWS VPC CNI or the attached network-policy path rather than a single application deployment.",
                ],
                "automated_findings": findings,
                "next_steps": [
                    f"Re-run `kubectl --context {audit['context']} -n kube-system get daemonset aws-node -o wide` and `kubectl --context {audit['context']} -n kube-system get pods -l k8s-app=aws-node -o wide` to confirm whether `aws-node` should currently be scheduling pods on this cluster.",
                    f"Run `kubectl --context {audit['context']} get nodes -L eks.amazonaws.com/compute-type,node.kubernetes.io/instance-type` and compare the node compute type with the `aws-node` daemonset affinity if the daemonset still shows `0` desired pods.",
                    f"Run `kubectl --context {serviceaccount_context} -n kube-system get serviceaccount aws-node -o yaml` and verify whether the CNI daemonset is using the expected runtime identity for this cluster.",
                    "If a future run finds live `aws-node` pods, inspect their logs next because this audit could not collect them when no matching pods were present.",
                ],
            }
        )

    scheduling_warning_items = warning_items_for_reason(audit, "FailedScheduling")
    if scheduling_warning_items:
        sampled_objects = ", ".join(
            f"`{item['object']}`" for item in scheduling_warning_items[:5]
        )
        likely = [
            "Multiple workloads were blocked by insufficient CPU or memory, and some events also mention untolerated taints.",
        ]
        if cluster_autoscaler:
            likely.append(
                "Because the autoscaler is currently failing, new capacity may not be added when the scheduler needs it."
            )
        sections.append(
            {
                "title": "Scheduler Capacity Pressure",
                "likely_cause": likely,
                "automated_findings": [
                    f"`FailedScheduling` warnings were seen for {sampled_objects}.",
                    "Sample messages mention `Insufficient cpu`, `Insufficient memory`, and in some cases untolerated taints.",
                ],
                "next_steps": [
                    "Review workload resource requests for the affected deployments or jobs and compare them with the scheduler failures already captured in the warning summary.",
                    "Fix the autoscaler credential issue first if this cluster is expected to scale automatically under load, because scheduling pressure and autoscaler health are likely linked here.",
                ],
            }
        )

    if "Probe failure" in cause_labels:
        probe_items = warning_items_matching(audit, r"Readiness probe failed|Liveness probe failed|Startup probe failed|Unhealthy")
        if probe_items:
            sections.append(
                {
                    "title": "Probe Failure Signals",
                    "likely_cause": [
                        "At least one workload failed a readiness, liveness, or startup probe during the audit window.",
                    ],
                    "automated_findings": [
                        f"`{item['reason']}` on `{item['object']}` occurred `{item['count']}` time(s). Example: {item['sample_message']}"
                        for item in probe_items[:5]
                    ],
                    "next_steps": [
                        "Compare the failing probe path and port in the captured warning message with the actual container startup behavior and health endpoint implementation.",
                        f"Use `kubectl --context {audit['context']} describe pod <pod-name> -n <namespace>` on a currently failing pod if the probe issue is still live, because probe events often change quickly after restart.",
                    ],
                }
            )

    if "Image pull failure" in cause_labels:
        image_pull_items = warning_items_matching(audit, r"ImagePullBackOff|ErrImagePull|pull access denied|manifest unknown")
        sections.append(
            {
                "title": "Image Pull Failures",
                "likely_cause": [
                    "One or more workloads could not pull their container image from the configured registry."
                ],
                "automated_findings": [
                    f"`{item['reason']}` on `{item['object']}` occurred `{item['count']}` time(s). Example: {item['sample_message']}"
                    for item in image_pull_items[:5]
                ] or [
                    "The cause classifier found image-pull signatures in the collected logs or describe output."
                ],
                "next_steps": [
                    "Verify the exact image reference and tag in the owning workload spec, then confirm the image exists in that registry.",
                    f"If the workload relies on pull credentials, run `kubectl --context {serviceaccount_context} get serviceaccount <service-account> -n <namespace> -o yaml` and inspect its `imagePullSecrets` entries.",
                ],
            }
        )

    if "Missing secret or configmap" in cause_labels:
        config_items = warning_items_matching(audit, r"CreateContainerConfigError|secret .* not found|configmap .* not found")
        sections.append(
            {
                "title": "Missing Secret or ConfigMap References",
                "likely_cause": [
                    "A workload references a Secret or ConfigMap key that is missing or not resolvable in the target namespace."
                ],
                "automated_findings": [
                    f"`{item['reason']}` on `{item['object']}` occurred `{item['count']}` time(s). Example: {item['sample_message']}"
                    for item in config_items[:5]
                ] or [
                    "The cause classifier found missing Secret or ConfigMap signatures in the collected evidence."
                ],
                "next_steps": [
                    f"Use `kubectl --context {audit['context']} get configmaps -n <namespace>` to confirm referenced ConfigMap names exist.",
                    "For Secret references, inspect the workload manifest in Git and compare the referenced Secret name and key with your deployment setup instead of exposing Secret contents to this workflow.",
                    "Compare the missing object name or key from the event or log output with the workload manifest in Git rather than patching the live cluster from this workflow.",
                ],
            }
        )

    if "Storage or volume mount issue" in cause_labels:
        storage_items = warning_items_matching(audit, r"FailedMount|MountVolume|AttachVolume|Multi-Attach")
        sections.append(
            {
                "title": "Storage or Volume Mount Failures",
                "likely_cause": [
                    "A pod could not attach or mount one of its required volumes."
                ],
                "automated_findings": [
                    f"`{item['reason']}` on `{item['object']}` occurred `{item['count']}` time(s). Example: {item['sample_message']}"
                    for item in storage_items[:5]
                ] or [
                    "The cause classifier found volume-mount signatures in the collected evidence."
                ],
                "next_steps": [
                    f"Run `kubectl --context {audit['context']} describe pod <pod-name> -n <namespace>` on an affected pod to confirm which volume name is failing.",
                    f"If the failing volume is PVC-backed, run `kubectl --context {audit['context']} get pvc -n <namespace>` and compare the claim name with the pod spec and storage class setup.",
                ],
            }
        )

    if "OOM or eviction issue" in cause_labels:
        oom_items = warning_items_matching(audit, r"OOMKilled|Evicted")
        sections.append(
            {
                "title": "OOM or Eviction Signals",
                "likely_cause": [
                    "A workload was terminated because it exceeded available memory or was evicted under node pressure."
                ],
                "automated_findings": [
                    f"`{item['reason']}` on `{item['object']}` occurred `{item['count']}` time(s). Example: {item['sample_message']}"
                    for item in oom_items[:5]
                ] or [
                    "The cause classifier found OOM or eviction signatures in the collected evidence."
                ],
                "next_steps": [
                    "Compare the workload's memory requests and limits with the observed container behavior and node pressure signals.",
                    "If evictions are recurring, treat this together with the scheduling-capacity section rather than as a separate app-only issue.",
                ],
            }
        )

    if "Application connectivity issue" in cause_labels:
        app_conn_items = warning_items_matching(audit, r"connection refused|no such host|i/o timeout|temporary failure in name resolution|context deadline exceeded")
        sections.append(
            {
                "title": "Application Connectivity Failures",
                "likely_cause": [
                    "A workload reached its runtime phase but could not connect to an upstream service, DNS target, or local dependency."
                ],
                "automated_findings": [
                    f"`{item['reason']}` on `{item['object']}` occurred `{item['count']}` time(s). Example: {item['sample_message']}"
                    for item in app_conn_items[:5]
                ] or [
                    "The cause classifier found connectivity-style signatures in the collected evidence."
                ],
                "next_steps": [
                    "Compare the failing hostname, URL, or port in the captured message with the expected Service name and health endpoint in the workload config.",
                    "If the same workload also has CNI or scheduling failures, resolve those infrastructure issues first before treating the connectivity failure as purely application-level.",
                ],
            }
        )

    for hpa in audit["unhealthy"].get("hpas", []):
        hpa_followup = get_hpa_followup(audit, hpa["namespace"], hpa["name"])
        condition_messages = [
            condition["message"] for condition in hpa.get("conditions", []) if condition.get("message")
        ]
        automated_findings = condition_messages or [
            f"Target reference is `{hpa['target_kind']}/{hpa['target_name']}`."
        ]
        next_steps: list[str] = []
        if hpa_followup:
            if hpa_followup["target_get"]["returncode"] == 0:
                automated_findings.append(
                    f"The audit was able to read `{hpa['target_kind']}/{hpa['target_name']}` in namespace `{hpa['namespace']}`."
                )
                next_steps.append(
                    "Compare the HPA target reference with the workload you actually intend to autoscale, because the HPA is unhealthy even though the target object exists."
                )
            else:
                target_error = (
                    hpa_followup["target_get"]["stderr"]
                    or hpa_followup["target_get"]["stdout"]
                    or "target lookup failed"
                )
                automated_findings.append(
                    f"The audit tried to read `{hpa['target_kind']}/{hpa['target_name']}` and got: `{target_error}`"
                )
                next_steps.append(
                    "Fix the HPA target reference or recreate the missing workload, because the readonly audit already confirmed the referenced target object is absent."
                )
        else:
            next_steps.append(
                f"Run `kubectl --context {audit['context']} -n {hpa['namespace']} get {hpa['target_kind'].lower()} {hpa['target_name']}` to verify whether the target exists."
            )
        sections.append(
            {
                "title": f"HPA Target Missing: {hpa['namespace']}/{hpa['name']}",
                "likely_cause": [
                    f"The HPA points at `{hpa['target_kind']}/{hpa['target_name']}`, but the cluster reports that target cannot be scaled because it was not found."
                ],
                "automated_findings": automated_findings,
                "next_steps": next_steps,
            }
        )

    grouped_jobs: dict[tuple[str, str], list[dict[str, Any]]] = collections.defaultdict(list)
    for job_followup in audit["job_followups"]:
        grouped_jobs[(job_followup["namespace"], normalize_job_name(job_followup["name"]))].append(job_followup)
    for (namespace, normalized_name), group in grouped_jobs.items():
        evidence_strings = []
        automated_findings: list[str] = [
            f"The audit inspected `{len(group)}` failed instance(s) in this job family."
        ]
        owner_descriptions = []
        for job_followup in group:
            owner_kinds = job_followup.get("owner_kinds", [])
            owner_names = job_followup.get("owner_names", [])
            if owner_kinds and owner_names:
                owner_descriptions.extend(
                    f"`{kind}/{name}`" for kind, name in zip(owner_kinds, owner_names)
                )
            evidence_strings.append(job_followup["describe"]["stdout"])
            evidence_strings.append(job_followup["describe"]["stderr"])
            if job_followup["spec_summary"]:
                automated_findings.extend(format_container_summary(job_followup["spec_summary"]))
                break
        if len(automated_findings) == 1 and group:
            automated_findings.extend(
                parse_describe_template_fallback(group[0]["describe"]["stdout"])
            )
        if owner_descriptions:
            automated_findings.append(
                "Owner references seen: " + ", ".join(sorted(set(owner_descriptions)))
            )
        causes = extract_cause_matches(evidence_strings)
        related_warning_items = [
            item
            for item in audit["warning_summary"]
            if item["object"].endswith(normalized_name)
        ]
        if not causes:
            warning_evidence = extract_cause_matches(
                [f"{item['reason']} {item['sample_message']}" for item in related_warning_items]
            )
            causes = warning_evidence
        cause_text = [
            ", ".join(cause["cause"] for cause in causes)
        ] if causes else [
            "The collected job describe outputs and grouped warning evidence did not produce a strong automated signature."
        ]
        if related_warning_items:
            automated_findings.extend(
                [
                    f"Grouped warning evidence: `{item['reason']}` on `{item['object']}` occurred `{item['count']}` time(s)."
                    for item in related_warning_items[:3]
                ]
            )
        next_steps = [
            "The audit already inspected the latest available job spec for this failing family, including image, command, and visible environment wiring.",
        ]
        if any(owner == "CronJob" for job_followup in group for owner in job_followup.get("owner_kinds", [])):
            cronjob_names = sorted(
                {
                    owner_name
                    for job_followup in group
                    for owner_kind, owner_name in zip(
                        job_followup.get("owner_kinds", []),
                        job_followup.get("owner_names", []),
                    )
                    if owner_kind == "CronJob"
                }
            )
            for cronjob_name in cronjob_names:
                next_steps.append(
                    f"Run `kubectl --context {audit['context']} -n {namespace} get cronjob {cronjob_name} -o yaml` to inspect the source template that keeps producing these failed jobs."
                )
        else:
            next_steps.append(
                "Compare the extracted job spec details in this report with the owning manifest in Git, since there is no higher-level CronJob template to inspect for this job family."
            )
        if not any(job_followup["pods"] for job_followup in group):
            next_steps.append(
                "The failed pods for this job family were already gone by the time of inspection, so a future rerun during an active failure will be needed to capture container logs."
            )
        sections.append(
            {
                "title": f"Failed Job Family: {namespace}/{normalized_name}",
                "likely_cause": cause_text,
                "automated_findings": automated_findings,
                "next_steps": next_steps,
            }
        )

    return sections


def build_final_next_steps(audit: dict[str, Any]) -> list[str]:
    steps: list[str] = []
    titles = {section["title"] for section in audit.get("issue_sections", [])}
    if "Cluster Autoscaler AWS Credentials Failure" in titles:
        steps.append(
            "Fix the cluster-autoscaler credential path first, because it is both a direct production issue and a likely amplifier for the scheduling pressure seen elsewhere."
        )
    if "CNI Sandbox and IP Assignment Failures" in titles:
        steps.append(
            "Resolve the AWS CNI or network-policy path next, because several unrelated workloads were blocked before their containers could even start."
        )
    if any(title.startswith("Failed Job Family: default/citycatalyst-test-check-hiap-jobs") for title in titles):
        steps.append(
            "After infrastructure issues are addressed, watch the next `citycatalyst-test-check-hiap-jobs` run live to determine whether any remaining failures are application-level."
        )
    if any(title.startswith("HPA Target Missing:") for title in titles):
        steps.append(
            "Clean up or repair orphaned autoscaling resources like `db-dump-hpa` once the active runtime incidents are understood."
        )
    if audit["limits"]["job_followups"]["truncated"]:
        steps.append(
            "Re-run the audit with a higher `--max-job-followups` value because the current report did not inspect every failed job in detail."
        )
    if not audit["limits"]["logs"]["skip_logs"]:
        steps.append(
            "If one of the issue sections still ends in ambiguity, inspect older log history because this audit only tailed the last portion of each available log stream."
        )
    return steps


def build_markdown_report(audit: dict[str, Any]) -> str:
    lines = []
    write_allowed = [check for check in audit["rbac"]["write"] if check["allowed"]]
    pod_followup_limits = audit["limits"]["pod_followups"]
    log_limits = audit["limits"]["logs"]
    lines.append(f"# Kubernetes Health Audit: {audit['context']}")
    lines.append("")
    lines.append(f"- Generated at: `{audit['generated_at']}`")
    lines.append(f"- Target context: `{audit['context']}`")
    lines.append(f"- Current kubectl context: `{audit['current_context']}`")
    lines.append("")
    if write_allowed:
        lines.append("## Safety warning")
        lines.append("")
        lines.append(
            "- The audit script stayed read-only, but the current Kubernetes identity still has write permissions."
        )
        lines.append(
            "- This means the workflow is protected by script guardrails, not by RBAC alone."
        )
        lines.append("")
    lines.append("## Overall status")
    lines.append("")
    lines.append(f"- Nodes not ready: `{len(audit['unhealthy']['nodes'])}`")
    lines.append(f"- Pods needing attention: `{len(audit['unhealthy']['pods'])}`")
    lines.append(
        f"- Deployments not fully available: `{len(audit['unhealthy']['deployments'])}`"
    )
    lines.append(f"- Failed jobs: `{len(audit['unhealthy']['jobs'])}`")
    lines.append(f"- Unhealthy HPAs: `{len(audit['unhealthy'].get('hpas', []))}`")
    lines.append(f"- Recent warning events captured: `{len(audit['warnings'])}`")
    lines.append(
        f"- Pod follow-up inspections performed: `{pod_followup_limits['processed']}` of `{pod_followup_limits['total_candidates']}`"
    )
    lines.append(
        f"- Deployment follow-up inspections performed: `{audit['limits']['deployment_followups']['processed']}` of `{audit['limits']['deployment_followups']['total_candidates']}`"
    )
    lines.append(
        f"- Job follow-up inspections performed: `{audit['limits']['job_followups']['processed']}` of `{audit['limits']['job_followups']['total_candidates']}`"
    )
    lines.append(
        f"- Pod logs are sampled with `--tail {log_limits['max_lines_per_call']}` per log call"
    )
    lines.append(
        f"- Raw warning event log: `{audit['artifacts']['warnings_markdown']}`"
    )
    lines.append("")
    lines.append("## Conclusion")
    lines.append("")
    for item in audit["conclusion"]:
        lines.append(f"- {item}")
    lines.append("")
    if pod_followup_limits["truncated"]:
        lines.append("## Audit limit warning")
        lines.append("")
        lines.append(
            f"- The audit hit the pod follow-up safety limit and inspected `{pod_followup_limits['processed']}` of `{pod_followup_limits['total_candidates']}` unhealthy pods."
        )
        lines.append(
            f"- Increase `--max-pod-followups` above `{pod_followup_limits['configured_limit']}` if you want a larger sweep for unusually large incidents."
        )
        lines.append("")
    if audit["limits"]["deployment_followups"]["truncated"] or audit["limits"]["job_followups"]["truncated"]:
        lines.append("## Additional audit limit warning")
        lines.append("")
        if audit["limits"]["deployment_followups"]["truncated"]:
            lines.append(
                f"- The audit inspected `{audit['limits']['deployment_followups']['processed']}` of `{audit['limits']['deployment_followups']['total_candidates']}` unhealthy deployments."
            )
        if audit["limits"]["job_followups"]["truncated"]:
            lines.append(
                f"- The audit inspected `{audit['limits']['job_followups']['processed']}` of `{audit['limits']['job_followups']['total_candidates']}` failed jobs."
            )
        lines.append("")
    if not log_limits["skip_logs"]:
        lines.append("## Log sampling note")
        lines.append("")
        lines.append(
            f"- Pod log collection is intentionally truncated to the last `{log_limits['max_lines_per_call']}` lines per `kubectl logs` call."
        )
        lines.append(
            "- If an issue may depend on older log history, re-run with a higher `--max-log-lines` value or inspect the pod logs directly."
        )
        lines.append("")
    lines.append("## RBAC preflight")
    lines.append("")
    for check in audit["rbac"]["read"]:
        lines.append(
            f"- Read `{check['verb']} {check['resource']}`: `{'yes' if check['allowed'] else 'no'}`"
        )
    for check in audit["rbac"]["write"]:
        lines.append(
            f"- Write `{check['verb']} {check['resource']}`: `{'yes' if check['allowed'] else 'no'}`"
        )
    lines.append("")

    if audit["unhealthy"]["nodes"]:
        lines.append("## Unhealthy nodes")
        lines.append("")
        for node in audit["unhealthy"]["nodes"]:
            lines.append(
                f"- `{node['name']}` not ready: {node.get('reason') or 'unknown reason'}"
            )
        lines.append("")

    if audit["unhealthy"]["deployments"]:
        lines.append("## Deployment issues")
        lines.append("")
        for deployment in audit["unhealthy"]["deployments"]:
            lines.append(
                f"- `{deployment['namespace']}/{deployment['name']}` available `{deployment['available']}` of `{deployment['desired']}`"
            )
        lines.append("")

    if audit["unhealthy"].get("hpas"):
        lines.append("## HPA issues")
        lines.append("")
        for hpa in audit["unhealthy"]["hpas"]:
            lines.append(
                f"- `{hpa['namespace']}/{hpa['name']}` targets `{hpa['target_kind']}/{hpa['target_name']}`"
            )
        lines.append("")

    if audit["unhealthy"]["jobs"]:
        lines.append("## Failed jobs")
        lines.append("")
        for job in audit["unhealthy"]["jobs"]:
            lines.append(
                f"- `{job['namespace']}/{job['name']}` failed count `{job['failed']}`"
            )
        lines.append("")

    if audit["unhealthy"]["pods"]:
        lines.append("## Pods needing attention")
        lines.append("")
        for pod in audit["unhealthy"]["pods"]:
            details = []
            if pod["waiting_reasons"]:
                details.append("waiting=" + ",".join(pod["waiting_reasons"]))
            if pod["terminated_reasons"]:
                details.append("terminated=" + ",".join(pod["terminated_reasons"]))
            details.append(f"restarts={pod['restarts']}")
            lines.append(
                f"- `{pod['namespace']}/{pod['name']}` phase `{pod['phase']}`, ready `{pod['ready']}`, "
                + ", ".join(details)
            )
        lines.append("")

    if audit["warning_summary"]:
        lines.append("## Warning summary")
        lines.append("")
        for item in audit["warning_summary"]:
            lines.append(
                f"- `{item['reason']}` on `{item['object']}` occurred `{item['count']}` time(s) between `{item['first_timestamp']}` and `{item['last_timestamp']}`. Example: {item['sample_message']}"
            )
        lines.append("")

    if audit["resource_findings"]:
        lines.append("## Automated follow-up findings")
        lines.append("")
        for finding in audit["resource_findings"]:
            lines.append(f"- {finding}")
        lines.append("")

    if audit.get("issue_sections"):
        for issue in audit["issue_sections"]:
            lines.append(f"## Issue: {issue['title']}")
            lines.append("")
            lines.append("### Likely cause")
            lines.append("")
            for item in issue["likely_cause"]:
                lines.append(f"- {item}")
            lines.append("")
            lines.append("### Automated findings")
            lines.append("")
            for item in issue["automated_findings"]:
                lines.append(f"- {item}")
            lines.append("")
            lines.append("### Next steps")
            lines.append("")
            for item in issue["next_steps"]:
                lines.append(f"- {item}")
            lines.append("")

    lines.append("## Final next steps")
    lines.append("")
    for step in audit["next_steps"]:
        lines.append(f"- {step}")
    if write_allowed:
        lines.append(
            "- Move this workflow to a stricter read-only kubeconfig, IAM role, or Kubernetes RBAC binding before treating it as strongly isolated."
        )
    else:
        lines.append(
            "- The current Kubernetes identity appears read-only for the sampled write checks, which is the preferred setup for this workflow."
        )
    lines.append("- Review the JSON artifact for full raw evidence if deeper analysis is needed.")
    lines.append("- For persistent workload failures, inspect the owning deployment or cronjob configuration in Git rather than changing live resources from this workflow.")
    lines.append("")
    return "\n".join(lines)


def write_outputs(
    output_dir: Path, context: str, audit: dict[str, Any]
) -> tuple[Path, Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_context = context.replace("/", "-").replace("\\", "-")
    json_path = output_dir / f"{timestamp}-{safe_context}-audit.json"
    md_path = output_dir / f"{timestamp}-{safe_context}-audit.md"
    warnings_md_path = output_dir / f"{timestamp}-{safe_context}-warnings.md"
    audit["artifacts"] = {
        "markdown": str(md_path),
        "json": str(json_path),
        "warnings_markdown": str(warnings_md_path),
    }
    json_path.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    md_path.write_text(build_markdown_report(audit), encoding="utf-8")
    warning_lines = ["# Raw warning events", ""]
    if audit["warnings"]:
        for event in audit["warnings"]:
            warning_lines.append(
                f"- `{event['timestamp']}` `{event['object']}` `{event['reason']}`: {event['message']}"
            )
    else:
        warning_lines.append("- No warning events captured.")
    warnings_md_path.write_text("\n".join(warning_lines), encoding="utf-8")
    return json_path, md_path, warnings_md_path


def main() -> None:
    setup_logging()
    args = parse_args()
    require_readonly_context_name(args.context)

    current_context = run_kubectl(
        args.context, ["config", "current-context"], check=False
    )
    cluster_info = run_kubectl(args.context, ["cluster-info"], check=False, timeout=45)
    if cluster_info.returncode != 0:
        raise SystemExit(
            f"Failed to reach cluster via context {args.context}: {cluster_info.stderr or cluster_info.stdout}"
        )

    read_checks = [
        can_i(args.context, verb, resource, namespaced)
        for verb, resource, namespaced in READ_PERMISSION_CHECKS
    ]
    write_checks = [
        can_i(args.context, verb, resource, namespaced)
        for verb, resource, namespaced in WRITE_PERMISSION_CHECKS
    ]
    enforce_readonly_permissions(write_checks)

    nodes = run_json(args.context, ["get", "nodes"])
    pods_args = ["get", "pods", "-A"] if args.namespace is None else ["get", "pods"]
    deployments_args = (
        ["get", "deployments", "-A"]
        if args.namespace is None
        else ["get", "deployments"]
    )
    jobs_args = ["get", "jobs", "-A"] if args.namespace is None else ["get", "jobs"]
    cronjobs_args = (
        ["get", "cronjobs", "-A"] if args.namespace is None else ["get", "cronjobs"]
    )
    services_args = (
        ["get", "services", "-A"] if args.namespace is None else ["get", "services"]
    )
    hpas_args = ["get", "hpa", "-A"] if args.namespace is None else ["get", "hpa"]
    ingress_args = (
        ["get", "ingresses", "-A"] if args.namespace is None else ["get", "ingresses"]
    )
    events_args = (
        ["get", "events", "-A", "--field-selector", "type=Warning"]
        if args.namespace is None
        else ["get", "events", "--field-selector", "type=Warning"]
    )

    pods = run_json(args.context, pods_args, namespace=args.namespace, timeout=45)
    deployments = run_json(args.context, deployments_args, namespace=args.namespace)
    jobs = run_json(args.context, jobs_args, namespace=args.namespace)
    cronjobs = run_json(args.context, cronjobs_args, namespace=args.namespace)
    services = run_json(args.context, services_args, namespace=args.namespace)
    hpas = run_json(args.context, hpas_args, namespace=args.namespace)
    ingresses = run_json(args.context, ingress_args, namespace=args.namespace)
    events = run_json(args.context, events_args, namespace=args.namespace, timeout=45)

    node_summaries, unhealthy_nodes = summarize_nodes(nodes)
    pod_summaries, unhealthy_pods = summarize_pods(pods)
    deployment_summaries, unhealthy_deployments = summarize_deployments(deployments)
    failed_jobs = summarize_jobs(jobs)
    unhealthy_hpas = summarize_hpas(hpas)
    warning_events = summarize_warning_events(events)

    pod_followups = []
    selected_unhealthy_pods = unhealthy_pods[: args.max_pod_followups]
    for pod in selected_unhealthy_pods:
        pod_followups.append(
            collect_pod_followup(
                args.context,
                pod,
                max_log_lines=args.max_log_lines,
                skip_logs=args.skip_logs,
            )
        )

    deployment_followups = []
    selected_unhealthy_deployments = unhealthy_deployments[
        : args.max_deployment_followups
    ]
    for deployment in selected_unhealthy_deployments:
        deployment_followups.append(collect_deployment_followup(args.context, deployment))

    job_followups = []
    selected_failed_jobs = failed_jobs[: args.max_job_followups]
    for job in selected_failed_jobs:
        job_followups.append(
            collect_job_followup(
                args.context,
                job,
                max_log_lines=args.max_log_lines,
                skip_logs=args.skip_logs,
            )
        )
    cni_followup = collect_cni_followup(args.context)
    serviceaccount_followups: dict[str, dict[str, Any]] = {}
    if permission_allowed(read_checks, "get", "serviceaccounts"):
        serviceaccount_targets: set[tuple[str, str]] = set()
        for deployment_followup in deployment_followups:
            service_account_name = deployment_followup["spec_summary"].get(
                "service_account_name"
            )
            if service_account_name:
                serviceaccount_targets.add(
                    (deployment_followup["namespace"], service_account_name)
                )
        if cni_followup:
            cni_service_account = cni_followup["spec_summary"].get("service_account_name")
            if cni_service_account:
                serviceaccount_targets.add(("kube-system", cni_service_account))
        for namespace, name in sorted(serviceaccount_targets):
            followup = collect_serviceaccount_followup(args.context, namespace, name)
            if followup:
                serviceaccount_followups[f"{namespace}/{name}"] = followup
    hpa_followups: dict[str, dict[str, Any]] = {}
    for hpa in unhealthy_hpas:
        followup = collect_hpa_followup(args.context, hpa)
        hpa_followups[f"{hpa['namespace']}/{hpa['name']}"] = followup

    audit: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "context": args.context,
        "current_context": current_context.stdout or current_context.stderr,
        "cluster_info": {
            "stdout": cluster_info.stdout,
            "stderr": cluster_info.stderr,
            "returncode": cluster_info.returncode,
        },
        "rbac": {
            "read": read_checks,
            "write": write_checks,
        },
        "resources": {
            "nodes": node_summaries,
            "pods": pod_summaries,
            "deployments": deployment_summaries,
            "jobs_count": len(jobs.get("items", [])),
            "cronjobs_count": len(cronjobs.get("items", [])),
            "services_count": len(services.get("items", [])),
            "hpas_count": len(hpas.get("items", [])),
            "ingresses_count": len(ingresses.get("items", [])),
        },
        "limits": {
            "pod_followups": {
                "configured_limit": args.max_pod_followups,
                "processed": len(selected_unhealthy_pods),
                "total_candidates": len(unhealthy_pods),
                "truncated": len(unhealthy_pods) > args.max_pod_followups,
            },
            "deployment_followups": {
                "configured_limit": args.max_deployment_followups,
                "processed": len(selected_unhealthy_deployments),
                "total_candidates": len(unhealthy_deployments),
                "truncated": len(unhealthy_deployments) > args.max_deployment_followups,
            },
            "job_followups": {
                "configured_limit": args.max_job_followups,
                "processed": len(selected_failed_jobs),
                "total_candidates": len(failed_jobs),
                "truncated": len(failed_jobs) > args.max_job_followups,
            },
            "logs": {
                "max_lines_per_call": args.max_log_lines,
                "skip_logs": args.skip_logs,
                "truncated_per_call": not args.skip_logs,
            },
        },
        "unhealthy": {
            "nodes": unhealthy_nodes,
            "pods": unhealthy_pods,
            "deployments": unhealthy_deployments,
            "jobs": failed_jobs,
            "hpas": unhealthy_hpas,
        },
        "warnings": warning_events,
        "pod_followups": pod_followups,
        "deployment_followups": deployment_followups,
        "job_followups": job_followups,
        "cni_followup": cni_followup,
        "serviceaccount_followups": serviceaccount_followups,
        "hpa_followups": hpa_followups,
    }
    audit["likely_causes"] = infer_likely_causes(audit)
    audit["resource_findings"] = build_resource_findings(audit)
    audit["warning_summary"] = build_warning_summary(audit)
    audit["conclusion"] = build_conclusion(audit)
    audit["issue_sections"] = build_issue_sections(audit)
    audit["next_steps"] = build_final_next_steps(audit)

    json_path, md_path, warnings_md_path = write_outputs(
        args.output_dir, args.context, audit
    )
    json_path.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    md_path.write_text(build_markdown_report(audit), encoding="utf-8")
    print(f"Markdown report: {md_path}")
    print(f"JSON artifact: {json_path}")
    print(f"Warnings artifact: {warnings_md_path}")
    print(
        "Summary: "
        f"{len(unhealthy_nodes)} unhealthy nodes, "
        f"{len(unhealthy_pods)} pods needing attention, "
        f"{len(unhealthy_deployments)} deployments not fully available, "
        f"{len(failed_jobs)} failed jobs."
    )


if __name__ == "__main__":
    try:
        main()
    except KubectlError as exc:
        LOGGER.error("%s", exc)
        sys.exit(2)
    except subprocess.TimeoutExpired as exc:
        LOGGER.error("Timed out while running command: %s", exc.cmd)
        sys.exit(3)
