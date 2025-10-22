# Bulk HIAP Prioritization API

## Overview

This endpoint enables bulk processing of High Impact Action Prioritization (HIAP) for multiple cities in a project simultaneously. It uses a batched, asynchronous approach to handle large volumes of cities (e.g., 5000+ cities) without overwhelming the HIAP service or timing out API requests.

## Endpoint

```
POST /api/v1/admin/bulk-hiap-prioritization
```

**Request Body:**
```json
{
  "projectId": "uuid",
  "year": 2024,
  "actionType": "mitigation" | "adaptation",
  "languages": ["en", "pt"]
}
```

**Response:**
```json
{
  "data": {
    "totalCities": 5000,
    "firstBatchSize": 100,
    "message": "First batch started. Cron job will process remaining batches automatically."
  }
}
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Bulk HIAP Prioritization Flow                      │
└─────────────────────────────────────────────────────────────────────────────┘

 USER                 API ENDPOINT              SERVICE                HIAP API
  │                        │                       │                       │
  │  POST /bulk-hiap       │                       │                       │
  ├───────────────────────>│                       │                       │
  │                        │                       │                       │
  │                        │  startBulkPrioritizationAsync()               │
  │                        ├──────────────────────>│                       │
  │                        │                       │                       │
  │                        │                       │ 1. Fetch all cities   │
  │                        │                       │    (e.g., 5000)       │
  │                        │                       │                       │
  │                        │                       │ 2. Create rankings    │
  │                        │                       │    status: TO_DO      │
  │                        │                       │    jobId: null        │
  │                        │                       │                       │
  │                        │                       │ 3. Process first      │
  │                        │                       │    batch (100 cities) │
  │                        │                       │                       │
  │                        │                       │ 4. Update: TO_DO      │
  │                        │                       │    → PENDING          │
  │                        │                       │                       │
  │                        │                       │  POST /bulk_prioritization
  │                        │                       ├──────────────────────>│
  │                        │                       │                       │
  │                        │                       │  { taskId: "abc123" } │
  │                        │                       │<──────────────────────┤
  │                        │                       │                       │
  │                        │                       │ 5. Update jobId       │
  │                        │                       │    = "abc123"         │
  │                        │                       │                       │
  │  { totalCities: 5000,  │                       │                       │
  │    firstBatchSize: 100 }                      │                       │
  │<───────────────────────┤                       │                       │
  │                        │                       │                       │
  │  Returns immediately   │                       │                       │
  │                        │                       │                       │
  
  ┌────────────────────────────────────────────────────────────────────────┐
  │  Remaining 4900 cities: status = TO_DO, waiting for cron job          │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## Cron Job Processing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              Cron Job: /api/cron/check-hiap-jobs (runs every minute)       │
└─────────────────────────────────────────────────────────────────────────────┘

CRON JOB              DATABASE              HIAP SERVICE           HIAP API
    │                     │                       │                    │
    │ Every minute        │                       │                    │
    ├─────────────────────>                       │                    │
    │                     │                       │                    │
    │ Find PENDING jobs   │                       │                    │
    │ (unique jobIds)     │                       │                    │
    ├────────────────────>│                       │                    │
    │                     │                       │                    │
    │  [{ jobId: "abc123",│                       │                    │
    │     type: "mitigation" }]                   │                    │
    │<────────────────────┤                       │                    │
    │                     │                       │                    │
    │ For each jobId:     │                       │                    │
    │                     │                       │                    │
    │ checkBulkActionRankingJob("abc123")         │                    │
    ├─────────────────────────────────────────────>│                    │
    │                     │                       │                    │
    │                     │                       │ GET /check_progress/abc123
    │                     │                       ├───────────────────>│
    │                     │                       │                    │
    │                     │                       │ { status: "pending" }
    │                     │                       │<───────────────────┤
    │                     │                       │                    │
    │ isComplete = false  │                       │                    │
    │<─────────────────────────────────────────────┤                    │
    │                     │                       │                    │
    │ ⏰ Wait for next minute...                  │                    │
    │                     │                       │                    │
    
    
    ┌─ One minute later ────────────────────────────────────────────────────┐
    │                                                                        │
    
    │ checkBulkActionRankingJob("abc123")         │                    │
    ├─────────────────────────────────────────────>│                    │
    │                     │                       │                    │
    │                     │                       │ GET /check_progress/abc123
    │                     │                       ├───────────────────>│
    │                     │                       │                    │
    │                     │                       │ { status: "completed" }
    │                     │                       │<───────────────────┤
    │                     │                       │                    │
    │                     │                       │ GET /get_prioritization_bulk/abc123
    │                     │                       ├───────────────────>│
    │                     │                       │                    │
    │                     │                       │ { prioritizerResponseList: [...] }
    │                     │                       │<───────────────────┤
    │                     │                       │                    │
    │                     │  Save ranked actions  │                    │
    │                     │  (HighImpactActionRanked)                  │
    │                     │<──────────────────────┤                    │
    │                     │                       │                    │
    │                     │  UPDATE: PENDING      │                    │
    │                     │  → SUCCESS            │                    │
    │                     │<──────────────────────┤                    │
    │                     │                       │                    │
    │ isComplete = true   │                       │                    │
    │<─────────────────────────────────────────────┤                    │
    │                     │                       │                    │
    │ startNextBatch()    │                       │                    │
    ├─────────────────────────────────────────────>│                    │
    │                     │                       │                    │
    │                     │  Find next 100 TO_DO  │                    │
    │                     │  rankings             │                    │
    │                     │<──────────────────────┤                    │
    │                     │                       │                    │
    │                     │  UPDATE: TO_DO        │                    │
    │                     │  → PENDING            │                    │
    │                     │<──────────────────────┤                    │
    │                     │                       │                    │
    │                     │                       │ POST /bulk_prioritization
    │                     │                       ├───────────────────>│
    │                     │                       │                    │
    │                     │                       │ { taskId: "def456" }
    │                     │                       │<───────────────────┤
    │                     │                       │                    │
    │ Next batch started  │                       │                    │
    │<─────────────────────────────────────────────┤                    │
    │                     │                       │                    │
    
    └─ Repeat until all TO_DO rankings are processed ──────────────────────┘
```

---

## Status Flow Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    Ranking Status Lifecycle                    │
└────────────────────────────────────────────────────────────────┘

    ┌────────┐
    │ TO_DO  │  Created by initial API call
    │        │  jobId: null
    └───┬────┘
        │
        │ Selected for batch processing
        │ (first 100, then next 100, etc.)
        ▼
    ┌─────────┐
    │ PENDING │  Sent to HIAP API
    │         │  jobId: "abc123"
    └────┬────┘
         │
         │ Cron checks status
         │
    ┌────┴──────────────────┐
    │                       │
    ▼                       ▼
┌─────────┐           ┌─────────┐
│ SUCCESS │           │ FAILURE │
│         │           │         │
└─────────┘           └─────────┘
  Ranked actions        Error message
  saved                 stored
```

---

## Database State at Each Stage

### Stage 1: Initial Request
```sql
-- 5000 rankings created
SELECT status, COUNT(*) FROM "HighImpactActionRanking" 
WHERE project_id = '...' 
GROUP BY status;

 status  │ count
─────────┼───────
 TO_DO   │ 5000
```

### Stage 2: First Batch Sent
```sql
 status  │ count
─────────┼───────
 PENDING │  100    -- First batch, jobId = "abc123"
 TO_DO   │ 4900    -- Waiting for next batch
```

### Stage 3: First Batch Complete, Second Batch Sent
```sql
 status  │ count
─────────┼───────
 SUCCESS │  100    -- First batch completed
 PENDING │  100    -- Second batch, jobId = "def456"
 TO_DO   │ 4800    -- Waiting
```

### Stage 4: All Complete
```sql
 status  │ count
─────────┼───────
 SUCCESS │ 4950    -- All successful
 FAILURE │   50    -- Some failed (e.g., invalid data)
```

---
## Security

The cron endpoint (`/api/cron/check-hiap-jobs`) is **internal-only** and protected via network-level access control:

### Network Protection (Kubernetes Ingress)

The ingress blocks all `/api/cron/*` paths from external access:

```yaml
# k8s/cc-ingress.yml
annotations:
  nginx.ingress.kubernetes.io/server-snippet: |
    location ~ ^/api/cron/ {
      deny all;
      return 403;
    }
```

**Result:** 
- ✅ External requests → HTTP 403 Forbidden
- ✅ Internal cluster requests (CronJob) → Allowed

### How It Works

```
External User                       Kubernetes Cluster
     │                                      │
     │  GET /api/cron/check-hiap-jobs       │
     ├──────────────────────────────────────>│
     │                                      │
     │         ❌ 403 Forbidden             │
     │  (Blocked by Ingress)                │
     │<──────────────────────────────────────┤
     │                                      │

Internal CronJob Pod
     │                                      │
     │  GET http://citycatalyst-web-service:3000/api/cron/check-hiap-jobs
     ├──────────────────────────────────────>│
     │                                      │
     │         ✅ 200 OK                     │
     │  (Internal service call, bypasses ingress)
     │<──────────────────────────────────────┤
```

**No additional authentication needed** - the network isolation is sufficient for internal cron jobs.

---

## Local Development & Testing

### Database Initialization

**Cron Job Route:**
The cron endpoint (`/api/cron/check-hiap-jobs`) doesn't use `apiHandler` (no auth needed), so it manually initializes:

```typescript
export async function GET() {
  // Manual initialization
  if (!db.initialized) {
    await db.initialize();
  }
  
  if (!db.sequelize) {
    throw new Error("Database not initialized");
  }
  
  // Now safe to query
}
```

### Testing Locally

#### 1. Start Development Server
```bash
cd app
npm run dev
```

#### 2. Manually Trigger Cron Job

The cron job is just an HTTP endpoint, so call it directly:

```bash
# Simple GET request
curl http://localhost:3000/api/cron/check-hiap-jobs

# With formatted JSON output
curl -s http://localhost:3000/api/cron/check-hiap-jobs | jq
```

**Expected Response:**
```json
{
  "checkedJobs": 0,
  "completedJobs": 0,
  "startedBatches": 0,
  "durationMs": 15
}
```

#### 3. Simulate Cron Schedule (Every Minute)

**Option A: Using `watch` command**
```bash
watch -n 60 'curl -s http://localhost:3000/api/cron/check-hiap-jobs | jq'
```

#### 4. Complete Testing Flow

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Start bulk prioritization
curl -X POST http://localhost:3000/api/v1/admin/bulk-hiap-prioritization \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "projectId": "your-project-id",
    "year": 2024,
    "actionType": "mitigation",
    "languages": ["en"]
  }'

# Terminal 3: Monitor with cron calls
while true; do
  echo "=== $(date) ==="
  curl -s http://localhost:3000/api/cron/check-hiap-jobs | jq
  sleep 60
done

# Terminal 4: Watch database
psql your_db -c "SELECT status, COUNT(*) FROM \"HighImpactActionRanking\" GROUP BY status;"
```

### Production: Kubernetes CronJob

In production, the cron runs automatically via Kubernetes (`k8s/cc-check-hiap-jobs.yml`):

```yaml
schedule: "* * * * *"  # Every minute
concurrencyPolicy: Forbid  # One at a time
```

The K8s CronJob executes:
```bash
curl -f http://citycatalyst-web-service:3000/api/cron/check-hiap-jobs
```

---

## Related Files

- **Service:** `app/src/backend/hiap/BulkHiapPrioritizationService.ts`
- **API Route:** `app/src/app/api/v1/admin/bulk-hiap-prioritization/route.ts`
- **Cron Job:** `app/src/app/api/cron/check-hiap-jobs/route.ts`
- **Kubernetes Config:** `k8s/cc-check-hiap-jobs.yml`
- **Tests:** `app/tests/api/bulk-hiap-prioritization.jest.ts`
