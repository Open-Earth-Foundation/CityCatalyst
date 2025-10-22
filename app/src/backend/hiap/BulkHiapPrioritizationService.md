# Bulk HIAP Prioritization - Sequence Diagram

## Overview
This document explains the asynchronous bulk HIAP prioritization process that handles large-scale prioritization for thousands of cities.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Client as "Admin User"
    participant API 
    participant Service as "HIAP Service (CC)"
    participant DB as SQL
    participant BG as "Background Process"
    participant HIAP as "HIAP AI API"

	Note over Service: Initial Request Phase
    Client->>API: POST { projectId, year, actionType }
    activate API
    
    API->>Service: startBulkPrioritizationAsync(params)
    activate Service
    
    Note over Service: Step 1: Fetch Cities
    activate DB
    Service->>DB: Fetch cities with inventories for year
    DB-->>Service: Return 5000 cities
    deactivate DB


    Note over Service: Step 2: Create Rankings
    activate DB
    Service->>DB: Create HighImpactActionRanking records<br/>(status: TO_DO, jobId: null)
    DB-->>Service: 5000 records created
    deactivate DB
    
    
    Note over Service: Step 3: Start Background & Return
    Service->>BG: processBatchesInBackground() [async, no await]
    activate BG
    Note over BG: Background processing starts
    
    Service-->>API: { totalCities: 5000, totalBatches: 50 }
    deactivate Service
    
    API-->>Client: 200 OK<br/>{ totalCities: 5000, totalBatches: 50,<br/>message: "Processing in background" }
    deactivate API
    
    Note over Client,API: API returns immediately (~1-2 seconds)
    
    rect rgb(240, 240, 255)
        Note over Service, HIAP: Background Processing (runs for hours)
        
        Note over Service: Batch 1
        loop For each batch (1 to 50)
            Note over Service, HIAP: Process Batch 1 (cities 1-100)
            
            Note over DB, BG : Update to PENDING
            BG->>DB: UPDATE status TO_DO → PENDING<br/>WHERE cities 1-100
            DB-->>BG: 100 rows updated
            
            Note over DB, BG: Get context data
            BG->>DB: Fetch emissions & context for 100 cities
            DB-->>BG: Return city data
            
            Note over BG, HIAP: Call HIAP API
            BG->>HIAP: POST /start_prioritization_bulk<br/>{ cityDataList: [100 cities] }
            activate HIAP
            HIAP-->>BG: { taskId: "uuid-batch-1" }
            deactivate HIAP
            
            Note over BG,DB: Update jobId
            BG->>DB: UPDATE jobId = "uuid-batch-1"<br/>WHERE cities 1-100
            DB-->>BG: 100 rows updated
            
            Note over BG, HIAP: Poll for completion
            loop Poll every 10 seconds (max 20 minutes)
                BG->>HIAP: GET /check_progress/{taskId}
                HIAP-->>BG: { status: "pending" }
                Note over BG: Wait 10 seconds
            end
            
            BG->>HIAP: GET /check_progress/{taskId}
            HIAP-->>BG: { status: "completed" }
            
            Note over BG, HIAP: Get results
            BG->>HIAP: GET /get_prioritization_bulk/{taskId}
            activate HIAP
            HIAP-->>BG: { prioritizerResponseList: [<br/>  { locode: "US-IL-CHI", rankedActions... },<br/>  { locode: "US-CA-LA", rankedActions... },<br/>  ... 100 responses<br/>] }
            deactivate HIAP
            
            Note over BG, DB: Save results
            loop For each city in batch
                BG->>DB: Save ranked actions for city<br/>(HighImpactActionRanked table)
                DB-->>BG: Actions saved
                
                BG->>DB: UPDATE status PENDING → SUCCESS<br/>WHERE city
                DB-->>BG: Status updated
            end
            
            Note over Service, HIAP: Batch 1 complete (100 cities done)
            Note over BG: Continue to Batch 2...
        end
        
        Note over Service, HIAP: All 50 batches processed: Total: 5000 cities prioritized
         
    end
    
    deactivate BG
           
```

## Process Flow Explanation

### Phase 1: Synchronous (API Request) - ~1-2 seconds
1. **API receives request** with projectId, year, actionType
2. **Service fetches cities** from database (all cities with inventories for that year)
3. **Service creates ranking records** in batch:
   - Status: `TO_DO` (not yet sent to AI)
   - JobId: `null` (no task assigned yet)
   - All 5000 records created at once
4. **Service calculates batches**: 5000 cities ÷ 100 = 50 batches
5. **Service starts background process** (fire-and-forget)
6. **API returns immediately** with summary

### Phase 2: Asynchronous (Background Processing) - Several hours

For **each batch of 100 cities**:

#### Step 1: Prepare Batch
- Update ranking status: `TO_DO` → `PENDING`
- Fetch emissions data and city context from database

#### Step 2: Send to HIAP API
- Call `/start_prioritization_bulk` with 100 cities
- Receive single `taskId` for the entire batch
- Update all 100 rankings with this `taskId`

#### Step 3: Poll for Completion
- Check `/check_progress/{taskId}` every 10 seconds
- Wait until status is `completed` (or `failed`)
- Timeout after 20 minutes

#### Step 4: Retrieve Results
- Call `/get_prioritization_bulk/{taskId}`
- Receive array of 100 responses (one per city)
- Each response identified by `locode`

#### Step 5: Save Results
- For each city in the response:
  - Match by `locode`
  - Save ranked actions to `HighImpactActionRanked` table
  - Update status: `PENDING` → `SUCCESS`

#### Step 6: Move to Next Batch
- Process batch 2 (cities 101-200)
- Repeat steps 1-5
- Continue until all 50 batches complete

## Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> TO_DO: Create ranking record
    TO_DO --> PENDING: Update before sending to HIAP
    PENDING --> SUCCESS: HIAP processing complete
    PENDING --> FAILURE: HIAP processing failed
    SUCCESS --> [*]
    FAILURE --> [*]
```

## Key Design Decisions

### Why Async?
- **Fast API response**: Returns in 1-2 seconds instead of hours
- **Non-blocking**: Server can handle other requests
- **Scalable**: Can process thousands of cities without timeout

### Why Batches of 100?
- **HIAP API limit**: Can process ~10 cities per API call (we batch to 100)
- **Memory management**: Processing 5000 cities at once would consume too much memory
- **Error isolation**: If batch 25 fails, batches 1-24 and 26-50 continue

### Why Sequential Batches?
- **HIAP rate limiting**: Prevents overwhelming the AI API
- **Predictable load**: Easier to monitor and debug
- **Resource management**: Controlled database and API usage

## Error Handling

### Batch-Level Errors
- If a batch fails, mark all cities in that batch as `FAILURE`
- Continue processing remaining batches
- Log error details for debugging

### City-Level Errors
- If context data fetch fails for a city: skip it, mark as `FAILURE`
- If HIAP doesn't return results for a city: mark as `FAILURE`
- Continue processing other cities in the batch

### Recovery
- Failed batches can be reprocessed by:
  1. Querying for cities with status `FAILURE`
  2. Resetting status to `TO_DO`
  3. Re-triggering the bulk prioritization
