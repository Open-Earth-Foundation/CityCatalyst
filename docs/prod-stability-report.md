# Production Stability Report — CityCatalyst Web

**Date:** 2026-06-22  
**Author:** Pablo Borges (CTO)  
**Status:** Active incident (recurring)  
**Severity:** High — partner-facing downtime reported monthly since April 2026

---

## TL;DR

The CityCatalyst production web pod (`cc-web-deploy`) is **OOM-killed every ~4 hours**, causing 503 errors. With only 1 replica, every restart = user-visible downtime. The node is overcommitted and has no room to absorb memory spikes.

**Fix:** Increase memory limit + add a second replica + rolling update strategy. PR attached.

---

## Evidence (collected 2026-06-22 from live prod cluster)

| Metric | Value | Verdict |
|--------|-------|---------|
| Pod restart count | **46 restarts in 2d 19h** | Critical |
| Last termination reason | `Exit Code: 137` (SIGKILL = OOM Kill) | Root cause confirmed |
| Avg time between restarts | ~90 minutes | |
| Memory limit | 1Gi | Too low for Next.js under production load |
| Memory request | 512Mi | Underprovisioned |
| Replicas | **1** | No redundancy — every restart = 503 |
| Node CPU limits allocated | **101%** (overcommitted) | Resource contention |
| Node memory limits allocated | **88%** | Near saturation |
| Node ZramHighUsage warning | Active | Memory pressure confirmed |
| Pod startup time | ~60s (Next.js cold start) | Downtime window per restart |

### Timeline of user reports

| Date | Reporter | Details |
|------|----------|---------|
| April 2026 | Sandino (partner) | Prod down |
| May 2026 | Sandino (partner) | Prod down |
| 2026-06-16 | Greta | "CityCatalyst prod is down" — 503 error |
| 2026-06-22 | Greta | "CityCatalyst is down" — reported to Milan & Pablo |

Martin's request: **"KPI of 0 downtimes per quarter in production, and absolute 0 on partners reporting it to us."**

---

## Root Cause Analysis

### Primary: OOM Kill (Exit Code 137)

The web pod's memory limit is **1Gi**. Under production traffic (multiple concurrent users, Next.js SSR, DB connections, API route handlers), memory usage exceeds this limit and the Linux OOM killer sends SIGKILL.

**Why it's intermittent:** Memory usage varies with traffic. During peaks (demos, partner sessions), it crosses 1Gi and gets killed. During quiet periods, it stays under.

### Secondary: Single Replica

With `replicas: 1`, there's no failover. When the pod is killed:
1. Users get 503 from NGINX Ingress (no healthy backend)
2. Kubernetes restarts the pod
3. Next.js takes ~60 seconds for cold start (build cache, DB connection, startup probe)
4. During those 60 seconds: total outage

### Contributing factors

1. **No explicit deploy strategy** — defaults allow the only pod to be killed during updates
2. **Node overcommitted at 101% CPU / 88% memory** — no headroom
3. **No PodDisruptionBudget** — voluntary disruptions (node upgrades, cluster scaling) can evict the pod freely
4. **Phantom pod consuming scheduler attention** — `openclimate-elasticsearch` has been Pending for **182 days**, with failed scheduling events every few minutes
5. **CronJob every minute** — `citycatalyst-check-hiap-jobs` fires every 60s, adding 1440 pod creates/deletes per day to the cluster
6. **HIAP_API_URL misconfiguration** — production web app points to `http://hiap-service-dev` (dev cluster) instead of `http://hiap-service-prod`

---

## Fix (this PR)

### Changes

| File | Change | Impact |
|------|--------|--------|
| `k8s/cc-web-deploy.yml` | `replicas: 1` → `2`, add rolling update strategy, increase memory | Eliminates downtime from restarts and deploys |
| `k8s/cc-web-pdb.yml` (new) | PodDisruptionBudget `minAvailable: 1` | Prevents eviction during cluster maintenance |
| `k8s/cc-check-hiap-jobs.yml` | `* * * * *` → `*/5 * * * *` | Reduces cron pod churn by 80% |

### Resource changes

| | Before | After |
|---|--------|-------|
| Replicas | 1 | **2** |
| Memory request | 512Mi | **1Gi** |
| Memory limit | 1Gi | **2Gi** |
| CPU request | 500m | 500m (unchanged) |
| CPU limit | 1000m | 1000m (unchanged) |
| Deploy strategy | (none / default) | RollingUpdate, maxUnavailable: 0 |
| PDB | (none) | minAvailable: 1 |

### Estimated cost impact

Additional ~512Mi-1Gi RAM on the node. The cluster already uses EKS Auto Mode (Bottlerocket), so if the current node can't fit 2 pods, a new node will be provisioned automatically. Estimated additional cost: **$30-60/month** (one additional `m5.large` or equivalent if needed).

---

## Additional recommendations (not in this PR)

| # | Action | Priority | Owner |
|---|--------|----------|-------|
| 1 | Fix `HIAP_API_URL` in `web-tag.yml` (point to `hiap-service-prod`) | High | Milan/Pablo |
| 2 | Set up uptime monitoring + Slack alerts (ticket ON-5862) | High | Milan |
| 3 | Move PostgreSQL to RDS (eliminate in-cluster single-point-of-failure) | Medium | Team decision |
| 4 | Install metrics-server on prod cluster (currently missing!) | Medium | Milan/Mirco |
| 5 | Delete phantom `openclimate-elasticsearch` deployment (Pending 182d) | Low | Pablo |
| 6 | Add HPA (Horizontal Pod Autoscaler) after metrics-server is installed | Low | Future sprint |

---

## How to validate

After merging and deploying:

```bash
# Check replicas are running
kubectl get pods -l app=cc-web -n default

# Check no more OOM kills
kubectl describe pod -l app=cc-web -n default | grep "Restart Count"

# Check PDB is active
kubectl get pdb -n default
```

**Success criteria:** 0 restarts over 7 days, 0 partner-reported downtime.

---

## References

- Slack thread: Greta/Joaquin/Martin discussion on recurring 503s
- Jira: ON-5862 (Slack alerts), ON-3553 (Maintenance epic)
- Martin's directive: "KPI of 0 downtimes per quarter"
- Milan's assessment: "liveness probes and taking a while to restart"
