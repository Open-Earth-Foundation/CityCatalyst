# HIAP Cron Job - Check and Continue Processing

This cron job endpoint checks the status of pending HIAP prioritization jobs and starts new batches when ready.

**Schedule:** Runs every minute (configured in `k8s/cc-check-hiap-jobs.yml`)

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Logs](#logs)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Security](#security)

---

## Overview

**Purpose:** 
- Check PENDING jobs for completion
- Save results when jobs finish
- Start the next batch when no PENDING jobs exist

**Critical Constraint:** HIAP API can only handle **1 bulk job at a time, system-wide**. This cron enforces that limit.

---

## How It Works

Every minute, this cron does 2 main steps:

### Step 1: Check PENDING Jobs
```
Query database for rankings with status = PENDING
For each unique jobId:
  → Call HIAP API: /check_progress/{taskId}
  → If "pending": Do nothing, check again next minute
  → If "completed": Save results → PENDING → SUCCESS
  → If "failed": Mark as FAILURE with error message
  → If error (404, timeout, etc): Mark as FAILURE to unblock queue
```

**Critical:** When HIAP API throws an error (404 Task Not Found, timeout, etc.), 
the cron job marks all PENDING rankings with that jobId as FAILURE. This prevents 
stuck jobs from blocking the entire queue indefinitely.

### Step 2: Start Next Batch (if idle)
```
If NO PENDING jobs exist anywhere:
  → Find ONE project with TO_DO rankings (oldest first, FIFO)
  → Start ONE batch (100 cities: TO_DO → PENDING)
  → Send to HIAP API
  
If ANY PENDING jobs exist:
  → Skip this step (wait for completion)
  → Ensures only 1 batch runs at a time
```

### Response Metrics
```json
{
  "checkedJobs": 2,
  "completedJobs": 1,
  "startedBatches": 1,
  "durationMs": 1250
}
```

---

## Logs

### Healthy Execution

Every successful run produces these logs:

```json
{"level":"info","msg":"🔄 Cron job STARTED: Checking HIAP jobs"}
{"level":"info","pendingJobCount":1,"msg":"Found pending HIAP jobs"}
{"level":"info","jobId":"abc123","status":"completed","msg":"Checked bulk job status"}
{"level":"info","jobId":"abc123","msg":"Bulk action ranking job completed successfully"}
{"level":"info","msg":"No PENDING jobs system-wide. Checking for TO_DO rankings to start next batch."}
{"level":"info","projectId":"...","batchSize":100,"taskId":"def456","msg":"Started next batch"}
{"level":"info","checkedJobs":1,"completedJobs":1,"startedBatches":1,"durationMs":1245,"msg":"✅ Cron job FINISHED successfully"}
```

**Key markers:**
- ✅ `🔄 Cron job STARTED` - Job execution began
- ✅ `✅ Cron job FINISHED successfully` - Job completed normally
- ✅ `durationMs: 1245` - Execution time (1-10 seconds is normal)

### Warning Signs

```json
// ❌ Database not initialized
{"level":"error","msg":"Database not initialized"}
{"level":"error","msg":"❌ Cron job FINISHED with error"}

// ❌ HIAP API issues
{"level":"error","error":"connect ETIMEDOUT","msg":"Error checking/processing HIAP job"}

// ❌ Long execution time
{"durationMs":58000,...}  // Should be < 10 seconds normally
```

**Missing START/FINISH logs?** Cron isn't running!

---

## Monitoring

### Quick Health Check (30 seconds)

```bash
# 1. Is cron running? (LAST SCHEDULE should be < 1 minute ago)
kubectl get cronjob citycatalyst-check-hiap-jobs

# 2. Recent jobs succeeding? (COMPLETIONS should be 1/1)
kubectl get jobs | grep check-hiap | head -5

# 3. Logs showing START/FINISH? (should see pairs every minute)
kubectl logs -l job-name=citycatalyst-check-hiap-jobs --tail=20 | grep -E "STARTED|FINISHED"
```

**Expected output:**
```
... "🔄 Cron job STARTED: Checking HIAP jobs"
... "✅ Cron job FINISHED successfully"
... "🔄 Cron job STARTED: Checking HIAP jobs"
... "✅ Cron job FINISHED successfully"
```

You should see pairs of START/FINISH logs every ~1 minute.

---

### Kubernetes Checks

#### 1. CronJob Status

```bash
kubectl get cronjobs citycatalyst-check-hiap-jobs
```

**Expected output:**
```
NAME                          SCHEDULE      SUSPEND   ACTIVE   LAST SCHEDULE   AGE
citycatalyst-check-hiap-jobs  */1 * * * *   False     0        42s             5d
```

**What to check:**
- ✅ `SUSPEND: False` - CronJob is active
- ✅ `LAST SCHEDULE: <1 minute ago` - Recently executed
- ❌ `SUSPEND: True` - CronJob is paused!
- ❌ `LAST SCHEDULE: -` - Never ran!
- ❌ `LAST SCHEDULE: 10m ago` - Hasn't run in 10 minutes!

#### 2. Recent Executions

```bash
# List recent job runs
kubectl get jobs | grep check-hiap

# With more detail
kubectl get jobs -l job=check-hiap-jobs --sort-by=.metadata.creationTimestamp | tail -10
```

**Expected output:**
```
NAME                                    COMPLETIONS   DURATION   AGE
citycatalyst-check-hiap-jobs-28934710   1/1          5s         2m
citycatalyst-check-hiap-jobs-28934709   1/1          4s         3m
```

**What to check:**
- ✅ `COMPLETIONS: 1/1` - Job succeeded
- ✅ `DURATION: 4-10s` - Normal execution time
- ❌ `COMPLETIONS: 0/1` - Job failed or still running
- ❌ `DURATION: 60s` - Job is taking too long

---

## Daily Monitoring Checklist

### 30-Second Health Check

```bash
# 1. Cron running? (LAST SCHEDULE < 1 minute ago)
kubectl get cronjob citycatalyst-check-hiap-jobs

# 2. Recent jobs succeeding? (COMPLETIONS: 1/1)
kubectl get jobs | grep check-hiap | head -3

# 3. Logs showing START/FINISH pairs?
kubectl logs -l job-name=citycatalyst-check-hiap-jobs --tail=20 | grep -E "STARTED|FINISHED"
```

**All green?** ✅ System is healthy!

**Any red flags?** ❌ See troubleshooting section above.

---

## Related Documentation

- **API Documentation**: [../../v1/admin/bulk-hiap-prioritization/README.md](../../v1/admin/bulk-hiap-prioritization/README.md) - Full system documentation
- **Kubernetes Config**: `k8s/cc-check-hiap-jobs.yml` - CronJob definition
- **Ingress Security**: `k8s/cc-ingress.yml` - Network-level protection
- **Tests**: `app/tests/api/bulk-hiap-prioritization.jest.ts` - Integration tests
