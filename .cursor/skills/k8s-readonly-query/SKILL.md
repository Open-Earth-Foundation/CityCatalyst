---
name: k8s-readonly-query
description: Answer a single Kubernetes question using readonly investigation and evidence-first output.
---

# k8s-readonly-query

Use this skill when the user asks a specific Kubernetes question about one resource, namespace, or hosting concern and wants a fast, targeted answer from an explicit readonly cluster context.

## Primary objective

Answer one concrete question with the minimum readonly evidence needed, while keeping strict Kubernetes safety guardrails.

Readonly access is mandatory for this workflow. Do not use it with writable or admin contexts.

Examples:

- "What internal address does service `api` have?"
- "Why is pod `worker-abc` restarting?"
- "Is ingress `city-app` routing to the expected service?"
- "Which node is this pod running on?"

## Investigation contract

The expected behavior is:

1. Restate the target question and identify the smallest relevant scope:
   - context
   - namespace
   - resource kind/name (if known)
2. Gather only the readonly evidence needed to answer that question.
3. Follow one related evidence trail further only when needed for confidence.
4. Stop once the question is answered with sufficient evidence.
5. Return:
   - direct answer
   - evidence used
   - confidence and uncertainty
   - next readonly step only if unresolved

This skill is not for broad incident sweeps. Use `k8s-health-audit` for cluster-wide triage.

## Hard guardrails

- Never run mutating Kubernetes commands.
- Never run `kubectl config use-context`.
- Never run `kubectl exec`, `kubectl cp`, or `kubectl port-forward`.
- Never run `apply`, `patch`, `edit`, `delete`, `scale`, `rollout restart`, `set image`, `annotate`, or `label`.
- Always target an explicit context via `--context <name>`.
- Only run against readonly contexts such as `dev-cluster-readonly` or `prod-cluster-readonly`.
- If the target context is not a readonly context, fail instead of falling back to a writable/admin context.
- If sampled write checks return `yes`, fail instead of continuing.

If the user asks for write actions, stop and request a separate workflow.

## Preferred workflow

1. Confirm inputs (ask only if missing):
   - context (must be readonly)
   - namespace (optional; discover first when missing)
   - exact question
   - optional resource kind/name
2. Run the bundled script:

```bash
python .cursor/skills/k8s-readonly-query/scripts/k8s_readonly_query.py --context dev-cluster-readonly --question "what internal address does service api have?" --kind service --name api
```

3. Read the generated markdown/json artifacts.
4. Return a concise evidence-backed answer.

### Example invocations

- Service address lookup:
  - `python .cursor/skills/k8s-readonly-query/scripts/k8s_readonly_query.py --context dev-cluster-readonly --question "what internal address does service api have?" --kind service --name api`
- Pod diagnosis:
  - `python .cursor/skills/k8s-readonly-query/scripts/k8s_readonly_query.py --context dev-cluster-readonly --question "why is pod worker-abc restarting?" --kind pod --name worker-abc`
- Prod routing question:
  - `python .cursor/skills/k8s-readonly-query/scripts/k8s_readonly_query.py --context prod-cluster-readonly --question "is ingress city-app routing correctly?" --kind ingress --name city-app`
- Unknown resource upfront (discovery-first):
  - `python .cursor/skills/k8s-readonly-query/scripts/k8s_readonly_query.py --context dev-cluster-readonly --question "what is failing in this namespace right now?"`

## Suggested readonly command patterns

Use these patterns as needed, always with `--context` and `-n` where applicable.

### Service/internal address questions

- `kubectl --context <ctx> -n <ns> get svc <name> -o wide`
- `kubectl --context <ctx> -n <ns> get svc <name> -o jsonpath="{.spec.clusterIP}"`
- `kubectl --context <ctx> -n <ns> describe svc <name>`
- `kubectl --context <ctx> -n <ns> get endpoints <name> -o wide`

### Pod state questions

- `kubectl --context <ctx> -n <ns> get pod <name> -o wide`
- `kubectl --context <ctx> -n <ns> describe pod <name>`
- `kubectl --context <ctx> -n <ns> logs <name> --tail=200`
- `kubectl --context <ctx> -n <ns> logs <name> --previous --tail=200`

### Deployment/workload linkage

- `kubectl --context <ctx> -n <ns> get deploy <name> -o wide`
- `kubectl --context <ctx> -n <ns> get rs -l <selector>`
- `kubectl --context <ctx> -n <ns> get pod -l <selector> -o wide`

### Ingress/routing questions

- `kubectl --context <ctx> -n <ns> get ingress <name> -o yaml`
- `kubectl --context <ctx> -n <ns> describe ingress <name>`
- `kubectl --context <ctx> -n <ns> get svc <backend-service> -o wide`

### Hosting/node/scheduling questions

- `kubectl --context <ctx> -n <ns> get pod <name> -o wide`
- `kubectl --context <ctx> get node <node-name> -o wide`
- `kubectl --context <ctx> describe node <node-name>`

### Event timeline

- `kubectl --context <ctx> -n <ns> get events --sort-by=.lastTimestamp`
- `kubectl --context <ctx> -n <ns> get events --field-selector involvedObject.name=<name>`

## Output expectations

Return a compact report:

- Context
- Question
- Direct answer
- Evidence checked
- Confidence and uncertainty
- Next readonly step (only if needed)

Be explicit when evidence is limited by RBAC, deleted resources, or missing historical logs.

## Notes for this repo

- Common readonly contexts are `dev-cluster-readonly` and `prod-cluster-readonly`.
- Cluster/account reference details are in `references/oef-clusters.md` if needed.
- Use direct targeted `kubectl` checks only against readonly contexts for single questions.
- Use `k8s-health-audit` only when the goal is broad health triage.
