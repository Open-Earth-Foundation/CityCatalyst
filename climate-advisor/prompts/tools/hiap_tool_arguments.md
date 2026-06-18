`hiap_load_context`
- Takes no arguments.

`hiap_update_selection`
- `action_type` (string, required): `mitigation` or `adaptation`.
- `selected_action_ids` (array of strings, required): exact HIAP action ids or ranked action ids from the current context.

`hiap_generate_action_plan`
- `action_id` (string, required): exact HIAP action id from the current context.
- `action_type` (string, required): `mitigation` or `adaptation`.

`hiap_rerank_action`
- `action_id` (string, required): exact ranked HIAP action id or ranked row id from the current context.
- `action_type` (string, required): `mitigation` or `adaptation`.
- `target_rank` (integer, required): 1-based rank position to move the action to.

`hiap_read_action_plan`
- `action_id` (string, required): exact HIAP action id from the current context.
