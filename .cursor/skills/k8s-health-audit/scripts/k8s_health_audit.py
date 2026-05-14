#!/usr/bin/env python3
"""
Brief: Run a read-only Kubernetes health audit and generate Markdown and JSON reports.

Inputs:
- CLI args:
  - `--context`: Required kubeconfig context to inspect.
  - `--namespace`: Optional namespace to focus follow-up pod inspection on. Defaults to all namespaces.
  - `--max-pod-followups`: Maximum number of unhealthy pods to inspect in detail. Default `5`.
  - `--max-log-lines`: Maximum number of log lines fetched per log call. Default `80`.
  - `--output-dir`: Directory for generated report files. Defaults to `.cursor/skills/k8s-health-audit/out`.
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
DEFAULT_OUTPUT_DIR = SKILL_ROOT / "out"
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
    ("get", "deployments.apps", True),
    ("get", "events", True),
    ("get", "nodes", False),
    ("get", "services", True),
    ("get", "ingresses.networking.k8s.io", True),
    ("get", "jobs.batch", True),
    ("get", "cronjobs.batch", True),
]

WRITE_PERMISSION_CHECKS = [
    ("create", "deployments.apps", True),
    ("delete", "pods", True),
    ("patch", "deployments.apps", True),
    ("update", "configmaps", True),
]

CAUSE_RULES = [
    (re.compile(r"ImagePullBackOff|ErrImagePull"), "Image pull failure"),
    (re.compile(r"CrashLoopBackOff|Back-off restarting failed container"), "Container crash loop"),
    (re.compile(r"FailedScheduling|Insufficient cpu|Insufficient memory"), "Scheduling or capacity issue"),
    (re.compile(r"FailedCreatePodSandBox|aws-cni|setup network"), "CNI or network policy issue"),
    (re.compile(r"NoCredentialProviders|AccessDenied|Unauthorized|forbidden"), "Credentials or IAM/RBAC issue"),
    (re.compile(r"secret .* not found|configmap .* not found", re.IGNORECASE), "Missing secret or configmap"),
    (re.compile(r"Readiness probe failed|Liveness probe failed"), "Probe failure"),
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
    parser = argparse.ArgumentParser(description="Run a read-only Kubernetes health audit.")
    parser.add_argument("--context", required=True, help="Kubeconfig context to inspect.")
    parser.add_argument(
        "--namespace",
        default=None,
        help="Optional namespace for focused follow-up inspection. Defaults to all namespaces.",
    )
    parser.add_argument(
        "--max-pod-followups",
        type=int,
        default=5,
        help="Maximum unhealthy pods to inspect in detail.",
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
        raise KubectlError(f"Refusing kubectl command with forbidden flag: {' '.join(args)}")
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
        raise KubectlError(f"kubectl failed: {' '.join(cmd)}\n{result.stderr or result.stdout}")
    return result


def run_json(context: str, args: list[str], *, namespace: str | None = None, timeout: int = 30) -> Any:
    result = run_kubectl(context, args + ["-o", "json"], namespace=namespace, timeout=timeout)
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


def get_nested(obj: dict[str, Any], path: list[str], default: Any = None) -> Any:
    current: Any = obj
    for key in path:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
        if current is None:
            return default
    return current


def summarize_nodes(nodes: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    summaries: list[dict[str, Any]] = []
    unhealthy: list[dict[str, Any]] = []
    for item in nodes.get("items", []):
        conditions = item.get("status", {}).get("conditions", [])
        ready_condition = next((c for c in conditions if c.get("type") == "Ready"), {})
        ready = ready_condition.get("status") == "True"
        summary = {
            "name": get_nested(item, ["metadata", "name"], "unknown"),
            "ready": ready,
            "roles": list(get_nested(item, ["metadata", "labels"], {}).keys()),
            "reason": ready_condition.get("reason"),
            "message": ready_condition.get("message"),
        }
        summaries.append(summary)
        if not ready:
            unhealthy.append(summary)
    return summaries, unhealthy


def summarize_pods(pods: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
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
        }
        summaries.append(summary)
        if status not in {"Running", "Succeeded"} or waiting_reasons or restarts > 0:
            unhealthy.append(summary)
    unhealthy.sort(key=lambda item: (item["phase"] == "Running", -item["restarts"]))
    return summaries, unhealthy


def summarize_deployments(deployments: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
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
                }
            )
    return failed_jobs


def summarize_warning_events(events: dict[str, Any], limit: int = 20) -> list[dict[str, Any]]:
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
    return warnings[-limit:]


def collect_pod_followup(
    context: str,
    pod: dict[str, Any],
    *,
    max_log_lines: int,
    skip_logs: bool,
) -> dict[str, Any]:
    namespace = pod["namespace"]
    name = pod["name"]
    describe = run_kubectl(context, ["describe", "pod", name], namespace=namespace, check=False, timeout=45)
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
        "logs_current": None
        if logs_current is None
        else {
            "stdout": logs_current.stdout,
            "stderr": logs_current.stderr,
            "returncode": logs_current.returncode,
        },
        "logs_previous": None
        if logs_previous is None
        else {
            "stdout": logs_previous.stdout,
            "stderr": logs_previous.stderr,
            "returncode": logs_previous.returncode,
        },
    }


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

    causes: list[dict[str, str]] = []
    seen = set()
    for evidence in evidence_strings:
        for pattern, label in CAUSE_RULES:
            match = pattern.search(evidence or "")
            if match and label not in seen:
                causes.append({"cause": label, "evidence": match.group(0)})
                seen.add(label)
    if not causes and audit["unhealthy"]["pods"]:
        causes.append({"cause": "Unknown workload failure", "evidence": "Unhealthy pods found without a classified signature."})
    return causes


def build_markdown_report(audit: dict[str, Any]) -> str:
    lines = []
    write_allowed = [check for check in audit["rbac"]["write"] if check["allowed"]]
    lines.append(f"# Kubernetes Health Audit: {audit['context']}")
    lines.append("")
    lines.append(f"- Generated at: `{audit['generated_at']}`")
    lines.append(f"- Target context: `{audit['context']}`")
    lines.append(f"- Current kubectl context: `{audit['current_context']}`")
    lines.append("")
    if write_allowed:
        lines.append("## Safety warning")
        lines.append("")
        lines.append("- The audit script stayed read-only, but the current Kubernetes identity still has write permissions.")
        lines.append("- This means the workflow is protected by script guardrails, not by RBAC alone.")
        lines.append("")
    lines.append("## Overall status")
    lines.append("")
    lines.append(f"- Nodes not ready: `{len(audit['unhealthy']['nodes'])}`")
    lines.append(f"- Pods needing attention: `{len(audit['unhealthy']['pods'])}`")
    lines.append(f"- Deployments not fully available: `{len(audit['unhealthy']['deployments'])}`")
    lines.append(f"- Failed jobs: `{len(audit['unhealthy']['jobs'])}`")
    lines.append(f"- Recent warning events captured: `{len(audit['warnings'])}`")
    lines.append("")
    lines.append("## RBAC preflight")
    lines.append("")
    for check in audit["rbac"]["read"]:
        lines.append(f"- Read `{check['verb']} {check['resource']}`: `{'yes' if check['allowed'] else 'no'}`")
    for check in audit["rbac"]["write"]:
        lines.append(f"- Write `{check['verb']} {check['resource']}`: `{'yes' if check['allowed'] else 'no'}`")
    lines.append("")

    if audit["unhealthy"]["nodes"]:
        lines.append("## Unhealthy nodes")
        lines.append("")
        for node in audit["unhealthy"]["nodes"]:
            lines.append(f"- `{node['name']}` not ready: {node.get('reason') or 'unknown reason'}")
        lines.append("")

    if audit["unhealthy"]["deployments"]:
        lines.append("## Deployment issues")
        lines.append("")
        for deployment in audit["unhealthy"]["deployments"]:
            lines.append(
                f"- `{deployment['namespace']}/{deployment['name']}` available `{deployment['available']}` of `{deployment['desired']}`"
            )
        lines.append("")

    if audit["unhealthy"]["jobs"]:
        lines.append("## Failed jobs")
        lines.append("")
        for job in audit["unhealthy"]["jobs"]:
            lines.append(f"- `{job['namespace']}/{job['name']}` failed count `{job['failed']}`")
        lines.append("")

    if audit["unhealthy"]["pods"]:
        lines.append("## Pods needing attention")
        lines.append("")
        for pod in audit["unhealthy"]["pods"][:10]:
            details = []
            if pod["waiting_reasons"]:
                details.append("waiting=" + ",".join(pod["waiting_reasons"]))
            if pod["terminated_reasons"]:
                details.append("terminated=" + ",".join(pod["terminated_reasons"]))
            details.append(f"restarts={pod['restarts']}")
            lines.append(
                f"- `{pod['namespace']}/{pod['name']}` phase `{pod['phase']}`, ready `{pod['ready']}`, " + ", ".join(details)
            )
        lines.append("")

    if audit["warnings"]:
        lines.append("## Recent warning events")
        lines.append("")
        for event in audit["warnings"][-10:]:
            lines.append(f"- `{event['timestamp']}` `{event['object']}` `{event['reason']}`: {event['message']}")
        lines.append("")

    lines.append("## Likely causes")
    lines.append("")
    if audit["likely_causes"]:
        for cause in audit["likely_causes"]:
            lines.append(f"- {cause['cause']}: `{cause['evidence']}`")
    else:
        lines.append("- No obvious cause signature detected from the collected evidence.")
    lines.append("")

    lines.append("## Safe next steps")
    lines.append("")
    lines.append("- Review the JSON artifact for full raw evidence if deeper analysis is needed.")
    if write_allowed:
        lines.append("- Move this workflow to a stricter read-only kubeconfig, IAM role, or Kubernetes RBAC binding before treating it as strongly isolated.")
    else:
        lines.append("- The current Kubernetes identity appears read-only for the sampled write checks, which is the preferred setup for this workflow.")
    lines.append("- For persistent workload failures, inspect the owning deployment or cronjob configuration in Git rather than changing live resources from this workflow.")
    lines.append("")
    return "\n".join(lines)


def write_outputs(output_dir: Path, context: str, audit: dict[str, Any]) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_context = context.replace("/", "-").replace("\\", "-")
    json_path = output_dir / f"{timestamp}-{safe_context}-audit.json"
    md_path = output_dir / f"{timestamp}-{safe_context}-audit.md"
    json_path.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    md_path.write_text(build_markdown_report(audit), encoding="utf-8")
    return json_path, md_path


def main() -> None:
    setup_logging()
    args = parse_args()
    require_readonly_context_name(args.context)

    current_context = run_kubectl(args.context, ["config", "current-context"], check=False)
    cluster_info = run_kubectl(args.context, ["cluster-info"], check=False, timeout=45)
    if cluster_info.returncode != 0:
        raise SystemExit(f"Failed to reach cluster via context {args.context}: {cluster_info.stderr or cluster_info.stdout}")

    read_checks = [can_i(args.context, verb, resource, namespaced) for verb, resource, namespaced in READ_PERMISSION_CHECKS]
    write_checks = [can_i(args.context, verb, resource, namespaced) for verb, resource, namespaced in WRITE_PERMISSION_CHECKS]
    enforce_readonly_permissions(write_checks)

    nodes = run_json(args.context, ["get", "nodes"])
    pods_args = ["get", "pods", "-A"] if args.namespace is None else ["get", "pods"]
    deployments_args = ["get", "deployments", "-A"] if args.namespace is None else ["get", "deployments"]
    jobs_args = ["get", "jobs", "-A"] if args.namespace is None else ["get", "jobs"]
    cronjobs_args = ["get", "cronjobs", "-A"] if args.namespace is None else ["get", "cronjobs"]
    services_args = ["get", "services", "-A"] if args.namespace is None else ["get", "services"]
    ingress_args = ["get", "ingresses", "-A"] if args.namespace is None else ["get", "ingresses"]
    events_args = ["get", "events", "-A", "--field-selector", "type=Warning"] if args.namespace is None else ["get", "events", "--field-selector", "type=Warning"]

    pods = run_json(args.context, pods_args, namespace=args.namespace, timeout=45)
    deployments = run_json(args.context, deployments_args, namespace=args.namespace)
    jobs = run_json(args.context, jobs_args, namespace=args.namespace)
    cronjobs = run_json(args.context, cronjobs_args, namespace=args.namespace)
    services = run_json(args.context, services_args, namespace=args.namespace)
    ingresses = run_json(args.context, ingress_args, namespace=args.namespace)
    events = run_json(args.context, events_args, namespace=args.namespace, timeout=45)

    node_summaries, unhealthy_nodes = summarize_nodes(nodes)
    pod_summaries, unhealthy_pods = summarize_pods(pods)
    deployment_summaries, unhealthy_deployments = summarize_deployments(deployments)
    failed_jobs = summarize_jobs(jobs)
    warning_events = summarize_warning_events(events)

    pod_followups = []
    for pod in unhealthy_pods[: args.max_pod_followups]:
        pod_followups.append(
            collect_pod_followup(
                args.context,
                pod,
                max_log_lines=args.max_log_lines,
                skip_logs=args.skip_logs,
            )
        )

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
            "ingresses_count": len(ingresses.get("items", [])),
        },
        "unhealthy": {
            "nodes": unhealthy_nodes,
            "pods": unhealthy_pods,
            "deployments": unhealthy_deployments,
            "jobs": failed_jobs,
        },
        "warnings": warning_events,
        "pod_followups": pod_followups,
    }
    audit["likely_causes"] = infer_likely_causes(audit)

    json_path, md_path = write_outputs(args.output_dir, args.context, audit)
    print(f"Markdown report: {md_path}")
    print(f"JSON artifact: {json_path}")
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
