# Code Quality Assessment

## Test Coverage

- **Overall**: Test coverage is established but an exact repository-wide percentage was not calculated during this documentation-only pass.
- **Unit Tests**: Present across Core services and Climate Advisor modules. Relevant existing tests cover catalog lifecycle, permissions, internal CA auth, inventory capability routes, agent registration, client auth, and tool behavior.
- **Integration Tests**: Present in API/contract and end-to-end areas; GitHub Actions include CA auth contract and catalog reconciliation workflows. The exact CC-737 cross-service contract matrix does not yet exist.

## Code Quality Indicators

- **Linting**: Configured for Core via ESLint/Prettier and OpenAPI via Spectral; Python formatting/linting conventions are documented but exact CI commands vary by service.
- **Code Style**: Generally consistent module boundaries and typed contracts in the affected Core/Climate Advisor slices.
- **Documentation**: Strong existing architecture notes for NativeInputCatalog, native storage, module scope, and Climate Advisor; the catalog-to-CA discovery contract is intentionally not yet documented because it is the CC-737 gap.

## Technical Debt / Gaps Relevant to CC-737

- Catalog lifecycle has producer/internal write endpoints but no end-user-scoped discovery capability for Climate Advisor.
- Climate Advisor request-time tool loading exists, but current registration is primarily static by chat/workflow mode rather than catalog-entry/source-capability selection.
- Existing legacy datasource access coexists with bounded capability tools; CC-737 must avoid widening or silently reusing raw datasource access as the new contract.
- Catalog scope fields are nullable and stored without cross-database foreign keys; authorization must therefore validate the caller against the underlying source/resource, not trust row metadata alone.
- Source availability/deletion behavior and non-disclosing error semantics need explicit cross-service contract tests.

## Patterns and Anti-patterns

- **Good Patterns**:
  - Core remains authorization and storage boundary.
  - Capability registries carry schemas, resource scope, and transport metadata.
  - Climate Advisor uses request-time tool builders and shared token references.
  - Context tools return bounded results and serialize explicit error envelopes.
  - Catalog registration is idempotent and version-aware.
  - Existing tests assert service auth and denied resource paths.
- **Anti-patterns to avoid for CC-737**:
  - Treating catalog existence as authorization.
  - Letting Climate Advisor query the catalog or source store with unrestricted database/storage access.
  - Passing S3 credentials, signed URLs, raw object access, or unbounded source payloads into Climate Advisor.
  - Loading every source capability into every request.
  - Revealing existence, labels, scope metadata, or source state for cross-scope, withdrawn, missing, or deleted sources.
  - Adding a parallel catalog store or unrelated refactoring.
