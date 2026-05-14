# Kubernetes Access Manifests

This folder contains Kubernetes RBAC manifests used for cluster access setup rather than application deployment.

## Purpose

The main use case right now is the team read-only inspection role for EKS:

- IAM role: `EKSReadOnlyInspectRoleDev`
- EKS access entry group: `k8s-readonly-audit`
- Kubernetes RBAC manifest: `k8s-readonly-audit-dev.yaml`

The access flow is:

1. AWS IAM role authenticates to EKS.
2. The EKS access entry maps that role to the Kubernetes group `k8s-readonly-audit`.
3. The `ClusterRoleBinding` in `k8s-readonly-audit-dev.yaml` grants that group read-only access to cluster resources used for health inspection.

## Why this exists

This is meant for safe cluster inspection workflows such as:

- listing pods, deployments, jobs, services, and ingress
- reading service accounts, configmaps, PVCs, and PVs when they are relevant to diagnosis
- reading warning events
- reading pod logs
- checking node and workload health

The goal is not just passive listing. This RBAC shape is intended to support a deeper read-only incident workflow where an audit agent can follow likely root-cause trails across workload specs, service accounts, autoscaling objects, storage references, and recent warning history without ever mutating cluster state.

It intentionally does not include Secret reads. Secret names may still appear indirectly in workload specs or events, but the read-only audit role should not fetch Secret objects or Secret data directly.

It is not meant for writes such as:

- `kubectl apply`
- `kubectl delete`
- `kubectl patch`
- `kubectl scale`
- `kubectl exec`

## Apply

Apply the dev RBAC manifest with an admin-capable context:

```powershell
kubectl --context dev-cluster apply -f .\k8s\access\k8s-readonly-audit-dev.yaml
```

## Notes

- This folder is separate from the existing workload manifests under `k8s/`, `k8s/test/`, and `k8s/prod/`.
- Keep these files in version control so cluster access changes are documented and repeatable.
- If prod should use the same RBAC model, add a corresponding prod file here rather than keeping the setup only in live cluster state.
