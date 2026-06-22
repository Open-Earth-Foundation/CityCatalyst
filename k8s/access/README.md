# Kubernetes Access Manifests

This folder contains Kubernetes RBAC manifests used for cluster access setup rather than application deployment.

## Purpose

The main use case right now is the team read-only inspection role for EKS:

- IAM role: `EKSReadOnlyInspectRoleDev`
- EKS access entry group: `k8s-readonly-audit`
- Kubernetes RBAC manifest: `k8s-readonly-audit-dev.yaml`

The same RBAC pattern can also be applied to prod with:

- IAM role: `EKSReadOnlyInspectRoleProd`
- Kubernetes RBAC manifest: `k8s-readonly-audit-prod.yaml`

This setup has two required parts:

1. AWS/EKS identity setup:
   - create the IAM read-only inspection role
   - create the EKS access entry for that role
   - map that access entry to the Kubernetes group `k8s-readonly-audit`
2. In-cluster Kubernetes RBAC setup:
   - apply `k8s-readonly-audit-dev.yaml`
   - this creates the `ClusterRole` and `ClusterRoleBinding`
   - this is the part that actually grants the mapped role read-only Kubernetes permissions inside the cluster

The IAM role alone is not enough. It controls who can authenticate into EKS. The RBAC manifest controls what that identity can read once Kubernetes accepts it.

This README is the repo-local reference for the Kubernetes RBAC manifests.
For the full end-to-end setup and teammate onboarding flow, including IAM role creation, EKS access entries, local AWS CLI profiles, and kubeconfig setup, see the Notion page:

- `EKS Read-Only Inspection Context Setup`: https://app.notion.com/p/360eb557728b81efa62ff467c633c17b

The access flow is:

1. AWS IAM role authenticates to EKS.
2. The EKS access entry maps that role to the Kubernetes group `k8s-readonly-audit`.
3. The `ClusterRoleBinding` in `k8s-readonly-audit-dev.yaml` binds that group to the `k8s-readonly-audit` `ClusterRole`.
4. That `ClusterRole` grants the actual read-only Kubernetes permissions used for health inspection.

## Why this exists

This is meant for safe cluster inspection workflows such as:

- listing pods, deployments, jobs, services, and ingress
- reading service accounts, configmaps, PVCs, and PVs when they are relevant to diagnosis
- reading warning events
- reading pod logs
- checking node and workload health

The goal is not just passive listing. This RBAC shape is intended to support a deeper read-only incident workflow where an audit agent can follow likely root-cause trails across workload specs, service accounts, autoscaling objects, storage references, and recent warning history without ever mutating cluster state.

In other words, this manifest is the in-cluster permission layer for the newly created read-only IAM role. Without this RBAC, the role may be able to reach the cluster but still not be authorized to read the Kubernetes resources needed for inspection.

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

Apply the prod RBAC manifest with an admin-capable context:

```powershell
kubectl --context prod-cluster apply -f .\k8s\access\k8s-readonly-audit-prod.yaml
```

## Notes

- This folder is separate from the existing workload manifests under `k8s/`, `k8s/test/`, and `k8s/prod/`.
- Keep these files in version control so cluster access changes are documented and repeatable.
- Keep both dev and prod RBAC manifests here rather than keeping the setup only in live cluster state.
- Use the Notion page for onboarding and operational setup steps; use this README for the repo-managed RBAC manifests and apply commands.
