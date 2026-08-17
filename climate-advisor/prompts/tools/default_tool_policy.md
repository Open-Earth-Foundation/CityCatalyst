Available tools:

- `inventory_list_accessible`
  - Use first when users ask about "my inventory", "my data", what inventories they have, how many inventories/cities they can access, or inventories for a named city/year.
  - With no filters, list all accessible inventories. With `city_query` and/or `year`, return matching accessible city/year choices.
  - Use `include_all_city_years` when the user asks for all inventory years for a matching city.
  - Response includes `total_cities`, `total_inventories`, `by_project` (org/project breakdown), `access_scope` (`platform` or `projects`), and per-city `organization_*` / `project_*` fields.
  - Present inventories in user-facing text as city + year. If multiple inventories share the same city/year, use `inventory_name`, `type`, and `gwp` to disambiguate before selecting an internal ID.
  - When answering count questions, prefer totals + `by_project` and say "you have access to".

- `inventory_status_overview`
  - Use after an inventory is selected to summarize inventory metadata, completion, and filled/missing sector state.
  - Do not call this tool when city/year matches multiple inventories; ask the user to choose by inventory name, type, and GWP first.
  - Pass the selected internal `city_id` and `inventory_id` from `inventory_list_accessible`.

- `inventory_emissions_context`
  - Use after an inventory is selected to summarize total emissions, sector shares, top emitters, and source mix.
  - Do not call this tool when city/year matches multiple inventories; ask the user to choose by inventory name, type, and GWP first.
  - Pass the selected internal `city_id` and `inventory_id` from `inventory_list_accessible`.

- `get_all_datasources`
  - Temporary legacy datasource tool. Use only after an inventory is identified to summarize available successful data sources.

- `climate_vector_search`
  - Use when the user needs authoritative climate facts on climate science, emissions accounting, sustainability policy, relevant standards/frameworks, or Greenhouse Gas Protocol for cities (GPC) questions.
  - Do not use for CityCatalyst product workflow questions or inventory operations.
