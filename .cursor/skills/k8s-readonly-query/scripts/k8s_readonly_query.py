#!/usr/bin/env python3
"""
Brief: Answer one targeted Kubernetes question with readonly guardrails and evidence output.

Inputs:
- CLI args:
  - `--context`: Required kubeconfig context. Must end with `-readonly`.
  - `--namespace`: Optional namespace hint. If omitted, the script discovers the namespace first.
  - `--question`: Required user question to answer.
  - `--kind`: Optional resource kind hint (for example: service, pod, ingress, deployment, node).
  - `--name`: Optional resource name hint.
  - `--output-dir`: Optional output folder for markdown/json artifacts.
    Defaults to `.cursor/skills/k8s-readonly-query/logs`.
  - `--max-log-lines`: Optional tail line count for pod logs in diagnose mode. Default `120`.
- Files/paths:
  - Reads kubeconfig/auth state already configured for `kubectl`.
- Env vars:
  - No required environment variables.

Outputs:
- Markdown report with direct answer, evidence checked, confidence, and uncertainty.
- JSON artifact with structured evidence and command results.
- Stdout with artifact paths and short status line.

Usage (from project root):
- python .cursor/skills/k8s-readonly-query/scripts/k8s_readonly_query.py --context dev-cluster-readonly --question "what internal address does service api have?" --kind service --name api
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


LOGGER = logging.getLogger("k8s_readonly_query")
SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
DEFAULT_OUTPUT_DIR = SKILL_ROOT / "logs"
READONLY_CONTEXT_SUFFIX = "-readonly"
WRITE_VERBS = {
    "annotate",
    "apply",
    "create",
    "delete",
    "edit",
    "exec",
    "label",
    "patch",
    "port-forward",
    "replace",
    "rollout",
    "scale",
    "set",
}
FORBIDDEN_FLAGS = {"--force", "--prune", "--overwrite", "--grace-period"}
WRITE_PERMISSION_CHECKS = [
    ("create", "deployments.apps", True),
    ("delete", "pods", True),
    ("patch", "deployments.apps", True),
    ("update", "configmaps", True),
]
READ_PERMISSION_CHECKS = [
    ("get", "pods", True),
    ("get", "services", True),
    ("get", "endpoints", True),
    ("get", "ingresses.networking.k8s.io", True),
    ("get", "events", True),
    ("get", "nodes", False),
]


class KubectlError(RuntimeError):
    """Raised when kubectl command execution fails or violates guardrails."""


@dataclass
class CommandResult:
    args: list[str]
    returncode: int
    stdout: str
    stderr: str


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for a single-question readonly Kubernetes investigation."""
    parser = argparse.ArgumentParser(
        description="Answer one targeted Kubernetes question in readonly mode."
    )
    parser.add_argument(
        "--context",
        required=True,
        help="Readonly kubeconfig context to inspect (for example: dev-cluster-readonly).",
    )
    parser.add_argument(
        "--namespace",
        default=None,
        help="Optional namespace hint for namespaced lookups. If omitted, namespace discovery runs first.",
    )
    parser.add_argument(
        "--question",
        required=True,
        help="Natural language question to answer.",
    )
    parser.add_argument(
        "--kind",
        default=None,
        help="Optional resource kind hint (service, pod, ingress, deployment, node).",
    )
    parser.add_argument(
        "--name",
        default=None,
        help="Optional resource name hint.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where markdown and JSON artifacts are written.",
    )
    parser.add_argument(
        "--max-log-lines",
        type=int,
        default=120,
        help="Maximum lines to fetch for each pod log call in diagnose mode.",
    )
    return parser.parse_args()


def setup_logging() -> None:
    """Configure logging for concise CLI output."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def require_readonly_context_name(context: str) -> None:
    """Fail fast when the requested context is not a readonly context name."""
    if not context.endswith(READONLY_CONTEXT_SUFFIX):
        raise KubectlError(
            "Refusing to run against a non-readonly context. "
            f"Expected a context ending with '{READONLY_CONTEXT_SUFFIX}', got '{context}'."
        )


def validate_kubectl_args(args: list[str]) -> None:
    """Reject unsafe kubectl verb/flag usage before command execution."""
    if not args:
        raise KubectlError("Refusing to run empty kubectl command.")
    if any(flag in FORBIDDEN_FLAGS for flag in args):
        raise KubectlError(
            f"Refusing kubectl command with forbidden flag: {' '.join(args)}"
        )
    if "exec" in args or "cp" in args or "port-forward" in args:
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
    """Run a guarded kubectl command with explicit context and optional namespace."""
    validate_kubectl_args(args)
    cmd = ["kubectl", "--context", context]
    if namespace:
        cmd.extend(["-n", namespace])
    cmd.extend(args)
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
) -> dict[str, Any]:
    """Run kubectl command and parse JSON output."""
    result = run_kubectl(
        context,
        args + ["-o", "json"],
        namespace=namespace,
        timeout=timeout,
    )
    return json.loads(result.stdout or "{}")


def can_i(context: str, verb: str, resource: str, namespaced: bool) -> dict[str, Any]:
    """Execute a kubectl auth can-i check and normalize the response."""
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
    """Abort when sampled write permissions are still granted."""
    allowed = [item for item in write_checks if item["allowed"]]
    if allowed:
        details = ", ".join(f"{item['verb']} {item['resource']}" for item in allowed)
        raise KubectlError(
            "Refusing to continue because sampled write permissions are allowed: "
            f"{details}"
        )


def normalize_kind(kind: str | None) -> str | None:
    """Normalize common resource kind aliases to canonical values."""
    if not kind:
        return None
    value = kind.strip().lower()
    aliases = {
        "svc": "service",
        "services": "service",
        "po": "pod",
        "pods": "pod",
        "ing": "ingress",
        "ingresses": "ingress",
        "deploy": "deployment",
        "deployments": "deployment",
        "node": "node",
        "nodes": "node",
    }
    return aliases.get(value, value)


def classify_mode(question: str, kind: str | None) -> str:
    """Classify investigation mode from question intent and kind hints."""
    q = question.lower()
    if kind in {"ingress"} or any(word in q for word in ["ingress", "route", "routing", "backend"]):
        return "routing"
    if kind in {"pod", "deployment"} or any(
        word in q
        for word in ["restart", "crash", "pending", "failing", "error", "logs", "not running"]
    ):
        return "diagnose"
    return "lookup"


def best_effort_jsonpath(
    context: str, namespace: str, args: list[str], jsonpath: str
) -> CommandResult:
    """Run a best-effort jsonpath query without throwing on not-found style failures."""
    return run_kubectl(
        context,
        args + ["-o", f"jsonpath={jsonpath}"],
        namespace=namespace,
        check=False,
    )


def discover_namespace(
    context: str, kind: str | None, name: str | None
) -> tuple[str | None, str | None, list[dict[str, Any]], list[str]]:
    """Discover namespace from resource name/kind using all-namespaces readonly lookups."""
    evidence: list[dict[str, Any]] = []
    uncertainties: list[str] = []
    namespaced_kind_map = {
        "service": "svc",
        "pod": "pod",
        "ingress": "ingress",
        "deployment": "deployment",
    }
    if not kind or not name:
        return None, None, evidence, uncertainties
    short_kind = namespaced_kind_map.get(kind)
    if not short_kind:
        return None, None, evidence, uncertainties

    listing = run_kubectl(
        context,
        ["get", short_kind, "-A", "-o", "json"],
        check=False,
        timeout=45,
    )
    evidence.append({"title": f"Namespace discovery for {kind}/{name}", "result": listing.__dict__})
    if listing.returncode != 0:
        uncertainties.append(listing.stderr or "Namespace discovery command failed.")
        return None, None, evidence, uncertainties
    try:
        data = json.loads(listing.stdout or "{}")
    except json.JSONDecodeError:
        uncertainties.append("Namespace discovery returned non-JSON output.")
        return None, None, evidence, uncertainties

    matching_items = [
        item
        for item in data.get("items", [])
        if item.get("metadata", {}).get("name") == name
        and item.get("metadata", {}).get("namespace")
    ]
    if not matching_items and kind == "service":
        # Fallback 1: service selector label app=<name>
        matching_items = [
            item
            for item in data.get("items", [])
            if item.get("spec", {}).get("selector", {}).get("app") == name
            and item.get("metadata", {}).get("namespace")
        ]
    if not matching_items:
        # Fallback 2: name contains hint token
        lowered = name.lower()
        matching_items = [
            item
            for item in data.get("items", [])
            if lowered in str(item.get("metadata", {}).get("name", "")).lower()
            and item.get("metadata", {}).get("namespace")
        ]

    unique_candidates = sorted(
        set(item.get("metadata", {}).get("namespace") for item in matching_items)
    )
    unique_names = sorted(
        set(item.get("metadata", {}).get("name") for item in matching_items)
    )
    if len(unique_candidates) == 1 and len(unique_names) == 1:
        return unique_candidates[0], unique_names[0], evidence, uncertainties
    if len(unique_candidates) > 1:
        uncertainties.append(
            f"Resource name `{name}` matched multiple namespaces: {', '.join(unique_candidates)}."
        )
    if len(unique_names) > 1:
        uncertainties.append(
            f"Resource hint `{name}` matched multiple resource names: {', '.join(unique_names)}."
        )
    return None, None, evidence, uncertainties


def run_lookup(
    context: str,
    namespace: str | None,
    question: str,
    kind: str | None,
    name: str | None,
) -> dict[str, Any]:
    """Collect narrow evidence for fact lookup questions."""
    evidence: list[dict[str, Any]] = []
    uncertainties: list[str] = []
    direct_answer = "No definitive answer yet."

    if kind == "service" and name and namespace:
        get_wide = run_kubectl(context, ["get", "svc", name, "-o", "wide"], namespace=namespace)
        evidence.append({"title": "Service details", "result": get_wide.__dict__})

        cluster_ip = best_effort_jsonpath(
            context,
            namespace,
            ["get", "svc", name],
            "{.spec.clusterIP}",
        )
        evidence.append({"title": "Service ClusterIP", "result": cluster_ip.__dict__})

        internal_host = f"{name}.{namespace}.svc.cluster.local"
        if cluster_ip.returncode == 0 and cluster_ip.stdout:
            direct_answer = (
                f"Service `{name}` resolves internally as `{internal_host}` and has "
                f"ClusterIP `{cluster_ip.stdout}`."
            )
        else:
            direct_answer = (
                f"Service `{name}` internal DNS should be `{internal_host}`, but ClusterIP lookup failed."
            )
            uncertainties.append(cluster_ip.stderr or "ClusterIP field was empty.")

        endpoints = run_kubectl(
            context,
            ["get", "endpoints", name, "-o", "wide"],
            namespace=namespace,
            check=False,
        )
        evidence.append({"title": "Service endpoints", "result": endpoints.__dict__})
        if endpoints.returncode != 0:
            uncertainties.append(endpoints.stderr or "Endpoints lookup failed.")
    elif kind == "pod" and name and namespace:
        pod_wide = run_kubectl(context, ["get", "pod", name, "-o", "wide"], namespace=namespace)
        evidence.append({"title": "Pod placement", "result": pod_wide.__dict__})
        node_name = best_effort_jsonpath(
            context,
            namespace,
            ["get", "pod", name],
            "{.spec.nodeName}",
        )
        evidence.append({"title": "Pod node name", "result": node_name.__dict__})
        if node_name.returncode == 0 and node_name.stdout:
            direct_answer = f"Pod `{name}` is currently scheduled on node `{node_name.stdout}`."
        else:
            direct_answer = f"Pod `{name}` lookup succeeded but node placement could not be resolved."
            uncertainties.append(node_name.stderr or "Node field was empty.")
    else:
        if namespace:
            services = run_kubectl(context, ["get", "svc", "-o", "wide"], namespace=namespace, check=False)
            pods = run_kubectl(context, ["get", "pods", "-o", "wide"], namespace=namespace, check=False)
            direct_answer = (
                "Question appears to be a lookup, but resource kind/name were missing. "
                "Collected namespace service and pod inventory for target discovery."
            )
        else:
            services = run_kubectl(context, ["get", "svc", "-A", "-o", "wide"], check=False)
            pods = run_kubectl(context, ["get", "pods", "-A", "-o", "wide"], check=False)
            direct_answer = (
                "Question appears to be a lookup and namespace was not resolved yet. "
                "Collected all-namespace service and pod inventory for discovery."
            )
        evidence.append({"title": "Namespace services (wide)", "result": services.__dict__})
        evidence.append({"title": "Namespace pods (wide)", "result": pods.__dict__})
        uncertainties.append("Provide --kind and --name to get a precise direct answer.")

    confidence = "high" if not uncertainties else "medium"
    return {
        "mode": "lookup",
        "direct_answer": direct_answer,
        "evidence": evidence,
        "uncertainties": uncertainties,
        "confidence": confidence,
        "question": question,
    }


def run_diagnose(
    context: str,
    namespace: str | None,
    question: str,
    kind: str | None,
    name: str | None,
    max_log_lines: int,
) -> dict[str, Any]:
    """Collect readonly diagnostic evidence for pod/workload health questions."""
    evidence: list[dict[str, Any]] = []
    uncertainties: list[str] = []
    direct_answer = "No definitive diagnosis yet."

    if kind == "pod" and name and namespace:
        pod = run_kubectl(context, ["get", "pod", name, "-o", "wide"], namespace=namespace)
        evidence.append({"title": "Pod status", "result": pod.__dict__})
        describe = run_kubectl(context, ["describe", "pod", name], namespace=namespace, check=False)
        evidence.append({"title": "Pod describe", "result": describe.__dict__})
        logs_now = run_kubectl(
            context,
            ["logs", name, f"--tail={max_log_lines}"],
            namespace=namespace,
            check=False,
        )
        evidence.append({"title": "Pod logs", "result": logs_now.__dict__})
        logs_prev = run_kubectl(
            context,
            ["logs", name, "--previous", f"--tail={max_log_lines}"],
            namespace=namespace,
            check=False,
        )
        evidence.append({"title": "Pod previous logs", "result": logs_prev.__dict__})
        events = run_kubectl(
            context,
            ["get", "events", "--field-selector", f"involvedObject.name={name}", "--sort-by=.lastTimestamp"],
            namespace=namespace,
            check=False,
        )
        evidence.append({"title": "Pod events", "result": events.__dict__})
        if "CrashLoopBackOff" in describe.stdout or "Back-off restarting" in describe.stdout:
            direct_answer = f"Pod `{name}` is in a crash/restart failure pattern based on describe/events evidence."
        elif "ImagePullBackOff" in describe.stdout or "ErrImagePull" in describe.stdout:
            direct_answer = f"Pod `{name}` is failing due to image pull issues."
        elif describe.returncode == 0:
            direct_answer = f"Pod `{name}` diagnostics collected; no single root cause signature was matched."
        else:
            uncertainties.append(describe.stderr or "Could not retrieve pod describe output.")
    else:
        if namespace:
            pods = run_kubectl(context, ["get", "pods", "-o", "wide"], namespace=namespace, check=False)
            events = run_kubectl(
                context,
                ["get", "events", "--sort-by=.lastTimestamp"],
                namespace=namespace,
                check=False,
            )
        else:
            pods = run_kubectl(context, ["get", "pods", "-A", "-o", "wide"], check=False)
            events = run_kubectl(
                context,
                ["get", "events", "-A", "--sort-by=.lastTimestamp"],
                check=False,
            )
        evidence.append({"title": "Namespace pod inventory", "result": pods.__dict__})
        evidence.append({"title": "Namespace events timeline", "result": events.__dict__})
        direct_answer = (
            "Question appears diagnostic, but no specific pod was provided. "
            "Collected namespace pod and event evidence for narrowing."
        )
        uncertainties.append("Provide --kind pod --name <pod> for a focused diagnosis.")

    confidence = "high" if not uncertainties else "medium"
    return {
        "mode": "diagnose",
        "direct_answer": direct_answer,
        "evidence": evidence,
        "uncertainties": uncertainties,
        "confidence": confidence,
        "question": question,
    }


def run_routing(
    context: str,
    namespace: str | None,
    question: str,
    kind: str | None,
    name: str | None,
) -> dict[str, Any]:
    """Collect routing evidence from ingress, service, and endpoints resources."""
    evidence: list[dict[str, Any]] = []
    uncertainties: list[str] = []
    direct_answer = "No definitive routing conclusion yet."

    if kind == "ingress" and name and namespace:
        ingress = run_kubectl(context, ["get", "ingress", name, "-o", "yaml"], namespace=namespace)
        evidence.append({"title": "Ingress spec", "result": ingress.__dict__})
        ingress_desc = run_kubectl(
            context,
            ["describe", "ingress", name],
            namespace=namespace,
            check=False,
        )
        evidence.append({"title": "Ingress describe", "result": ingress_desc.__dict__})

        backend_services = sorted(
            set(
                re.findall(
                    r"service:\s*\n\s*name:\s*([a-zA-Z0-9-]+)",
                    ingress.stdout,
                    flags=re.MULTILINE,
                )
            )
        )
        if backend_services:
            for svc in backend_services:
                svc_wide = run_kubectl(
                    context, ["get", "svc", svc, "-o", "wide"], namespace=namespace, check=False
                )
                evidence.append({"title": f"Backend service `{svc}`", "result": svc_wide.__dict__})
                endpoints = run_kubectl(
                    context, ["get", "endpoints", svc, "-o", "wide"], namespace=namespace, check=False
                )
                evidence.append({"title": f"Backend endpoints `{svc}`", "result": endpoints.__dict__})
            direct_answer = (
                f"Ingress `{name}` routes to backend service(s): {', '.join(backend_services)}. "
                "Service and endpoint evidence is included."
            )
        else:
            direct_answer = f"Ingress `{name}` was found, but no backend services were parsed from spec."
            uncertainties.append("Ingress backend extraction returned no matches.")
    else:
        if namespace:
            ingresses = run_kubectl(
                context, ["get", "ingress", "-o", "wide"], namespace=namespace, check=False
            )
            services = run_kubectl(
                context, ["get", "svc", "-o", "wide"], namespace=namespace, check=False
            )
        else:
            ingresses = run_kubectl(
                context, ["get", "ingress", "-A", "-o", "wide"], check=False
            )
            services = run_kubectl(
                context, ["get", "svc", "-A", "-o", "wide"], check=False
            )
        evidence.append({"title": "Namespace ingress inventory", "result": ingresses.__dict__})
        evidence.append({"title": "Namespace service inventory", "result": services.__dict__})
        direct_answer = (
            "Question appears routing-related, but no ingress name was provided. "
            "Collected ingress and service inventory for narrowing."
        )
        uncertainties.append("Provide --kind ingress --name <ingress> for precise routing analysis.")

    confidence = "high" if not uncertainties else "medium"
    return {
        "mode": "routing",
        "direct_answer": direct_answer,
        "evidence": evidence,
        "uncertainties": uncertainties,
        "confidence": confidence,
        "question": question,
    }


def build_markdown_report(report: dict[str, Any]) -> str:
    """Render a concise markdown answer with evidence and confidence markers."""
    lines: list[str] = []
    lines.append("# Kubernetes Readonly Query Report")
    lines.append("")
    lines.append("## Context")
    lines.append(f"- Context: `{report['context']}`")
    lines.append(f"- Namespace: `{report['namespace']}`")
    lines.append(f"- Mode: `{report['mode']}`")
    lines.append("")
    lines.append("## Question")
    lines.append(f"- {report['question']}")
    lines.append("")
    lines.append("## Direct Answer")
    lines.append(f"- {report['direct_answer']}")
    lines.append("")
    lines.append("## Confidence")
    lines.append(f"- {report['confidence']}")
    lines.append("")
    lines.append("## Evidence Checked")
    for item in report["evidence"]:
        lines.append(f"- {item['title']}: `{(' '.join(item['result']['args']))}`")
        if item["result"]["stdout"]:
            lines.append("  - stdout excerpt:")
            snippet = item["result"]["stdout"][:500]
            for snippet_line in snippet.splitlines():
                lines.append(f"    - {snippet_line}")
        if item["result"]["stderr"]:
            lines.append("  - stderr excerpt:")
            snippet = item["result"]["stderr"][:300]
            for snippet_line in snippet.splitlines():
                lines.append(f"    - {snippet_line}")
    lines.append("")
    lines.append("## Uncertainty")
    if report["uncertainties"]:
        for item in report["uncertainties"]:
            lines.append(f"- {item}")
    else:
        lines.append("- No material uncertainty from collected readonly evidence.")
    return "\n".join(lines)


def write_outputs(
    output_dir: Path, context: str, namespace: str | None, payload: dict[str, Any]
) -> tuple[Path, Path]:
    """Write markdown and JSON artifacts to the skill logs directory."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_context = context.replace("/", "-").replace("\\", "-")
    safe_namespace = (namespace or "all-namespaces").replace("/", "-").replace("\\", "-")
    json_path = output_dir / f"{timestamp}-{safe_context}-{safe_namespace}-readonly-query.json"
    md_path = output_dir / f"{timestamp}-{safe_context}-{safe_namespace}-readonly-query.md"
    payload["artifacts"] = {"markdown": str(md_path), "json": str(json_path)}
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(build_markdown_report(payload), encoding="utf-8")
    return json_path, md_path


def main() -> None:
    """Run readonly safety checks, dispatch query mode, and write report artifacts."""
    setup_logging()
    args = parse_args()
    kind = normalize_kind(args.kind)
    namespace = args.namespace

    require_readonly_context_name(args.context)

    current_context = run_kubectl(args.context, ["config", "current-context"], check=False)
    cluster_info = run_kubectl(args.context, ["cluster-info"], check=False, timeout=45)
    if cluster_info.returncode != 0:
        raise KubectlError(
            f"Failed to reach cluster via context {args.context}: "
            f"{cluster_info.stderr or cluster_info.stdout}"
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

    discovery_evidence: list[dict[str, Any]] = []
    discovery_uncertainties: list[str] = []
    resolved_name = args.name
    if namespace is None:
        discovered_namespace, discovered_name, discovery_evidence, discovery_uncertainties = discover_namespace(
            args.context, kind, args.name
        )
        if discovered_namespace:
            namespace = discovered_namespace
        if discovered_name:
            resolved_name = discovered_name

    mode = classify_mode(args.question, kind)
    if mode == "routing":
        result = run_routing(args.context, namespace, args.question, kind, resolved_name)
    elif mode == "diagnose":
        result = run_diagnose(
            args.context,
            namespace,
            args.question,
            kind,
            resolved_name,
            args.max_log_lines,
        )
    else:
        result = run_lookup(args.context, namespace, args.question, kind, resolved_name)

    if discovery_evidence:
        result["evidence"] = discovery_evidence + result["evidence"]
    if discovery_uncertainties:
        result["uncertainties"] = result["uncertainties"] + discovery_uncertainties

    payload: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "context": args.context,
        "namespace": namespace,
        "namespace_hint": args.namespace,
        "question": args.question,
        "mode": mode,
        "kind_hint": kind,
        "name_hint": args.name,
        "resolved_name": resolved_name,
        "current_context": current_context.stdout or current_context.stderr,
        "cluster_info": {
            "stdout": cluster_info.stdout,
            "stderr": cluster_info.stderr,
            "returncode": cluster_info.returncode,
        },
        "rbac": {"read": read_checks, "write": write_checks},
        "direct_answer": result["direct_answer"],
        "evidence": result["evidence"],
        "confidence": result["confidence"],
        "uncertainties": result["uncertainties"],
    }

    json_path, md_path = write_outputs(args.output_dir, args.context, namespace, payload)
    print(f"Markdown report: {md_path}")
    print(f"JSON artifact: {json_path}")
    print(f"Summary: mode={mode}, confidence={result['confidence']}")


if __name__ == "__main__":
    try:
        main()
    except KubectlError as exc:
        LOGGER.error("%s", exc)
        sys.exit(2)
    except subprocess.TimeoutExpired as exc:
        LOGGER.error("Timed out while running command: %s", exc.cmd)
        sys.exit(3)
