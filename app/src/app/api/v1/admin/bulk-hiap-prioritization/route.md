# Bulk HIAP Prioritization API

Complete documentation for the bulk High Impact Actions prioritization system.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Overview](#overview)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
  - [Start Bulk Prioritization](#1-start-bulk-prioritization)
  - [Get Batch Status](#2-get-batch-status)
  - [Retry Failed Batches](#3-retry-failed-batches)
- [How It Works](#how-it-works)
- [Status Lifecycle](#status-lifecycle)
- [Retry Functionality](#retry-functionality)
- [Multi-Project Processing](#multi-project-processing)
- [Error Handling](#error-handling)
- [Security](#security)
- [Local Development](#local-development)
- [Troubleshooting](#troubleshooting)
- [Related Files](#related-files)

---

## Quick Start

```bash
# Start bulk prioritization for a project
curl -X POST http://localhost:3000/api/v1/admin/bulk-hiap-prioritization \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "your-project-id",
    "year": 2024,
    "actionType": "mitigation",
    "languages": ["en", "pt"]
  }'

# Response (returns immediately in ~1-2 seconds)
{
  "totalCities": 5000,
  "firstBatchSize": 100,
  "message": "First batch started. Cron job will process remaining batches automatically."
}

# Check batch status
curl http://localhost:3000/api/v1/admin/bulk-hiap-prioritization/status?projectId=...&actionType=mitigation

# Retry failed cities
curl -X PATCH http://localhost:3000/api/v1/admin/bulk-hiap-prioritization \
  -H "Content-Type: application/json" \
  -d '{"projectId": "...", "actionType": "mitigation"}'
```

---

## Overview

This system handles large-scale HIAP (High Impact Actions) prioritization for **thousands of cities** using a **cron-based architecture**.

### Key Features

✅ **Fast API Response**: Returns immediately (~1-2 seconds), doesn't block  
✅ **Background Processing**: Kubernetes CronJob handles long-running work  
✅ **Batch Processing**: Processes cities in chunks (default: 100 per batch)  
✅ **Global Sequential**: Only 1 batch runs at a time (HIAP API constraint)  
✅ **Automatic Retry Flow**: Manual retry resets failures, cron picks them up  
✅ **Multi-Project Support**: FIFO fairness across multiple projects  
✅ **Multi-Language**: Processes actions in multiple languages per city  
✅ **Resilient**: Handles failures gracefully with detailed error messages  

### Key Architecture Decision

Uses **Kubernetes CronJob** (runs every minute) instead of a traditional background job queue.

**Why?**
- ✅ No complex queue infrastructure needed
- ✅ Stateless: survives pod restarts
- ✅ Simple to monitor and debug
- ✅ Kubernetes-native solution

---

## Architecture

### High-Level Flow

```mermaid
sequenceDiagram
    participant Admin
    participant API 
    participant Service
    participant DB
    participant Cron as K8s CronJob<br/>(every minute)
    participant HIAP as HIAP AI API

    Note over Admin,API: Phase 1: Initial Request (~1-2 sec)
    Admin->>API: POST /bulk-hiap-prioritization
    API->>Service: startBulkPrioritizationAsync()
    Service->>DB: Fetch cities with inventories
    DB-->>Service: 5000 cities
    Service->>DB: Create 5000 rankings (TO_DO)
    Service->>DB: Update 100: TO_DO → PENDING
    Service->>HIAP: POST /start_prioritization_bulk
    HIAP-->>Service: {taskId: "abc123"}
    Service->>DB: Update jobId = "abc123"
    Service-->>API: {totalCities: 5000, firstBatchSize: 100}
    API-->>Admin: 200 OK (returns immediately)
    
    Note over Admin,HIAP: Phase 2: Cron Processing (hours)
    rect rgb(240, 240, 255)
        loop Every minute
            Cron->>DB: Find PENDING jobs
            Cron->>HIAP: Check status
            alt Job completed
                Cron->>HIAP: Fetch results
                Cron->>DB: Save ranked actions
                Cron->>DB: PENDING → SUCCESS
            end
            
            alt No PENDING jobs exist
                Cron->>DB: Find oldest TO_DO
                Cron->>HIAP: Start next batch
                Cron->>DB: TO_DO → PENDING
            end
        end
    end
```

### Cron Job Logic

Every minute, the cron job (`/api/cron/check-hiap-jobs`) does:

1. **Check PENDING jobs** - Poll HIAP API for completion
2. **Process completed jobs** - Save results, mark SUCCESS/FAILURE
3. **Start next batch** - If NO PENDING jobs exist anywhere:
   - Find ONE project with TO_DO rankings (oldest first, FIFO)
   - Start ONE batch (100 cities: TO_DO → PENDING)

---

## API Endpoints

### 1. Start Bulk Prioritization

**Endpoint:** `POST /api/v1/admin/bulk-hiap-prioritization`

**Purpose:** Start bulk HIAP prioritization for all cities in a project

**Request:**
```json
{
  "projectId": "uuid",
  "year": 2024,
  "actionType": "mitigation",  // or "adaptation"
  "languages": ["en", "pt"]     // Languages for climate actions
}
```

**Response (200 OK):**
```json
{
  "totalCities": 5000,
  "firstBatchSize": 100,
  "message": "First batch started. Cron job will process remaining batches automatically."
}
```

**What It Does:**
1. Fetches all cities with inventories for the specified year
2. Creates `HighImpactActionRanking` records (status: `TO_DO`)
3. Starts ONLY the first batch (100 cities)
4. Returns immediately (~1-2 seconds)
5. Remaining batches processed by cron job

**Errors:**
- `400`: Missing/invalid parameters
- `401`: Not authenticated
- `403`: Not an admin
- `404`: Project not found or no inventories for year

---

### 2. Get Batch Status

**Endpoint:** `GET /api/v1/admin/bulk-hiap-prioritization/status`

**Purpose:** Get detailed status of all batches for a project

**Query Parameters:**
- `projectId` (required): UUID of project
- `actionType` (required): `mitigation` or `adaptation`

**Response (200 OK):**
```json
{
  "batches": [
    {
      "jobId": "abc123",
      "status": "SUCCESS",
      "cityCount": 100,
      "cities": [
        {
          "inventoryId": "uuid",
          "locode": "US-IL-CHI",
          "status": "SUCCESS",
          "errorMessage": null
        },
        ...
      ]
    },
    {
      "jobId": "def456",
      "status": "PENDING",
      "cityCount": 100,
      "cities": [...]
    },
    {
      "jobId": "ghi789",
      "status": "FAILURE",
      "cityCount": 95,
      "cities": [
        {
          "inventoryId": "uuid",
          "locode": "US-CA-LA",
          "status": "FAILURE",
          "errorMessage": "Failed to fetch context data"
        },
        ...
      ]
    },
    {
      "jobId": null,
      "status": "TO_DO",
      "cityCount": 4800,
      "cities": [...]
    }
  ]
}
```

**Batch Status Values:**
- `SUCCESS`: All cities in batch completed successfully
- `PENDING`: Batch is currently being processed by HIAP API
- `FAILURE`: At least one city in batch failed
- `TO_DO`: Batch hasn't been started yet

---

### 3. Retry Failed Batches

**Endpoint:** `PATCH /api/v1/admin/bulk-hiap-prioritization`

**Purpose:** Reset failed rankings to allow reprocessing

**Request:**
```json
{
  "projectId": "uuid",
  "actionType": "mitigation",
  "jobIds": ["abc123", "def456"]  // Optional: specific batches to retry
}
```

**Omit `jobIds`** to retry ALL failed cities in the project.

**Response (200 OK):**
```json
{
  "retriedCount": 150
}
```

**What It Does:**
1. Finds rankings with `status = FAILURE` (optionally filtered by jobIds)
2. Updates: `FAILURE` → `TO_DO`, clears `jobId` and `errorMessage`
3. Cron job will automatically pick them up on next run

**Errors:**
- `400`: Missing required parameters
- `401`: Not authenticated
- `403`: Not an admin

---

## How It Works

### Phase 1: Initial Request

**Endpoint:** `POST /api/v1/admin/bulk-hiap-prioritization`

1. **Fetch cities** with inventories for the specified year (e.g., 5000 cities)
2. **Create ranking records** for ALL cities:
   - Status: `TO_DO`
   - JobId: `null`
   - All 5000 records created at once
3. **Process ONLY the first batch** (100 cities):
   - Update: `TO_DO` → `PENDING`
   - Send to HIAP API
   - Get `taskId`, update records
4. **Return immediately** to user with summary

**Result:** API responds in ~1-2 seconds. User doesn't wait for completion.

---

### Phase 2: Cron-Based Processing

**Cron Job:** Runs every minute via `/api/cron/check-hiap-jobs`

#### Every Minute, the Cron Does:

**Step 1: Check PENDING Jobs**
- Query for all rankings with `status = PENDING`
- Get unique `jobId`s
- For each job:
  - Call HIAP API: `GET /check_progress/{taskId}`
  - If `"pending"`: Do nothing, check again next minute
  - If `"completed"`: Go to Step 2
  - If `"failed"`: Mark all as `FAILURE`, log error

**Step 2: Process Completed Jobs**
- Fetch results from HIAP API: `GET /get_prioritization_bulk/{taskId}`
- Save ranked actions to `HighImpactActionRanked` table
- Update rankings: `PENDING` → `SUCCESS`

**Step 3: Start Next Batch** (if NO PENDING jobs exist anywhere)
- **Critical**: Only runs if `pendingJobs.length === 0`
- Query for projects with `TO_DO` rankings
- Select ONE project (oldest `created` timestamp, FIFO)
- Start ONE batch (100 TO_DO → PENDING)
- Send to HIAP API

**Repeat** until no more TO_DO rankings exist.

---

### Timing Example

```
Minute 0:  Admin clicks "Start" → Batch 1 starts (100 cities)
           Database: 100 PENDING, 4900 TO_DO

Minute 1:  Cron checks → Batch 1 still pending
           No action taken

Minute 5:  Cron checks → Batch 1 complete!
           Saves results → 100 SUCCESS
           No PENDING jobs exist → Starts Batch 2
           Database: 100 SUCCESS, 100 PENDING, 4800 TO_DO

Minute 6:  Cron checks → Batch 2 still pending
           PENDING exists → Skip Step 3

Minute 11: Cron checks → Batch 2 complete!
           Saves results → 100 SUCCESS
           No PENDING jobs → Starts Batch 3
           Database: 200 SUCCESS, 100 PENDING, 4700 TO_DO

... continues until all complete
```

**Performance Impact:**
- ~1 minute gap between batches
- For 50 batches: adds ~50 minutes total
- For processes running hours: 1-2% overhead
- Acceptable trade-off for simplicity

---

## Status Lifecycle

```mermaid
stateDiagram-v2
  direction TB
  [*] --> TO_DO:Create ranking record
  TO_DO --> PENDING:Batch starts (sent to HIAP API)
  PENDING --> SUCCESS:HIAP processing complete
  PENDING --> FAILURE:HIAP processing failed
  FAILURE --> TO_DO:Manual retry
  SUCCESS --> [*]
  note right of TO_DO 
  Waiting to be processed
        jobId = null
  end note
  note right of PENDING 
  Currently being processed
        jobId = taskId from HIAP
  end note
  note right of SUCCESS 
  Completed successfully
        Ranked actions saved
  end note
  note right of FAILURE 
  Failed with error message
        Requires manual retry
  end note

```

---

## Retry Functionality

### UI Overview

The admin UI shows batches in an accordion with retry options:

```
┌─────────────────────────────────────────────────────────────┐
│  HIAP Prioritization Batches    [Retry All Failed Cities]  │
├─────────────────────────────────────────────────────────────┤
│  ☐ Batch 1  abc123  SUCCESS   100 cities                   │
│  ☐ Batch 2  def456  PENDING   100 cities                   │
│  ☑ Batch 3  ghi789  FAILURE    95 cities     [Selected]    │
│  ☐ TO_DO    -       TO_DO     4805 cities                   │
└─────────────────────────────────────────────────────────────┘

When batches selected:
┌─────────────────────────────────────────────────────────────┐
│  2 selected  [Deselect All]  [Retry Selected]              │
└─────────────────────────────────────────────────────────────┘
```

### Retry Options

**1. Retry All Failed Cities**
- Button at top right (only visible if any failures exist)
- Retries ALL failed cities across all batches
- Request: `{ projectId, actionType }` (no jobIds)

**2. Retry Selected Batches**
- Select specific batches with checkboxes
- Click "Retry Selected"
- Request: `{ projectId, actionType, jobIds: ["abc", "def"] }`

**3. Retry Individual Batch**
- Expand batch accordion
- Click "Retry This Batch" inside
- Request: `{ projectId, actionType, jobIds: ["abc"] }`

### Database State Changes

**Before Retry:**
```sql
SELECT status, COUNT(*) 
FROM "HighImpactActionRanking" 
GROUP BY status;

 status  │ count
─────────┼───────
 SUCCESS │ 4500
 PENDING │  100
 FAILURE │  200  ← Will be retried
 TO_DO   │  200
```

**After Retry:**
```sql
 status  │ count
─────────┼───────
 SUCCESS │ 4500
 PENDING │  100  (unchanged)
 FAILURE │    0  ✅ All reset!
 TO_DO   │  400  (200 original + 200 retried)
```

**Next Cron Run:**
- Finds TO_DO rankings with no PENDING
- Starts next batch (100 of the 400 TO_DO)
- Retried cities get reprocessed automatically

---

## Security

### Network-Level Protection

The cron endpoint `/api/cron/check-hiap-jobs` is **blocked at the ingress level**.

**Ingress Configuration** (`k8s/cc-ingress.yml`):
```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/server-snippet: |
      location ~ /api/cron/ {
        deny all;
        return 403;
      }
```

**Result:**
- ✅ External requests to `/api/cron/*` → 403 Forbidden
- ✅ Internal Kubernetes services can call it
- ✅ No application-level authentication needed

### Authentication for Public Endpoints

User-facing endpoints (`POST`, `GET`, `PATCH`) require:
- Valid session (authenticated user)
- Admin role

---

## Local Development

### Start Development Server

```bash
cd app
npm run dev
```

### Trigger Bulk Prioritization

```bash
curl -X POST http://localhost:3000/api/v1/admin/bulk-hiap-prioritization \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "projectId": "your-project-id",
    "year": 2024,
    "actionType": "mitigation",
    "languages": ["en"]
  }'
```

### Manually Trigger Cron (Local Testing)

```bash
# Simple GET request
curl http://localhost:3000/api/cron/check-hiap-jobs

# With formatted JSON output
curl -s http://localhost:3000/api/cron/check-hiap-jobs | jq

# Example response
{
  "checkedJobs": 2,
  "completedJobs": 1,
  "startedBatches": 1,
  "durationMs": 1250
}
```

**In production**, this endpoint is called automatically by Kubernetes CronJob every minute.

### Monitor Progress

**Terminal 1: Watch database**
```bash
watch -n 5 'psql $DATABASE_URL -c "
  SELECT status, COUNT(*) 
  FROM \"HighImpactActionRanking\" 
  WHERE type = '\''mitigation'\'' 
  GROUP BY status;
"'
```

**Terminal 2: Simulate cron**
```bash
# Call cron every 30 seconds for testing
while true; do
  echo "=== $(date) ==="
  curl -s http://localhost:3000/api/cron/check-hiap-jobs | jq
  sleep 30
done
```

**Terminal 3: Check batch status**
```bash
curl "http://localhost:3000/api/v1/admin/bulk-hiap-prioritization/status?projectId=...&actionType=mitigation" | jq
```

---

## Troubleshooting

### Problem: Batches stuck in TO_DO, not starting

**Possible Causes:**
1. Cron job not running
2. PENDING jobs exist (blocking new batches)
3. Database connection issue

**Solution:**
```bash
# Check if cron is running (Kubernetes)
kubectl get cronjobs citycatalyst-check-hiap-jobs
kubectl get jobs | grep check-hiap

# Check for PENDING jobs
psql $DATABASE_URL -c "
  SELECT COUNT(*), job_id 
  FROM \"HighImpactActionRanking\" 
  WHERE status = 'PENDING' 
  GROUP BY job_id;
"

# Manually trigger cron
curl http://localhost:3000/api/cron/check-hiap-jobs
```

---

### Problem: Batch stuck in PENDING for hours

**Possible Causes:**
1. HIAP API not responding
2. TaskId lost or invalid
3. Results not being fetched

**Solution:**
```bash
# Check HIAP API manually
curl http://hiap-service/check_progress/{taskId}

# If job is actually complete, manually mark as failed and retry
psql $DATABASE_URL -c "
  UPDATE \"HighImpactActionRanking\"
  SET status = 'FAILURE', 
      error_message = 'Stuck in PENDING, manual intervention'
  WHERE job_id = 'stuck-task-id';
"

# Then retry via API or UI
```

---

### Problem: High failure rate

**Diagnosis:**
```sql
-- Check error patterns
SELECT 
  error_message,
  COUNT(*) as count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
FROM "HighImpactActionRanking"
WHERE status = 'FAILURE'
GROUP BY error_message
ORDER BY count DESC;
```

**Common Solutions:**
- "Failed to fetch context data" → Check database connections
- "City has no locode" → Fix City data quality
- "HIAP API error" → Check HIAP service logs and health

---

### Problem: Cron job logs show errors

**Check Kubernetes logs:**
```bash
# View recent logs
kubectl logs -l job=check-hiap-jobs --tail=100

# Follow logs in real-time
kubectl logs -l job=check-hiap-jobs -f

# Check specific job run
kubectl logs job/check-hiap-jobs-{timestamp}
```

**Common errors:**
- "Database not initialized" → DB connection issue
- "HIAP API timeout" → HIAP service down or slow
- "QueryTypes is not defined" → Code deployment issue

---

## Related Files

### Code

- **API Route**: `app/src/app/api/v1/admin/bulk-hiap-prioritization/route.ts`
- **Cron Job**: `app/src/app/api/cron/check-hiap-jobs/route.ts`
- **Service**: `app/src/backend/hiap/BulkHiapPrioritizationService.ts`
- **HIAP Service**: `app/src/backend/hiap/HiapService.ts`
- **Frontend**: `app/src/app/[lng]/admin/bulk-inventory-actions/BulkHiapPrioritizationTabContent.tsx`

### Tests

- **API Tests**: `app/tests/api/bulk-hiap-prioritization.jest.ts`

### Kubernetes

- **CronJob**: `k8s/cc-check-hiap-jobs.yml`
- **Ingress Security**: `k8s/cc-ingress.yml`

### Database Models

- **Ranking Model**: `app/src/models/HighImpactActionRanking.ts`
- **Ranked Action Model**: `app/src/models/HighImpactActionRanked.ts`

---

**Last Updated:** 2025-10-24
