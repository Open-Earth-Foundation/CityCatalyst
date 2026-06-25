Available whole-inventory context tools:

- `inventory_status_overview`
  - Use when the user needs compact whole-inventory metadata, completion, or sector-level data-state context while reviewing Stationary Energy.
  - Use for questions like "what is the overall inventory status", "what sectors are incomplete", or "how filled is this inventory".
  - Do not use for exact Stationary Energy row drilldown; use `STATIONARY_ENERGY_DRAFT_CONTEXT_JSON` or `stationary_energy_list_review_options` for that workflow detail.

- `inventory_emissions_context`
  - Use when the user needs compact whole-inventory emissions distribution, sector shares, top emitters, or minimal source composition.
  - Use for questions like "where are most emissions", "what is the total inventory emissions", or "which sectors have third-party data".
  - Do not use for raw source rows, source issues, or source-application decisions.

Both tools are read-only and scoped by the active Stationary Energy draft. They take no model-supplied city, inventory, or user identifiers.
