Stationary Energy review tools:

- `stationary_energy_list_review_options`
  - Use before choosing Stationary Energy sources when the user asks which decisions remain, what source options are available, or gives a short reply that depends on current draft state.
  - Do not invent proposal ids, source ids, candidate ids, rows, values, or units.

- `stationary_energy_accept_one`
  - Use to stage one explicit Stationary Energy review choice for the active draft.
  - Use when the user is clearly referring to the single focused right-side Source review row, including requests like "save just that one" or "stage the one on the right".
  - Use only proposal and source/candidate identifiers present in the draft context or returned by `stationary_energy_list_review_options`.

- `stationary_energy_accept_multiple`
  - Use only after the user approves a bulk confirmation card and the confirmed choices are present in runtime context.
  - Invalid choices are skipped and reported by the tool.

- `stationary_energy_accept_all_recommended`
  - Use only after the user approves a bulk confirmation card for all recommended choices.
  - It stages only already-stored recommended candidates.

- `stationary_energy_request_bulk_review_confirmation`
  - Use when the user asks to apply several clear, named Stationary Energy choices in one turn.
  - It validates the choices and asks the UI to show a yes/no confirmation card without staging anything.

- `stationary_energy_request_all_recommended_confirmation`
  - Use for clear bulk instructions such as "accept all", "pick the best", or "use the recommendations".
  - It validates the current unresolved recommended choices and asks the UI to show a yes/no confirmation card without staging anything.

- `stationary_energy_request_staged_source_change_confirmation`
  - Use when the user asks to change staged/agreed Stationary Energy source choices.
  - It previews replacement choices for currently staged rows: a different available datasource for that segment when one exists, otherwise "Leave empty".
  - It asks the UI to show a confirmation card without staging anything.

- `stationary_energy_request_staged_sources_rollback_confirmation`
  - Use when the user asks to roll back, undo, or remove staged/agreed Stationary Energy source choices.
  - It returns exactly which active staged choices would be rolled back and asks the UI to show a confirmation card without changing the draft.

- `stationary_energy_rollback_staged_sources`
  - Use only after the user approves a rollback confirmation card and the confirmed rollback choices are present in runtime context.
  - It removes the active staged choices from the draft review state. It does not save rows to inventory.

- `stationary_energy_save_review_draft`
  - Use when the user asks to save the reviewed draft in Clima.
  - Do not use for single-row "save" requests that clearly mean staging one source choice in the right-side review pane.
  - This does not save rows to the CityCatalyst inventory.

- `stationary_energy_request_inventory_save_confirmation`
  - Use only when the user asks to save reviewed rows to inventory.
  - It requests a UI confirmation card; do not commit Stationary Energy rows to inventory from chat without that separate explicit confirmation.
