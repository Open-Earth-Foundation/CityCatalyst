# Interaction Diagrams

These diagrams record current interactions and the CC-737 gap. They do not authorize implementation choices.

## Current general Climate Advisor request

```mermaid
sequenceDiagram
  participant Client
  participant API as "CA API"
  participant Thread as "ThreadResolver / DB"
  participant Agent as "AgentService"
  participant Tool as "Inventory tool"
  participant CC as "CityCatalyst capability"

  Client->>API: POST /v1/messages
  API->>Thread: Resolve thread and token context
  Thread-->>API: User/thread scope
  API->>Agent: Create agent
  Agent->>Agent: Register static request-eligible tools
  Client->>Tool: Ask inventory question
  Tool->>CC: POST bounded inventory payload
  CC-->>Tool: Permission-checked bounded JSON
  Tool-->>API: JSON tool result
  API-->>Client: SSE response
```

## CC-737 target interaction to be designed in Inception

```mermaid
sequenceDiagram
  participant CA as "Climate Advisor request"
  participant Discovery as "Catalog discovery capability"
  participant Catalog as "Core NativeInputCatalog"
  participant Source as "Source capability"
  participant Owner as "Module source of truth"

  CA->>Discovery: Request entries for caller/request scope
  Discovery->>Catalog: Query active entries with scope constraints
  Discovery-->>CA: Authorized discovery metadata only
  CA->>Source: Request selected source operation
  Source->>Catalog: Validate selected catalog identity/state
  Source->>Owner: Read exact source through module boundary
  Owner-->>Source: Bounded result
  Source-->>CA: Bounded result or non-disclosing denial
```

Text alternative: Climate Advisor would first receive only catalog metadata permitted for the caller and active request. A later tool call would identify a selected entry, but Core would revalidate catalog state, caller scope, and source authorization before reading the module-owned source. The diagram intentionally leaves route names and selection semantics open for Requirements Analysis/Application Design.

## Security boundary summary

1. Climate Advisor authenticates to Core as a service.
2. The user bearer token supplies resource identity for permission checks.
3. Catalog metadata is filtered before discovery response.
4. Every selected source read is independently authorized and bounded.
5. Storage credentials and raw storage paths remain inside Core/module ownership.
