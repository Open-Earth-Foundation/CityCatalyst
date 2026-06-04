---
name: k8s-health-audit
description: Run a read-only Kubernetes health audit against an explicit readonly cluster context such as `dev-cluster-readonly` or `prod-cluster-readonly`. Use when the user wants an automated cluster/pod health check, diagnosis of failing workloads, or a report of likely causes without making any write changes.
---

# k8s-health-audit

Use this skill when the user wants a Kubernetes health inspection or incident-style diagnosis.

## Primary objective

Inspect cluster and workload health, follow as many readonly evidence trails as possible, and return a guided report with issue-by-issue chapters, likely causes, automated findings, and concrete next steps only where the agent cannot continue safely on its own.

Readonly access is mandatory for this skill. Do not run it with writable or admin contexts.

## Investigation contract

The expected behavior is:

1. Sweep broadly for unhealthy resources and warning signals.
2. For each issue, follow every useful readonly trail the agent can reach on its own:
   - workload spec
   - owner resource
   - related pod state
   - `describe` output
   - current and previous logs when available
   - warning events
   - supporting readonly resources such as service accounts, daemonsets, HPA targets, configmaps, PVCs, and PVs when RBAC allows it
3. Stop only when one of these is true:
   - the agent has enough evidence to state a likely root cause
   - the agent has exhausted the useful readonly evidence available to it
   - the next meaningful step would require write access, higher privileges, deleted historical data, or a live failure that no longer exists
4. Only after that should the report hand off further action to the user.

The report should never ask the user to run a readonly command that the agent could have run itself.

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

1. Confirm the target context from the user request or ask for it if missing. The context must be a readonly alias.
2. Run the bundled script:

```bash
python .cursor/skills/k8s-health-audit/scripts/k8s_health_audit.py --context dev-cluster-readonly
```

3. Read the generated report and summarize:
- overall cluster status
- issue chapters
- strongest automated findings
- likely root causes
- concrete next steps that remain after readonly automation

## What the script does

- Verifies current reachability of the target cluster.
- Verifies the target context is a readonly context before doing any cluster inspection.
- Runs `kubectl auth can-i` checks for read permissions and common write permissions.
- Refuses to continue if any sampled write permission is still allowed.
- Collects nodes, pods, deployments, daemonsets, jobs, cronjobs, services, HPA, ingress, and warning events.
- Identifies unhealthy resources such as:
  - non-ready nodes
  - pods not in `Running` or `Succeeded`
  - deployments with unavailable replicas
  - failed jobs
- Follows up automatically with `describe`, logs, and related readonly evidence for unhealthy pods, unhealthy deployments, failed jobs, and selected supporting resources such as service accounts when RBAC allows it.
- Tries to resolve issue-specific root causes before handing off, for example by:
  - checking autoscaler workload wiring and logs for AWS credential failures
  - checking CNI daemonset state when sandbox creation fails
  - checking HPA target existence when autoscaling objects are broken
  - checking job-family templates and owners instead of only listing failed jobs
- Uses a very high pod follow-up limit by default so the audit is exhaustive in normal cluster sizes.
- If a safety limit is ever reached, the report calls that out explicitly so no hidden issues are mistaken for a full sweep.
- Pod logs are still collected with a bounded tail per call, and the report calls that out explicitly so log sampling is not mistaken for full log capture.
- Produces:
  - a main Markdown report for humans
  - a JSON artifact with structured evidence
  - a separate raw warnings artifact so the main report stays clean

## Output expectations

Return a concise report with sections like:

- Context
- Overall status
- Issue chapters
- Final next steps

Be explicit about uncertainty. If logs are unavailable, pods are already gone, or RBAC blocks deeper inspection, say that clearly and explain that this is why the workflow is handing off.

## Notes for this repo

- The common readonly contexts here should be `dev-cluster-readonly` and `prod-cluster-readonly`.
- Passing `--context` is required; do not change the active kubeconfig context.
- Cluster/account reference details are in `references/oef-clusters.md` if needed.
