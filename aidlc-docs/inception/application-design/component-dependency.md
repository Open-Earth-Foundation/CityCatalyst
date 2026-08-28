# Application Design Component Dependencies — CC-737

## Dependency Direction

```mermaid
flowchart LR
    User["City Climate User"] --> CAAPI["Climate Advisor API"]
    CAAPI --> Agent["AgentService"]
    Agent --> Select["Selection Coordinator"]
    Select --> ToolFactory["Bounded Tool Factory"]
    ToolFactory --> Client["CityCatalystClient"]
    Client -->|service headers + user bearer| CoreHTTP["Core CA Capability HTTP"]
    CoreHTTP --> Auth["Session + PermissionService"]
    CoreHTTP --> Discovery["Catalog Discovery"]
    CoreHTTP --> Validator["Selection Validator"]
    Discovery --> Registry["Typed Capability Registry"]
    Validator --> Registry
    Validator --> Catalog["NativeInputCatalog"]
    Validator --> Adapter["Bounded Source Adapter"]
    Adapter --> GHGI["GHGI SoT"]
    Adapter --> HIAP["HIAP SoT"]
    Adapter --> CNB["CNB SoT when ready"]
    CoreHTTP --> Safe["Safe errors/results/telemetry"]
    Client --> SafeCA["CA safe result/error handling"]
```

## Dependency Matrix

Legend: **R** = runtime dependency, **C** = contract dependency, **T** = test/verification dependency, **—** = no direct dependency.

| From \ To | Catalog discovery | Registry | Auth/permissions | Source adapter | Core HTTP | CA client | Selection coordinator | Tool factory | AgentService | Telemetry |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Catalog discovery | — | R | R | R/readiness | R | — | — | — | — | R |
| Registry | — | — | — | C | C | — | — | — | — | — |
| Auth/permissions | — | — | — | — | R | — | — | — | — | R |
| Source adapter | — | C | R | — | R | — | — | — | — | R |
| Core HTTP | R | R | R | R | — | C | — | — | — | R |
| CA client | — | C/consume | — | — | R | — | C | R | — | R |
| Selection coordinator | — | C/consume | — | — | — | R | — | R | R | R |
| Tool factory | — | C/consume | — | — | — | R | R | — | C | R |
| AgentService | — | — | — | — | — | — | R | R | — | R |
| Telemetry | — | — | — | — | — | — | — | — | — | — |

## Ownership and Trust Matrix

| Concern | Authoritative owner | Consumer | Required rule |
|---|---|---|---|
| Catalog row lifecycle | Core `NativeInputCatalog` service/producers | Core discovery/read | Producer lifecycle remains unchanged; rows are pointers, not grants. |
| Caller identity | Core session/authentication | Core capability boundary | User bearer identity is required; CA service identity alone is insufficient. |
| Resource scope | Core `PermissionService` and resource relationships | Core discovery/read | Check every applicable populated user/org/project/city/inventory dimension. |
| Capability mapping | Core typed registry | Core and CA client/tool factory | Closed allowlist; no untrusted route derivation. |
| Source content | GHGI/HIAP/CNB module systems of record | Core bounded adapters | Module remains system of record; only minimum result crosses. |
| Tool selection | Climate Advisor request coordinator | AgentService/tool factory | Request-scoped only; selection cannot override Core authorization. |
| Storage credentials/access | Core/module boundary | None in Climate Advisor | No S3 credentials, signed URLs, raw objects, direct DB, or storage paths as access mechanisms. |
| Error normalization | Core selected-read boundary | CA client/tools | Selection-resolution outcomes use the single generic contract. |
| Operational telemetry | Existing Core/CA logging conventions | Reviewers/operators | Safe correlation/outcome data only; secrets/content excluded. |

## Data Flow — Discovery

```mermaid
sequenceDiagram
    participant CA as Climate Advisor
    participant Client as CityCatalystClient
    participant HTTP as Core CA HTTP
    participant Auth as Session/PermissionService
    participant Discovery as Catalog Discovery
    participant Registry as Capability Registry
    participant Catalog as NativeInputCatalog

    CA->>Client: Request context + bounded discovery filters
    Client->>HTTP: CA headers + user bearer + typed body
    HTTP->>Auth: Authenticate service and user session
    Auth-->>HTTP: Authenticated session
    HTTP->>Discovery: Discover for request context
    Discovery->>Catalog: Read candidate active pointers
    Discovery->>Auth: Validate every applicable scope
    Discovery->>Registry: Resolve supported mappings
    Registry-->>Discovery: Capability definitions or unavailable
    Discovery-->>HTTP: Safe eligible metadata + capability IDs
    HTTP-->>Client: Typed discovery response
    Client-->>CA: Authorized discovery result
```

## Data Flow — Selected Read

```mermaid
sequenceDiagram
    participant Tool as Selected CA Tool
    participant Client as CityCatalystClient
    participant HTTP as Core CA HTTP
    participant Validate as Selection Validator
    participant Catalog as NativeInputCatalog
    participant Registry as Capability Registry
    participant Adapter as Bounded Source Adapter
    participant SoT as Module System of Record

    Tool->>Client: Catalog ID + capability ID + bounded input
    Client->>HTTP: CA headers + user bearer + typed body
    HTTP->>Validate: Revalidate selection and request context
    Validate->>Catalog: Active/state check
    Validate->>Registry: Mapping/capability check
    Validate->>SoT: Availability/readability check through boundary
    alt Any selection/state/scope failure
        Validate-->>HTTP: HTTP 404 capability_unavailable
        HTTP-->>Client: Generic non-disclosing envelope
    else Authorized and available
        Validate->>Adapter: Authorized capability context
        Adapter->>SoT: Bounded source operation
        SoT-->>Adapter: Source result
        Adapter-->>HTTP: Typed minimum result
        HTTP-->>Client: Bounded response
    end
    Client-->>Tool: Safe result or safe error
```

## Coupling and Change Rules

- **Core → Climate Advisor**: Contract dependency; additive internal capability contract. Core contract changes require synchronized client/tool tests.
- **Climate Advisor → Core**: Runtime HTTP dependency; CA may only call published internal capability operations and cannot infer routes.
- **Core → Modules**: Existing module-owned capability dependency; CC-737 adds adapters only where a bounded read boundary is approved.
- **Catalog → Source data**: Logical pointer relationship only; no cross-database ownership or content copy is introduced.
- **Telemetry**: Cross-cutting observation, not an authorization or data-storage dependency.
- **No shared package**: Keep authoritative schemas/fixtures close to Core and consume deterministic fixtures from CA tests, as approved in the design plan.

## Failure Isolation

1. Authentication failure stops the call under existing auth semantics.
2. Discovery entry ineligibility removes that entry only and emits no metadata.
3. Selected-source resolution failure returns the generic `capability_unavailable` contract.
4. A failed selected tool is isolated; unrelated independently authorized tools may continue under existing orchestration rules.
5. Core/module timeout or dependency failure fails closed, is bounded, and is logged only with safe outcome data.

