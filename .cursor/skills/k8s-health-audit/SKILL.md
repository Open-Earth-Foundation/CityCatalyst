---
name: k8s-health-audit
description: Run a read-only Kubernetes health audit against an explicit readonly cluster context such as `dev-cluster-readonly` or `prod-cluster-readonly`. Use when the user wants an automated cluster/pod health check, diagnosis of failing workloads, or a report of likely causes without making any write changes.
---

# k8s-health-audit

Use this skill when the user wants a Kubernetes health inspection or incident-style diagnosis.

## Primary objective

Inspect cluster and workload health, gather evidence for unhealthy resources, and return a concise report with likely causes.

This skill is read-only.

## Hard guardrails

- Never run mutating Kubernetes commands.
- Never run `kubectl config use-context`.
- Never run `kubectl exec`, `kubectl cp`, or `kubectl port-forward`.
- Never run `apply`, `patch`, `edit`, `delete`, `scale`, `rollout restart`, `set image`, `annotate`, or `label`.
- Always target an explicit context via `--context <name>`.
- Prefer the bundled Python script over ad hoc shell commands.
- Only run against readonly contexts such as `dev-cluster-readonly` or `prod-cluster-readonly`.
- If the target context is not a readonly context, fail instead of falling back to a writable/admin context.
- If the sampled write-permission checks return `yes`, fail instead of continuing.

If the user asks for a write action, stop and ask for a separate workflow.

## Preferred workflow

1. Confirm the target context from the user request or ask for it if missing.
2. Run the bundled script:

```bash
python .cursor/skills/k8s-health-audit/scripts/k8s_health_audit.py --context dev-cluster-readonly
```

3. Read the generated report and summarize:
- overall cluster status
- unhealthy resources
- strongest evidence
- likely root cause
- safe next checks

## What the script does

- Verifies current reachability of the target cluster.
- Verifies the target context is a readonly context before doing any cluster inspection.
- Runs `kubectl auth can-i` checks for read permissions and common write permissions.
- Refuses to continue if any sampled write permission is still allowed.
- Collects nodes, pods, deployments, jobs, cronjobs, services, ingress, and warning events.
- Identifies unhealthy resources such as:
  - non-ready nodes
  - pods not in `Running` or `Succeeded`
  - deployments with unavailable replicas
  - failed jobs
- Follows up automatically with `describe` and `logs` for a bounded number of unhealthy resources.
- Produces a Markdown report and a JSON artifact.

## Output expectations

Return a concise report with sections like:

- Context
- Overall status
- Findings
- Likely causes
- Safe next steps

Be explicit about uncertainty. If logs are unavailable or RBAC blocks inspection, say that clearly.

## Notes for this repo

- The common readonly contexts here should be `dev-cluster-readonly` and `prod-cluster-readonly`.
- Prefer passing `--context` instead of changing the active kubeconfig context.
- Cluster/account reference details are in `references/oef-clusters.md` if needed.
