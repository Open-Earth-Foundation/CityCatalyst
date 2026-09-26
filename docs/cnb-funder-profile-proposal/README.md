# CNB funder profile creation · design proposal (CC-870)

Open [`index.html`](./index.html) in a browser. No build, no server, it is self-contained.

## What this is

A click-through mockup and data-model proposal for
[CC-870](https://linear.app/openearth/issue/CC-870/cnb-add-funder-profiles-through-a-form-or-document-upload):
letting a Concept Note Builder user create a funder profile either through a
structured form or by uploading a funder document and reviewing the extracted
profile before saving.

Selecting an existing funder is already implemented on `develop` and is shown
only as the entry point.

## Contents

- **Step 0** entry point inside the existing "Choose a funder" dialog
- **Step 1** method choice (document or from scratch)
- **Step 2A** structured form, including the validation state
- **Step 2B** upload flow in four states: idle, processing, failed with retry, ready
- **Step 3** review table with per-field provenance (entered / extracted / edited / missing),
  evidence quotes and confidence
- **Step 4** funder saved on the run, plus the reload state with a pending extraction
- **Data model** extensions to `cnb.funders`, a new `funder_profile_extractions` job table,
  the `profile_fields` provenance JSON, and Pydantic / TypeScript contracts
- **API** run-scoped endpoints; only two are conceptually new

## Open decisions

- User-created funders are scoped to the city rather than the global catalogue.
- Only the funder name is required to save; other gaps surface in the drafting checklist.
- The "other agreed fields" from the ticket still need confirming with the pilot cities.
