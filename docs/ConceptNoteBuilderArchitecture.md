# Concept Note Builder Architecture

## Purpose

The Concept Note Builder is a CityCatalyst agentic workflow for helping a city
turn an existing project, CityCatalyst context, funder requirements, user
uploads, and comparable funded-project evidence into an editable funder-ready
concept note.

The first release should be narrow: one selected Minnesota funder, one
instrument type, and DOCX plus PDF export. The architecture should still
generalize to additional funders, regions, languages, and templates by changing
data and configuration, not by rebuilding the workflow.

## Inputs This Incorporates

- Local agentic architecture direction in
  [AgenticModuleScope.md](AgenticModuleScope.md).
- Current Climate Advisor runtime shape in
  [climate-advisor/docs/architecture.md](../climate-advisor/docs/architecture.md).
- The Concept Note Builder draft PRD exploration page.
- The NBS Project Preparation prototype and its document, block, patch,
  knowledge-source, and concept-note patterns.
- The CityCatalyst global-data concept-note-builder research page, especially
  its supply/awards/pipeline split and its funder, funding opportunity, project,
  action, and funding-link data model.
- The PDF converter repository as an external conversion dependency with a
  stable adapter contract.

## Scope

In scope:

- A Climate Advisor workflow for concept-note runs.
- A document workspace that supports structured chapters, citations, revisions,
  gaps, and export.
- A standalone DB for funders, funder criteria, templates, and similar funded
  projects.
- A curated research ingest pipeline for funder profiles and funded-project
  examples.
- Runtime matching between the user's project and similar funded projects.
- A thin adapter boundary for PDF conversion and document ingestion.
- Reuse of current CityCatalyst-to-Climate-Advisor connection for CC data.

Out of scope:

- Redesigning the CC data connection.
- Planning the internals of `Open-Earth-Foundation/PDF_converter`.
- Multi-funder discovery in the first release.
- Submitting grants or applications to external funder portals.
- A new broad agent microservice outside Climate Advisor.

## Architecture Decision

Concept Note Builder should be implemented as a new Climate Advisor agentic
workflow, following the same direction as the Stationary Energy workflow:

1. CityCatalyst owns product data, user permissions, and committed module state.
2. Climate Advisor owns conversation state and pre-commit agentic workflow state.
3. A standalone DB owns reusable funder and funded-project data.
4. The PDF conversion pipeline is an adapter dependency with a stable output
   contract.
5. The agent gets a scoped tool pack for the active workflow step, not a flat
   list of every possible operation.

```mermaid
flowchart TB
    User["City user"] --> CCUI["CityCatalyst UI<br/>chat + document workspace"]

    subgraph CC["CityCatalyst"]
        CCUI
        CCBridge["CNB bridge routes"]
        CCCaps["CC module capability wrappers<br/>city, project, GHGI, CCRA, HIAP"]
        CCData[("CC DB")]
    end

    subgraph CA["Climate Advisor service"]
        CARoutes["CNB workflow routes<br/>start, status, messages, export"]
        Stream["StreamingHandler"]
        Agent["AgentService<br/>scoped CNB prompt + tools"]
        CNBService["ConceptNoteWorkflowService"]
        ContextService["ContextBundleService"]
        DocService["DocumentWorkspaceService"]
        MatchService["ProjectMatchingService"]
    end

    subgraph Standalone["Standalone DB"]
        FunderDB[("Funder criteria<br/>templates")]
        ProjectKB[("Funded projects<br/>awards<br/>source evidence")]
    end

    ContextBundle["Context bundle<br/>CC context + funder criteria<br/>funded projects + uploads"]
    OpenRouter["OpenRouter"]
    ObjectStore["Object/file storage<br/>uploads + DOCX/PDF exports"]

    CCUI --> CCBridge
    CCBridge --> CARoutes
    CARoutes --> Stream
    Stream --> Agent
    Agent --> CNBService
    CNBService --> ContextService
    CNBService --> DocService
    CNBService --> MatchService
    CCData --> CCCaps
    CCCaps --> ContextService
    FunderDB --> ContextService
    FunderDB --> MatchService
    ProjectKB --> MatchService
    MatchService --> ContextService
    ContextService --> ContextBundle
    ContextBundle --> Agent
    ContextBundle --> DocService
    DocService --> ObjectStore
    Agent --> OpenRouter
```

## Product Shape

The user experience is not a step-by-step questionnaire. It is a guided
interview with a live document workspace.

The first part of the workflow is context bundle building. The
`ContextBundleService` should assemble the reusable run context by:

- Loading what CityCatalyst already knows.
- Ingesting what the user uploads at intake or mid-flow.
- Retrieving the selected funder's profile, rubric, and template.
- Matching the project against comparable funded projects.
- Identifying decisions or missing facts that cannot be grounded.

The agent and document workspace then use that context bundle to:

- Draft document chapters with evidence links.
- Ask only for the identified decisions or missing facts.
- Let the user edit, add, delete, restore, and reorder chapters.
- Export DOCX and PDF documents plus a reusable context bundle.

```mermaid
flowchart LR
    Context["Assemble context bundle"]
    Context --> Interview["Guided interview"]
    Interview --> Draft["Draft chapters"]
    Draft --> Review["User review + edits"]
    Review --> Revise["Revise chapters"]
    Revise --> Export["Generate DOCX/PDF export"]

    Upload["User uploads files<br/>any time"] --> Ingest["Convert + ingest"]
    Ingest --> Context
    Ingest --> Draft

    Research["Funder profile<br/>criteria<br/>similar projects"] --> Context

    CCData["CC data<br/>city, GHGI, CCRA, HIAP"] --> Context
```

## State Ownership

| State | Owner | Reason |
| --- | --- | --- |
| City profile, project, GHGI, CCRA, HIAP | CityCatalyst | Existing product source of truth and permission model. |
| Chat threads and messages | Climate Advisor | Existing CA conversation model. |
| Concept-note run state | datateam managed CNB database | Pre-commit agentic workflow state; CA orchestrates but does not own the infrastructure. |
| Context bundle snapshot | datateam managed CNB database | Reusable run input/output for this workflow. |
| Uploaded file references and extracted text | datateam managed CNB database | Needed for mid-flow ingestion, citations, and export. |
| Document chapters and revisions | datateam managed CNB database | Draft document state before export. |
| Funder profiles and criteria | datateam managed CNB database | Shared curated corpus, reusable across cities and agents. |
| Similar funded projects | datateam managed CNB database | Shared project repository, queryable by funder, category, region, instrument. |
| Exported DOCX/PDF file references | datateam managed CNB database | Workflow output artifacts. |
| PDF conversion internals | PDF converter project | External pipeline; CNB only consumes its output contract. |

## Data Infrastructure Boundary

The CNB backend should not plan to own or provision the durable data
infrastructure for concept-note runs, document chapters, revisions, gaps,
sources, evidence links, funder profiles, or funded-project corpora. Those
schemas and stores live in the datateam managed CNB database.

The application and Climate Advisor work should consume that infrastructure
through stable contracts:

- typed read/write clients or repositories for CNB run and document state
- typed research clients for funder, funding-opportunity, pipeline, and
  funded-project data
- stable file references for uploads and exports
- explicit source/evidence ids for citations and audit trails

The diagrams below describe the logical storage shape the workflow needs. They
are contract requirements for integration, not a decision that the Climate
Advisor service owns the database infrastructure or migrations.

## Workflow Steps

Each workflow step should map to a scoped context loader and scoped tool pack.
The active step decides which tools are available.

```mermaid
flowchart TB
    Start([Start]) --> Scope["selecting_scope"]
    Scope --> Ingest["ingesting_user_files<br/>deterministic conversion"]
    Ingest --> Funder["profiling_funder"]
    Funder --> Match["matching_examples"]
    Match --> Context["assembling_context<br/>build context bundle"]
    Context --> Interview["interviewing"]
    Interview --> Draft["drafting_document"]
    Draft --> Edit["editing_document"]
    Edit --> Draft
    Draft --> Complete([completed])

    IngestNote["Full uploads are converted and stored.<br/>Only selected source excerpts enter the context bundle."]
    ContextNote["Context bundle combines CC data,<br/>selected source excerpts, funder rubric/template,<br/>and matched funded projects."]
    Ingest -.-> IngestNote
    Context -.-> ContextNote
```

### Step Scope Table

| Step | Main context | Enabled tool groups |
| --- | --- | --- |
| `selecting_scope` | user, city, project candidates | workflow control, CC project reads |
| `ingesting_user_files` | uploaded file refs, deterministic converter status, extracted source inventory | deterministic document ingest tools; no LLM |
| `profiling_funder` | selected funder, template, criteria | standalone DB tools |
| `matching_examples` | project profile, funder profile, project KB filters | matching tools |
| `assembling_context` | CC summaries, selected upload excerpts, funder rubric/template, matched funded projects, known gaps | context bundle tools |
| `interviewing` | gaps, known facts, required template fields | interview tools, document read tools |
| `drafting_document` | chapter plan, evidence map, examples | chapter draft tools, evidence tools |
| `editing_document` | selected chapter/revision | document edit tools |

Export is not a workflow step for the LLM. It is a document workspace button
that calls export preflight and generation routes against the current chapters,
template, evidence links, and source manifest.

## Runtime Request Flow

```mermaid
sequenceDiagram
    participant User
    participant CCUI as CityCatalyst UI
    participant CCBridge as CC CNB bridge
    participant CA as CA CNB routes
    participant Resolver as Step resolver
    participant Registry as CNB capability registry
    participant Context as ContextBundleService
    participant Agent as CNB agent
    participant Doc as DocumentWorkspaceService
    participant Research as Standalone DB
    participant CC as CC capabilities
    participant DB as CNB storage

    User->>CCUI: Open Concept Note Builder
    CCUI->>CCBridge: Start or resume run
    CCBridge->>CA: POST /v1/concept-notes/start
    CA->>DB: Create or load concept_note_run
    CA->>Resolver: Resolve step and scope
    Resolver->>Registry: Get capabilities for step
    Registry-->>Resolver: Tool definitions
    CA->>DB: When uploads exist, read deterministic source inventory
    CA->>Research: Load selected funder profile/rubric/template
    CA->>Research: Match comparable funded projects
    Resolver->>Context: Build context bundle from prepared inputs
    Context->>CC: Load city/project/GHGI/CCRA/HIAP summaries
    Context->>DB: Select source excerpts from inventory
    Context->>Research: Attach funder criteria and matches
    Context->>DB: Store context bundle snapshot
    CA->>Agent: Create scoped agent with context and tools
    User->>CCUI: Send message or edit document
    CCUI->>CA: POST /v1/messages with concept_note_run_id
    Agent->>Doc: Read or mutate draft chapters
    Doc->>DB: Persist chapter revisions
    Agent-->>CA: Response and tool_result events
    CA-->>CCUI: SSE stream
```

## Context Bundle

The context bundle is built for the active project and selected funder. Project
ownership, run routing, and funder selection already live outside the bundle in
the surrounding CNB database/API layer, so the bundle should not duplicate IDs.
It should only carry the context the model and document workspace need.

```mermaid
flowchart TB
    Bundle["context_bundle"]
    Bundle --> CCSummary["cc_context<br/>city, GHGI, CCRA, HIAP"]
    Bundle --> Sources["selected_sources<br/>grounded excerpts,<br/>source locations"]
    Bundle --> Funder["funder_context<br/>template, rubric, eligibility,<br/>scoring criteria"]
    Bundle --> Examples["similar_projects<br/>project summaries,<br/>award evidence, fit reasons"]
    Bundle --> Decisions["user_decisions<br/>answers, overrides, confirmed facts"]
    Bundle --> Draft["document_context<br/>chapters, gaps, citations"]
```

Recommended high-level shape:

```json
{
  "cc_context": {
    "city": {},
    "project": {},
    "ghgi": {},
    "ccra": {},
    "hiap": {}
  },
  "selected_sources": [
    {
      "label": "string",
      "excerpt": "string",
      "source_location": "string",
      "reason_included": "string"
    }
  ],
  "funder_context": {
    "template": {},
    "rubric": {},
    "eligibility": {},
    "scoring_criteria": []
  },
  "similar_projects": [
    {
      "title": "string",
      "summary": "string",
      "award_context": {},
      "fit_reason": "string",
      "evidence": []
    }
  ],
  "user_decisions": [],
  "document_context": {
    "chapters": [],
    "gaps": [],
    "citations": []
  }
}
```

## Database Model

### Data Planning Constraints From Global Data

The standalone research model follows the global-data CNB research page. The
important planning rules are:

- Keep the four discovered input groups separate: finance landscape, funder
  profiles, comparable awards, and CityCatalyst city context/GHGI.
- Keep funding lifecycle moments separate:
  - `supply`: what funding exists, one row per program/opportunity.
  - `awards`: what got funded, one row per award/funding link.
  - `pipeline`: the ranked queue that determines funding order for routes such
    as SRF priority lists.
- Use four country-agnostic stored concepts: funder, funding opportunity,
  funded project, and funded project action.
- Connect projects/actions to funding through explicit funding links rather than
  embedding awards directly in project records.
- Treat the finance route as document-shaping data. A competitive grant,
  revolving-fund priority-list project, formula/block grant, green-bank loan,
  capital-investment request, and city self-financing path each imply different
  required document sections.
- Store funder profiles with two halves:
  - `stated`: eligibility, rubric, template, award rules, and requirements read
    from RFP/NOFO/program documents.
  - `derived`: patterns computed from awards data, such as typical recipients,
    award sizes, categories, and revealed preferences.
- Keep matching criteria calibratable. NLC must approve thresholds and weights
  before the workflow scores a project against a rubric.
- Treat Minnesota city/GHGI sources as context candidates until license,
  redistribution, and GPC-mapping blockers are resolved.

### CNB Workflow Tables

These are the logical workflow/document tables the CNB backend needs to use.
They should live in the datateam managed CNB database. Climate Advisor consumes
them through typed service/repository contracts.

```mermaid
erDiagram
    threads ||--o{ concept_note_runs : "optionally anchors"
    concept_note_runs ||--o{ concept_note_context_sources : "uses"
    concept_note_runs ||--o{ concept_note_chapters : "contains"
    concept_note_runs ||--o{ concept_note_gaps : "tracks"
    concept_note_runs ||--o{ concept_note_matched_projects : "stores"
    concept_note_runs ||--o{ concept_note_exports : "produces"
    concept_note_chapters ||--o{ concept_note_chapter_revisions : "has"
    concept_note_chapters ||--o{ concept_note_evidence_links : "cites"
    concept_note_context_sources ||--o{ concept_note_source_chunks : "chunks"

    threads {
        uuid thread_id
        string user_id
        jsonb context
    }

    concept_note_runs {
        uuid run_id
        uuid thread_id
        string user_id
        string city_id
        string project_id
        string funder_id
        string opportunity_id
        string status
        string workflow_step
        jsonb context_summary
        jsonb permission_summary
        string trace_id
        timestamp created_at
        timestamp updated_at
    }

    concept_note_context_sources {
        uuid source_id
        uuid run_id
        string source_type
        string source_ref
        string title
        string file_ref
        string content_hash
        jsonb source_metadata
        timestamp created_at
    }

    concept_note_source_chunks {
        uuid chunk_id
        uuid source_id
        int chunk_index
        text content
        jsonb source_map
        vector embedding_vector
    }

    concept_note_chapters {
        uuid chapter_id
        uuid run_id
        string template_section_id
        string title
        int position
        string status
        bool required
        bool deleted
        bool user_locked
        timestamp created_at
        timestamp updated_at
    }

    concept_note_chapter_revisions {
        uuid revision_id
        uuid chapter_id
        int revision_number
        string author_type
        string change_type
        text body_markdown
        jsonb patch_summary
        timestamp created_at
    }

    concept_note_evidence_links {
        uuid evidence_link_id
        uuid chapter_id
        uuid revision_id
        uuid source_id
        uuid chunk_id
        string claim_ref
        text quote_or_summary
    }

    concept_note_gaps {
        uuid gap_id
        uuid run_id
        uuid chapter_id
        string field_key
        string severity
        text reason
        string status
    }

    concept_note_matched_projects {
        uuid match_id
        uuid run_id
        string funded_project_id
        numeric score
        jsonb match_factors
        jsonb evidence
    }

    concept_note_exports {
        uuid export_id
        uuid run_id
        string file_type
        string file_ref
        string status
        jsonb source_manifest
    }
```

### Standalone DB

The standalone DB is not workflow state. It is the curated, reusable corpus for
funders and funded projects.

```mermaid
erDiagram
    funders ||--o{ funding_opportunities : "offers"
    funding_opportunities ||--o{ funder_templates : "uses"
    funding_opportunities ||--o{ funder_criteria : "defines"
    funding_opportunities ||--o{ funding_links : "funds"
    funding_opportunities ||--o{ funding_pipeline_entries : "ranks"
    funded_projects ||--o{ funded_project_actions : "contains"
    funded_projects ||--o{ funding_links : "receives"
    funded_project_actions ||--o{ funding_links : "funded by"
    funded_projects ||--o{ funded_project_evidence : "cites"
    source_documents ||--o{ funded_project_evidence : "supports"
    source_documents ||--o{ funder_criteria : "supports"
    source_documents ||--o{ funding_pipeline_entries : "supports"

    funders {
        uuid funder_id
        string name
        string funder_type
        string country
        string region
        jsonb profile
    }

    funding_opportunities {
        uuid opportunity_id
        uuid funder_id
        string name
        string finance_route
        string instrument_type
        string region_scope
        numeric min_award
        numeric max_award
        string currency
        string live_status
        string status
    }

    funder_templates {
        uuid template_id
        uuid opportunity_id
        string template_name
        string output_format
        jsonb chapter_schema
        jsonb required_fields
    }

    funder_criteria {
        uuid criterion_id
        uuid opportunity_id
        string criterion_type
        string label
        text requirement_text
        numeric weight
        bool hard_gate
        jsonb normalized_rule
    }

    funded_projects {
        uuid funded_project_id
        string title
        string applicant_name
        string city
        string state_region
        string country
        string category
        jsonb hazards
        jsonb interventions
        text summary
    }

    funded_project_actions {
        uuid action_id
        uuid funded_project_id
        string action_type
        string category
        jsonb hazards
        jsonb interventions
        text description
    }

    funding_links {
        uuid funding_link_id
        uuid funded_project_id
        uuid action_id
        uuid opportunity_id
        numeric award_amount
        numeric requested_amount
        string currency
        int award_year
        string fiscal_year
        string instrument_type
        string lifecycle_stage
        string status
    }

    funding_pipeline_entries {
        uuid pipeline_entry_id
        uuid opportunity_id
        string external_project_ref
        string applicant_name
        int rank
        numeric requested_amount
        numeric fundable_amount
        string fiscal_year
        string status
    }

    source_documents {
        uuid source_document_id
        string source_type
        string url
        string title
        string license_status
        string content_hash
        timestamp fetched_at
    }

    funded_project_evidence {
        uuid evidence_id
        uuid funded_project_id
        uuid source_document_id
        text claim
        text quote_or_summary
        jsonb source_map
    }
```

## Research Ingest Pipeline

The ingest pipeline should turn curated research into stable records with
provenance, not just embeddings.

```mermaid
flowchart LR
    Sources["NOFOs, program pages,<br/>award lists, reports,<br/>template docs"] --> Fetch["Fetch or upload source"]
    Fetch --> Convert["Normalize source<br/>HTML/PDF/DOCX to markdown"]
    Convert --> Extract["Extract structured facts"]
    Extract --> Curate["Human curation"]
    Curate --> Validate["Schema validation<br/>license check<br/>dedupe"]
    Validate --> Store["Standalone DB"]
    Store --> Index["Lexical/vector index"]
    Store --> Tools["Runtime research tools"]
```

Required ingest outputs:

- Source document record with URL, title, date, license status, and hash.
- Funder record and funding opportunity record, including route, instrument,
  geography, live status, and award-size ranges.
- Template chapter schema.
- Stated eligibility criteria from program documents.
- Derived matching signals, marked as derived.
- Funded-project records, project-action records, and funding links.
- Pipeline entries for priority-list routes where the funding order matters.
- Evidence links for each important claim.

## Similar Project Matching

Matching must be deterministic first and semantic second. The user needs to see
why an example was selected.

```mermaid
flowchart TB
    Project["User project profile"] --> Filters["Hard filters"]
    Funder["Selected funder/opportunity"] --> Filters
    Filters --> CandidateSet["Candidate funded projects"]
    CandidateSet --> Score["Score factors"]
    Score --> Rank["Rank and explain"]
    Rank --> StoreMatch["Persist matched examples"]
    StoreMatch --> UI["Show examples in interview"]
    StoreMatch --> Draft["Use examples in chapter drafting"]

    subgraph Factors["Scoring factors"]
        SameFunder["same funder"]
        Category["same category"]
        Region["MN -> Midwest -> US"]
        Instrument["same instrument type"]
        Route["same finance route"]
        Applicant["same applicant type"]
        Hazards["same hazard/risk framing"]
        AwardSize["similar award size"]
        Evidence["source quality"]
    end

    SameFunder --> Score
    Category --> Score
    Region --> Score
    Instrument --> Score
    Route --> Score
    Applicant --> Score
    Hazards --> Score
    AwardSize --> Score
    Evidence --> Score
```

The matching result should include:

- matched project id
- score
- ranked factors
- hard filters applied
- source evidence
- text snippets safe to show as examples
- caveats or missing fields

## PDF Converter Boundary

Do not plan conversion internals here. CNB only needs an adapter that accepts a
file reference and returns a stable ingestion payload.

```mermaid
sequenceDiagram
    participant User
    participant UI as CityCatalyst UI
    participant CA as CA document ingest route
    participant Store as File storage
    participant Adapter as PDF converter adapter
    participant Converter as PDF_converter
    participant DB as CNB storage

    User->>UI: Drop PDF/DOCX/CAP document
    UI->>Store: Upload original file
    UI->>CA: Register upload with run_id
    CA->>Adapter: Convert(file_ref)
    Adapter->>Converter: Submit file
    Converter-->>Adapter: source text + source locations + warnings
    Adapter-->>CA: Normalized conversion result
    CA->>DB: Store converted source inventory
    CA-->>UI: SSE upload_ingested or upload_failed
```

Adapter output contract:

```json
{
  "source_id": "uuid",
  "file_ref": "string",
  "title": "string",
  "document_type": "pdf|docx|xlsx|html|text|other",
  "markdown": "string",
  "chunks": [
    {
      "chunk_index": 0,
      "content": "string",
      "source_map": {
        "page": 1,
        "bbox": null,
        "section_heading": "string"
      }
    }
  ],
  "extracted_entities": [],
  "warnings": [],
  "confidence": "high|medium|low"
}
```

## Document Workspace

The document workspace is the product surface where the concept note takes
shape. It is not just a generated blob. It is a structured, editable document
with chapters, revisions, citations, and gaps.

```mermaid
flowchart TB
    Template["Funder template"] --> ChapterPlan["Chapter plan"]
    ChapterPlan --> DocService["DocumentWorkspaceService"]
    Context["Context bundle<br/>CC context, criteria,<br/>funded projects, uploads"] --> DocService
    DocService --> DraftTools["Draft chapter tools"]
    DraftTools --> Chapters["Chapters"]
    UserEdits["User edits"] --> DocService
    AgentEdits["Agent suggestions"] --> DocService
    DocService --> Revisions["Chapter revisions"]
    Chapters --> Revisions
    Sources["Evidence sources"] --> Citations["Evidence links"]
    Revisions --> Citations
    DocService --> Gaps["Missing facts"]
    Gaps --> Chapters
    Chapters --> Exporter["DOCX/PDF exporter"]
    Citations --> Exporter
```

Chapter fields:

- `chapter_id`
- `run_id`
- `template_section_id`
- `title`
- `body_markdown`
- `position`
- `status`: `empty`, `draft`, `needs_review`, `ready`, `deleted`
- `required`
- `user_locked`
- `deleted`
- `evidence_links`
- `latest_revision_id`

Revision fields:

- `revision_id`
- `chapter_id`
- `revision_number`
- `author_type`: `agent`, `user`, `system`
- `change_type`: `draft`, `edit_text`, `add_chapter`, `delete_chapter`,
  `restore_chapter`, `rewrite`, `citation_update`
- `body_markdown`
- `patch_summary`
- `created_at`

## Document Tool Deep Dive

Tools should be grouped by step and registered only when relevant. The LLM
should not be able to delete a chapter while it is only assembling context.
Export is not an LLM tool; it is a document workspace button that calls
preflight and generation routes.

### Tool Groups

| Group | Purpose | Writes CNB storage | Calls CC | Calls standalone DB |
| --- | --- | --- | --- | --- |
| Workflow tools | start, status, resume, retry | yes | no | no |
| Context tools | load CC summary, load bundle | yes | yes | yes |
| Ingest tools | convert uploads, build source inventory | yes | no | no |
| Research tools | funder profile, template, criteria | no | no | yes |
| Matching tools | find and explain similar projects | yes | no | yes |
| Document tools | chapters, text, evidence, gaps | yes | no | optional |
| Export button actions | preflight and generate DOCX/PDF | yes | no | no |

### Workflow Tools

#### `concept_note_start_run`

Starts or resumes a concept-note workflow for a selected city, project, funder,
and opportunity.

Input:

```json
{
  "user_id": "string",
  "city_id": "string",
  "project_id": "string",
  "funder_id": "string",
  "opportunity_id": "string",
  "thread_id": "uuid|null"
}
```

Output:

```json
{
  "run_id": "uuid",
  "status": "active",
  "workflow_step": "assembling_context",
  "next_action": "load_context"
}
```

Rules:

- Creates `concept_note_runs`.
- Creates initial empty document from the selected funder template.
- Reuses an active run if the same user, city, project, funder, and opportunity
  already has one.

#### `concept_note_get_status`

Returns current run state, current step, blockers, chapter counts, gaps, matched
project counts, and export readiness.

### Context Tools

#### `concept_note_load_cc_context`

Loads bounded CityCatalyst data for the selected city/project.

Context loaded:

- City profile summary.
- Project summary.
- GHGI summary if available.
- CCRA risk summary if available.
- HIAP actions/status if available.
- Module availability and known missing pieces.

Rules:

- Uses current CC-CA capability architecture.
- Returns summarized payloads, not raw route dumps.
- Stores a context snapshot in CA for reproducibility.

#### `concept_note_update_context_bundle`

Adds or replaces a context source in the run bundle.

Use cases:

- User uploaded a CAP.
- Funder profile changed.
- Similar projects were refreshed.
- User confirmed a fact in chat.

### Research Tools

#### `funder_get_profile`

Loads the curated funder profile and opportunity criteria.

Output includes:

- Funder overview.
- Eligible applicants.
- Eligible geography.
- Eligible project categories.
- Instrument type.
- Award size range.
- Match or cost-share rules.
- Required documents.
- Template reference.
- Stated criteria and derived matching signals.

#### `funder_get_template`

Returns the chapter schema that drives the document workspace.

Output example:

```json
{
  "template_id": "uuid",
  "chapters": [
    {
      "template_section_id": "problem_diagnosis",
      "title": "Problem Diagnosis",
      "required": true,
      "position": 1,
      "expected_content": "Problem, location, evidence, affected groups",
      "criteria_refs": ["criterion_id"]
    }
  ]
}
```

#### `similar_projects_search`

Finds comparable funded projects.

Input:

```json
{
  "run_id": "uuid",
  "funder_id": "uuid",
  "opportunity_id": "uuid",
  "category": "stormwater",
  "region": "MN",
  "instrument_type": "grant",
  "hazards": ["flood", "heat"],
  "limit": 10
}
```

Output:

```json
{
  "matches": [
    {
      "funded_project_id": "uuid",
      "score": 0.82,
      "reasons": ["same funder", "same instrument", "same region"],
      "evidence": []
    }
  ]
}
```

Rules:

- Apply deterministic filters before semantic ranking.
- Persist selected matches in `concept_note_matched_projects`.
- Return explainable factors and evidence.

### Ingest Tools

#### `concept_note_ingest_upload`

Converts and indexes a user upload.

Input:

```json
{
  "run_id": "uuid",
  "file_ref": "string",
  "filename": "string",
  "mime_type": "string",
  "source_label": "Climate Action Plan"
}
```

Output:

```json
{
  "source_id": "uuid",
  "status": "indexed",
  "chunk_count": 42,
  "warnings": [],
  "extracted_summary": "string"
}
```

Rules:

- Calls the converter adapter.
- Stores source text and source location metadata.
- Adds the upload to the context bundle.
- Emits an SSE event so the UI can show the upload as available context.

#### `concept_note_extract_facts_from_source`

Extracts structured facts from an indexed source and proposes chapter updates.

Rules:

- Does not silently overwrite user-locked chapter text.
- Produces suggested updates with source links.
- Can mark gaps when an expected fact is missing.

## Chapter Editing Tools

These tools are the core of the document workspace. They are CA-local document
tools. They do not write committed CC product data.

### `document_list_chapters`

Returns the current chapter outline.

Output:

```json
{
  "chapters": [
    {
      "chapter_id": "uuid",
      "template_section_id": "problem_diagnosis",
      "title": "Problem Diagnosis",
      "position": 3,
      "status": "draft",
      "required": true,
      "deleted": false,
      "user_locked": false,
      "latest_revision_id": "uuid"
    }
  ]
}
```

### `document_get_chapter`

Returns one chapter with current text, revision metadata, citations, gaps, and
template requirements.

### `document_add_chapter`

Adds a new chapter to the draft document.

Input:

```json
{
  "run_id": "uuid",
  "title": "Community Benefits",
  "position_after_chapter_id": "uuid|null",
  "body_markdown": "optional initial text",
  "reason": "User asked to add a dedicated benefits chapter"
}
```

Output:

```json
{
  "chapter_id": "uuid",
  "status": "draft",
  "revision_id": "uuid",
  "position": 7
}
```

Rules:

- Creates a new `concept_note_chapters` row.
- Creates an initial `concept_note_chapter_revisions` row with
  `change_type=add_chapter`.
- Re-numbers positions transactionally.
- If the funder template is strict, mark custom chapters as
  `template_section_id=custom`.
- Custom chapters should be allowed in the working draft but may be excluded
  from final export unless the export preflight allows appendices or optional
  sections.
- The tool should return a warning if the new chapter does not map to a funder
  template section.

When enabled:

- `drafting_document`
- `editing_document`

Confirmation:

- No confirmation for adding an empty or clearly requested chapter.
- Confirmation required if the agent proposes adding several chapters at once
  or if the chapter changes export structure.

### `document_delete_chapter`

Deletes a chapter from the working draft.

Input:

```json
{
  "run_id": "uuid",
  "chapter_id": "uuid",
  "delete_mode": "soft_delete",
  "reason": "User said this section is not needed"
}
```

Output:

```json
{
  "chapter_id": "uuid",
  "deleted": true,
  "revision_id": "uuid",
  "restore_available": true
}
```

Rules:

- Use soft delete only. Do not hard-delete chapter rows.
- Create a revision with `change_type=delete_chapter`.
- Preserve previous text and evidence links for restore.
- Re-number visible chapters transactionally.
- If the chapter is required by the funder template, do not delete silently.
  Instead mark it as `deleted=true` and create or update a gap explaining why a
  required section is intentionally skipped.
- If the chapter has user-authored text, require explicit user confirmation.

When enabled:

- `editing_document`

Confirmation:

- Required for non-empty chapters.
- Required for required template chapters.
- Required for chapters with citations or user edits.

### `document_restore_chapter`

Restores a soft-deleted chapter.

Rules:

- Clears `deleted`.
- Restores position or inserts at a requested position.
- Adds a `restore_chapter` revision.
- Reopens any gaps that were closed only because the chapter was deleted.

### `document_edit_chapter_text`

Edits the text inside a chapter.

Input:

```json
{
  "run_id": "uuid",
  "chapter_id": "uuid",
  "edit_mode": "replace_body|patch_body|append_text|rewrite_selection",
  "body_markdown": "new full body when replacing",
  "patch": {
    "find": "old text",
    "replace": "new text"
  },
  "selection": {
    "start_offset": 0,
    "end_offset": 120
  },
  "reason": "Improve alignment with funder criterion",
  "evidence_links": []
}
```

Output:

```json
{
  "chapter_id": "uuid",
  "revision_id": "uuid",
  "revision_number": 5,
  "status": "needs_review",
  "changed_ranges": []
}
```

Rules:

- Always creates a new revision.
- Never mutates old revision rows.
- Supports full replacement, patch replacement, append, and selected rewrite.
- Maintains evidence links where possible.
- If a patch cannot be applied cleanly, return a structured conflict and ask
  the user to confirm the current chapter text.
- If the chapter is `user_locked`, the agent may propose an edit but cannot
  apply it without explicit user confirmation.
- If an edit removes cited claims, mark affected citations as stale and surface
  them in the UI.
- If an edit adds factual claims without evidence, create a gap or require the
  agent to attach evidence.

When enabled:

- `drafting_document`
- `editing_document`

Confirmation:

- Not required for direct user edits.
- Required for agent edits to user-locked text.
- Required for edits that remove citations, budget numbers, partners, or named
  commitments.

### `document_reorder_chapter`

Moves a chapter before or after another chapter.

Rules:

- Reorders visible chapters transactionally.
- Does not change template section ids.
- Export preflight should warn if the order violates a strict funder template.

### `document_link_evidence`

Links a source chunk, funder criterion, CC fact, or similar project example to a
claim inside a chapter.

Rules:

- Evidence links should point to stable source ids and chunk ids.
- Each link should include a claim reference or text range where possible.
- The export source manifest should derive from these links.

### `document_flag_gap`

Flags missing or weak data for a chapter.

Examples:

- Missing budget amount.
- No confirmed project partner.
- Funder requires match funding and the user has not confirmed it.
- Comparable projects are too weak or regionally mismatched.

### `document_mark_chapter_ready`

Marks a chapter ready after required fields, citations, and user review are
complete.

Rules:

- Cannot mark ready while critical gaps are open.
- Can mark ready with non-critical caveats if the caveats are persisted.

## Document Edit Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Document workspace UI
    participant CA as CA /v1/messages
    participant Agent as CNB agent
    participant Doc as DocumentWorkspaceService
    participant DB as CNB storage

    User->>UI: Edit chapter text
    UI->>CA: Send edit event with run_id and chapter_id
    CA->>Doc: document_edit_chapter_text(author=user)
    Doc->>DB: Insert chapter revision
    Doc-->>CA: Revision result
    CA-->>UI: SSE document_chapter_updated

    User->>UI: Ask agent to improve chapter
    UI->>CA: Chat message
    CA->>Agent: Scoped editing tool pack
    Agent->>Doc: document_get_chapter
    Doc-->>Agent: Chapter, citations, gaps
    Agent->>Doc: document_edit_chapter_text(author=agent)
    Doc->>DB: Insert revision and stale citation markers
    Agent-->>CA: Summary of change
    CA-->>UI: SSE document_chapter_updated + assistant message
```

## Chapter Delete Confirmation Flow

```mermaid
sequenceDiagram
    participant Agent
    participant Doc as DocumentWorkspaceService
    participant UI as CityCatalyst UI
    participant User
    participant DB as CNB storage

    Agent->>Doc: Request delete chapter
    Doc->>Doc: Check required, non-empty, citations, user edits
    alt confirmation required
        Doc-->>UI: tool_result document_delete_confirmation_requested
        UI->>User: Show impact summary
        User->>UI: Confirm delete
        UI->>Doc: Confirmed delete
    end
    Doc->>DB: Soft delete chapter and insert revision
    Doc-->>UI: document_chapter_deleted
```

## Agent Tool Scoping

```mermaid
flowchart TB
    Step["Current workflow_step"] --> Registry["CNB capability registry"]
    Registry --> ContextTools["Context tools"]
    Registry --> ResearchTools["Research tools"]
    Registry --> MatchingTools["Matching tools"]
    Registry --> DocTools["Document tools"]

    ContextTools --> Agent["Scoped CNB agent"]
    ResearchTools --> Agent
    MatchingTools --> Agent
    DocTools --> Agent

    Agent --> Rules["Tool policy in prompt<br/>step-specific only"]
```

Example registry rows:

| Capability id | Step | Operation | Writes | Confirmation |
| --- | --- | --- | --- | --- |
| `concept_note.context.load_cc` | `assembling_context` | query | CNB context snapshot | no |
| `concept_note.upload.ingest` | `ingesting_user_files` | workflow | CNB source inventory | no |
| `concept_note.funder.get_profile` | `profiling_funder` | query | no | no |
| `concept_note.projects.search_similar` | `matching_examples` | query/workflow | CNB matches | no |
| `concept_note.document.add_chapter` | `drafting_document` | command | CNB document | sometimes |
| `concept_note.document.delete_chapter` | `editing_document` | command | CNB document | yes for non-empty/required |
| `concept_note.document.edit_text` | `editing_document` | command | CNB revision | sometimes |
| `concept_note.document.link_evidence` | `drafting_document` | command | CNB evidence links | no |

Export preflight, DOCX generation, and PDF generation are button-triggered route
actions. They are not registered in the scoped agent tool registry.

## Prompt Model

Add a new prompt entry in `climate-advisor/llm_config.yaml`:

```yaml
prompts:
  concept_note_builder: "prompts/concept_note_builder.md"
```

Prompt composition should follow the current CA pattern:

- General chat keeps using the default prompt.
- Active CNB runs use `concept_note_builder` as the workflow prompt.
- Runtime context injection is separate from prompt-file composition.
- The prompt should describe chapter editing rules, citation rules, and
  no-fabrication guardrails.

CNB context should be injected as a bounded JSON block:

```text
CONCEPT_NOTE_CONTEXT_BUNDLE_JSON
CURRENT_DOCUMENT_STATE_JSON
ACTIVE_WORKFLOW_STEP
UI_CONTEXT
```

## SSE Events

The UI needs typed events for chat and document state.

| Event | Purpose |
| --- | --- |
| `concept_note_run_started` | Run id and initial status. |
| `concept_note_context_loaded` | Context bundle is ready. |
| `concept_note_upload_ingested` | Uploaded file indexed and available. |
| `concept_note_funder_loaded` | Funder profile and template ready. |
| `concept_note_matches_updated` | Similar projects changed. |
| `document_chapter_added` | Chapter inserted. |
| `document_chapter_deleted` | Chapter soft-deleted. |
| `document_chapter_restored` | Chapter restored. |
| `document_chapter_updated` | New revision created. |
| `document_gap_added` | Gap or blocker added. |
| `document_evidence_linked` | Citation/evidence link added. |
| `document_delete_confirmation_requested` | UI must confirm delete. |
| `document_edit_confirmation_requested` | UI must confirm sensitive edit. |
| `concept_note_export_ready` | DOCX or PDF export created. |
| `concept_note_export_failed` | Export failed with stable reason. |

## Export Pipeline

```mermaid
flowchart LR
    Preflight["Export preflight"] --> Check["Check required chapters,<br/>gaps, citations,<br/>template order"]
    Check -->|pass| Render["Render document model"]
    Check -->|warnings| Confirm["User confirms warnings"]
    Confirm --> Render
    Render --> Docx["Generate DOCX"]
    Render --> Pdf["Generate PDF"]
    Docx --> Store["Store file"]
    Pdf --> Store
    Store --> Manifest["Source manifest"]
    Manifest --> Result["Export result"]
```

Export preflight should check:

- Required chapters present or intentionally skipped.
- Critical gaps resolved.
- Budget, partners, match funding, and commitments are sourced or user-confirmed.
- Custom chapters are allowed by the export mode.
- Citations have stable source refs.
- Deleted required chapters are represented in a preflight warning.

## Planned Routes

### Climate Advisor

```text
POST /v1/concept-notes/start
GET  /v1/concept-notes/{run_id}
GET  /v1/concept-notes/{run_id}/status
POST /v1/concept-notes/{run_id}/retry
POST /v1/concept-notes/{run_id}/uploads
POST /v1/concept-notes/{run_id}/matches/refresh
GET  /v1/concept-notes/{run_id}/document
POST /v1/concept-notes/{run_id}/document/chapters
PATCH /v1/concept-notes/{run_id}/document/chapters/{chapter_id}
DELETE /v1/concept-notes/{run_id}/document/chapters/{chapter_id}
POST /v1/concept-notes/{run_id}/document/chapters/{chapter_id}/restore
POST /v1/concept-notes/{run_id}/export/preflight
POST /v1/concept-notes/{run_id}/export/docx
POST /v1/concept-notes/{run_id}/export/pdf
```

### CityCatalyst

```text
POST /api/v1/concept-notes/start
GET  /api/v1/concept-notes/{run_id}
POST /api/v1/concept-notes/{run_id}/messages
POST /api/v1/concept-notes/{run_id}/uploads
GET  /api/v1/concept-notes/{run_id}/export/{export_id}

POST /api/v1/internal/ca/capabilities/city/load-context
POST /api/v1/internal/ca/capabilities/project/load-context
POST /api/v1/internal/ca/capabilities/ghgi/summary
POST /api/v1/internal/ca/capabilities/ccra/summary
POST /api/v1/internal/ca/capabilities/hiap/summary
```

## Implementation Responsibilities

The implementation should stay organized by responsibility, not by a prescribed
file layout.

| Responsibility | Owner | Boundary |
| --- | --- | --- |
| Workflow orchestration | Climate Advisor | Starts/resumes runs, resolves active step, scopes tools, streams responses. |
| CNB storage access | datateam managed CNB database | Climate Advisor uses typed contracts for runs, chapters, revisions, gaps, sources, evidence, and exports. It does not own CNB database infrastructure or migrations. |
| Research access | Climate Advisor integration over standalone DB | Reads funders, opportunities, templates, criteria, pipeline entries, funded projects, and funding links. |
| Document tools | Climate Advisor | Mutates draft document state through the CNB storage contract only. |
| File ingestion | Climate Advisor plus converter adapter | Registers uploads, calls conversion adapter, and stores converted source inventory through the CNB storage contract. |
| CC context loading | CityCatalyst | Provides bounded city, project, GHGI, CCRA, and HIAP summaries through internal capabilities. |
| CC bridge routes | CityCatalyst | Authenticated browser-facing proxy into CA workflow routes. |
| Capability registry | CityCatalyst and Climate Advisor | Defines step-scoped capability exposure; no flat tool bag. |
| UI workspace | CityCatalyst | Chat, chapter outline, editor, evidence/gap views, upload status, export controls. |

## Failure Handling

| Failure | User-visible behavior | System behavior |
| --- | --- | --- |
| CC context unavailable | Show missing CityCatalyst context and continue with uploads/interview. | Persist blocker and retry option. |
| Funder profile missing | Block drafting against a real template. | Mark `profiling_funder` blocked. |
| Converter failed | Show file-specific failure. | Keep upload ref and allow retry. |
| Similar projects weak | Continue but show caveat. | Persist match caveats. |
| Chapter edit conflict | Ask user to confirm current text. | Return structured conflict. |
| Required chapter deleted | Warn at export preflight. | Keep soft-deleted row and gap. |
| Export failed | Show stable export error. | Persist failed export row with retry. |

## Guardrails

- Do not fabricate budgets, partners, named commitments, eligibility rules, or
  award facts.
- Every factual chapter claim should link to a source, user confirmation, or
  CityCatalyst context snapshot.
- User-authored text is higher priority than model-generated text.
- Agent edits to user-locked chapters require confirmation.
- Required funder criteria must be represented as template requirements or gaps.
- Matching criteria must be curated and calibrated with NLC, not invented by the
  model.
- PDF conversion output is evidence input, not automatically trusted truth.

## Tests

Minimum test surface:

- Pydantic contracts for all CNB route payloads.
- CNB storage client and contract tests for run, chapter, revision, gap, and
  evidence behavior.
- Chapter add/delete/restore/reorder tests.
- Text edit conflict tests.
- User-locked chapter confirmation tests.
- Required chapter delete/export preflight tests.
- Source-link preservation tests when editing text.
- Matching tests with deterministic factor scores.
- Converter adapter tests with success, warning, and failure payloads.
- Prompt/tool registration tests proving only the active step's tools are
  available.
- SSE event shape tests for document updates.

## Implementation Phases

### Phase 1: Durable Document Workspace

- Integrate with datateam managed CNB database contracts for runs, chapters,
  revisions, gaps, sources, and evidence links.
- Add document tools:
  - list chapters
  - get chapter
  - add chapter
  - delete chapter
  - restore chapter
  - edit chapter text
  - link evidence
  - flag gap
- Add a minimal CC page with chat plus document workspace.

### Phase 2: Context Bundle and CC Context

- Add run start/resume/status.
- Add context bundle service.
- Add CC capability wrappers for city, project, GHGI, CCRA, and HIAP summaries.
- Persist context snapshots for audit and resume.

### Phase 3: Standalone DB and Matching

- Stand up funder/profile/template/project schema.
- Add curated ingest scripts.
- Add research tools and similar-project matching.
- Persist matched examples and show them in the document workflow.

### Phase 4: File Ingestion

- Add upload registration.
- Add PDF converter adapter.
- Attach converted source context to the context bundle.
- Enable mid-flow upload ingestion and source-linked drafting through the document workspace.

### Phase 5: Export

- Add export preflight.
- Add DOCX export generation.
- Add PDF export generation.
- Store export file refs and source manifest.
- Add retry and failure reporting.

## Open Questions

- Which funder and instrument type are the first release target?
- Which exact DOCX template should be treated as authoritative, and should PDF
  render from that same document model?
- Are custom chapters allowed in the final funder document, or only as
  appendices/internal notes?
- What source license rules apply to the Minnesota funded-project corpus?
- Which matching weights are NLC-approved hard gates versus soft signals?
- Should the export include inline citations, endnotes, or a separate source
  manifest only?
