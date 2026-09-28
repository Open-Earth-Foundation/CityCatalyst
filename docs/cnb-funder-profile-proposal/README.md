# CNB: add a funder from a document or by hand · design proposal (CC-870)

Open [`index.html`](./index.html) in a browser. No build, no server, it is self-contained.

## What this is

A click-through mockup for
[CC-870](https://linear.app/openearth/issue/CC-870/cnb-add-funder-profiles-through-a-form-or-document-upload):
adding a funder that is not in the catalogue, either from an uploaded funder
document or by hand, and reviewing it before it is added.

The proposal adds **only a new ingestion path**:

- **UI:** reuses the existing `FundingSelectionDialog` (rail and details pane),
  the funding details views, the upload rows with retry, and the Context cards.
  The add flow is a new state of the same dialog, not a new modal.
- **Data:** no changes to `funders`, `funding_opportunities` or
  `funder_templates`. The review form edits exactly those columns. Per-field
  provenance goes in the existing `source_documents` and `funding_evidence`
  tables.
- **Extraction:** produces the existing `FundingOpportunityResearchBundle`
  shape, so an added funder is an ordinary catalogue row.

## Contents

1. Entry point in the funder list rail (also shown when search finds nothing)
2. Choose between uploading a document and entering details by hand
3. Reading the document: processing, failed with retry, and ready states, plus the Context card while an import is pending
4. Review: funder, programme and application template, with where each value came from
5. Added and selected through the existing application-context save; Context cards unchanged
6. By-hand path and its validation
7. Mapping of each reviewed field to an existing column, the pipeline, and five new endpoints

## Defaults taken in the implementation (can be revisited)

- Added funders join the shared catalogue: `funders` has no city or owner column.
- A document without an application form still needs at least one chapter, which the user types in the review step.
- Editing an added funder later is out of scope for CC-870.
