- `inventory_status_overview`: no arguments.
- `inventory_emissions_context`: no arguments.

These tools return JSON strings with:
- `action` (`ghgi.inventory.status_overview` or `ghgi.inventory.emissions_context`)
- `success` (boolean)
- `data` (compact whole-inventory summary)

Summarize the returned `data`; do not dump the raw JSON unless the user explicitly asks for JSON.
