# Extractor Module Overview

Here's an overview of the `extractor` folder, showing its tree structure, the general purpose of each file, and the list of functions they contain along with brief descriptions.

```text
extractor/
├── extraction_functions.py
├── extractor_c40.py
├── extractor_general.py
├── requirements.txt
├── README.md
├── context/
│   ├── behavioral_change_targeted.py
│   └── intervention_type.py
└── utils/
    ├── llm_creator.py
    ├── llm_creator_async.py
    └── data_loader.py
```

## File Summaries

### extraction_functions.py

- **Purpose:** Extract individual fields from a Pandas row (C40 dataset) into a standardized schema.
- **Functions:**
  - `extract_ActionType(index, row)`: Splits "Adaption/Mitigation" column into a list of action types.
  - `extract_ActionName(index, row)`: Retrieves and cleans the "Title" column.
  - `extract_AdaptationCategory(index, row, action_type)`: For adaptation actions, returns "Category 1", else `None`.
  - `extract_Hazard(index, row, action_type)`: Maps "Climate hazards addressed" to a list of standardized hazard strings.
  - `extract_Sector(index, row)`: Maps "Category 1" to a predefined sector enum list.
  - `extract_Subsector(index, row, action_type)`: For mitigation actions, maps "Emissions Source Category" to enum list.
  - `extract_PrimaryPurpose(index, action_type)`: Uses action type list as primary purpose.
  - `extract_Description(index, row)`: Pulls the "Explainer for action card" column.
  - `extract_CoBenefits(index, row)`: Aggregates multiple co‑benefit columns into a dictionary.
  - `extract_GHGReductionPotential(index, row, action_type, sectors)`: Builds a GHG potential dict from "Extent" and sector data.
  - `extract_CostInvestmentNeeded(index, row)`: Reads the "Cost of action" column.
  - `extract_TimelineForImplementation(index, row)`: Reads the "Implementation Period" column.
  - **Async functions (LLM‑backed):**
    - `extract_InterventionType(...)`, `extract_BehavioralChangeTargeted(...)`, `extract_EquityAndInclusionConsiderations(...)`, `extract_AdaptionEffectiveness(...)`, `extract_Dependencies(...)`, `extract_KeyPerformanceIndicators(...)`, `extract_Impacts(...)`
    - These call the LLM to infer categories, behavioral changes, KPIs, impacts, and more.

### extractor_c40.py

- **Purpose:** Orchestrates processing of the C40 dataset, applies sync + async extractors per row, and writes output to JSON.
- **Key Functions:**
  - `process_row_with_limit(index, df_row)`: Limits concurrency via an asyncio semaphore.
  - `process_row(index, df_row)`: Invokes all `extract_*` functions for one row and builds the mapped dictionary.
  - `main(input_file, parse_rows)`: Loads data, schedules tasks, gathers results, and writes `c40_output.json`.

### extractor_general.py

- **Purpose:** Builds LLM prompts to extract mitigation/adaptation actions from free text according to the JSON schema.
- **Key Function:** `main(input, is_mitigation, is_adaptation)` creates the prompt and calls `generate_response`.

### README.md

- **Purpose:** High‑level overview of direct vs. generated attributes, lists all schema fields, and shows usage instructions.

### context/behavioral_change_targeted.py

- **Purpose:** Provides a multi‑paragraph `context_for_behavioral_change` string on behavioral‑change theory for prompt context.

### context/intervention_type.py

- **Purpose:** Defines `categories_of_interventions`, a dict mapping intervention type keys to descriptions.

### utils/llm_creator.py & llm_creator_async.py

- **Purpose:** Set up synchronous and asynchronous OpenAI clients and expose `generate_response` for LLM calls.

### utils/data_loader.py

- **Purpose:** Loads a CSV or Excel file into a Pandas DataFrame, handling file existence and type checks gracefully.

# Prioritizer Module Overview

Here's an overview of the `prioritizer` folder, showing its tree structure, the general purpose of each file, and the list of functions they contain along with brief descriptions.

```text
prioritizer/
├── prioritizer.py
├── __init__.py
├── package-lock.json
├── requirements.txt
├── README.md
├── LICENSE
├── CAP_data/
│   ├── weights.json
│   └── weights_temp_store.json
└── utils/
    ├── additional_scoring_functions.py
    ├── benchmarks.py
    ├── ml_comparator.py
    ├── prompt.py
    ├── reading_writing_data.py
    └── weights_optimization.py
```

## File Summaries

### prioritizer.py

- **Purpose:** Main script orchestrating prioritization of climate actions for a given city. Processes data loading, scoring, filtering, LLM ranking, and output.
- **Functions:**
  - `calculate_emissions_reduction(city, action)`: Computes total emissions reduction by applying reduction mappings to city emissions and action potentials.
  - `quantitative_score(city, action)`: Calculates a quantitative priority score combining hazard match, dependencies penalty, emissions reduction, sector weighting, adaptation effectiveness, timeline, etc.
  - **Classes:**
    - `class Action(BaseModel)`: Pydantic model to represent a prioritized action (fields: `action_id`, `action_name`, `actionPriority`, `explanation`, `city_name`).
    - `class PrioritizedActions(BaseModel)`: Pydantic model containing a list of `Action` for LLM responses.
  - `send_to_llm2(prompt)`: (stub) Possibly older LLM interaction route.
  - `send_to_llm(prompt: str) -> PrioritizedActions`: Calls OpenAI LLM with `o3-mini` model to rank actions qualitatively.
  - `qualitative_score(city, action)`: Uses LLM and bracket/tournament functions to produce a qualitative ranking.
  - `quantitative_prioritizer(cities, actions)`: Applies `quantitative_score` across cities and actions, returns top scoring actions.
  - `qualitative_prioritizer(top_quantitative, actions, city)`: Performs qualitative ranking on top quantitative subset for a given city.
  - `filter_actions_by_biome(actions, city)`: Filters actions list based on city's biome compatibility.
  - `ML_compare(actionA, actionB, city)`: Wrapper for ML comparator from utils to return a single-elimination comparator result.
  - `single_elimination_bracket(actions, city)`: Organizes actions into elimination bracket for LLM comparisons.
  - `final_bracket_for_ranking(actions, city)`: Runs multiple rounds of elimination to derive ranking.
  - `tournament_ranking(actions, city)`: Orchestrates a tournament of pairwise comparisons to produce final ordered list.
  - `main(locode: str)`: Entry point: reads city and actions data, runs quantitative & qualitative pipelines, writes output.

### **init**.py

- **Purpose:** Marks `prioritizer` as a Python package (empty file).

### package-lock.json

- **Purpose:** Node.js lockfile (likely for JS dependencies used by scripts/get_actions).

### requirements.txt

- **Purpose:** Python dependencies for the prioritizer module (e.g., `openai`, `pydantic`).

### README.md

- **Purpose:** Provides setup, usage instructions, and example CLI command for the prioritizer script.

### LICENSE

- **Purpose:** Contains the project's license text.

### CAP_data/

- **Purpose:** Stores JSON weight files used by the quantitative scorer.
- **Files:**
  - `weights.json`: Final optimized weight values for scoring criteria.
  - `weights_temp_store.json`: Temporary store of weight values during optimization.

### utils/additional_scoring_functions.py

- **Purpose:** Extra scoring utilities against city and action data.
- **Functions:**
  - `count_matching_hazards(city, action)`: Computes the proportion of city hazards matching action hazards.
  - `find_highest_emission(city)`: Identifies city's highest emission sector and its percentage share.

### utils/benchmarks.py

- **Purpose:** Benchmarks quantitative, qualitative, and ML comparators against expert-labeled data.
- **Functions:**
  - `load_data_from_folder(folder_path)`: Reads JSON comparison files into a DataFrame.
  - `remove_irrelevant_rows(df, remove_unsure)`: Cleans out "Irrelevant" (and optional "Unsure") labels.
  - `get_action_by_id(actions, target_action_id)`: Finds an action dict by its ID.
  - `update_contingency_table(predicted_label_quanti, predicted_label_ml, preferred_action)`: Updates error contingency counts.
  - `get_chi2_test_results()`: Performs a Chi-Square test on contingency table.
  - `get_accuracy_expert_vs_comparators(df, actions)`: Computes accuracy metrics for each comparator method.

### utils/ml_comparator.py

- **Purpose:** Implements an XGBoost-based comparator and SHAP waterfall plot generator.
- **Functions:**
  - `create_shap_waterfall(df, model)`: Generates and displays a SHAP waterfall plot for feature contributions.
  - `ml_compare(city, action_A, action_B)`: Uses a trained XGB classifier to choose the preferred action (returns 1 or 2).

### utils/prompt.py

- **Purpose:** Builds the LLM prompt for qualitative ranking.
- **Functions:**
  - `return_prompt(action, city)`: Generates a detailed prompt instructing the LLM how to rank and explain the top actions.

### utils/reading_writing_data.py

- **Purpose:** I/O helpers for reading city/action JSON and writing prioritized CSV.
- **Functions:**
  - `read_city_inventory(locode)`: Loads a city's inventory JSON by locode.
  - `read_actions()`: Reads actions list JSON for prioritization.
  - `write_output(top_actions, filename)`: Writes the final prioritized actions to a CSV.

### utils/weights_optimization.py

- **Purpose:** Implements weight optimization routines for the quantitative scorer.
- **Functions:**
  - `load_data_from_folder(folder_path)`: Reads comparison JSON files into a DataFrame.
  - `remove_irrelevant_rows(df, remove_unsure)`: Cleans Irrelevant/Unsure rows.
  - `get_action_by_id(actions, target_action_id)`: Looks up action dict by ID.
  - `quantitative_score_torch(city, action, weights)`: Torch-based variant of the quantitative scorer using provided weights.
  - `hinge_loss(score_diff, y, margin)`: Calculates hinge loss for pairwise comparisons.
  - `hinge_loss_torch(score_diff, y, margin)`: Torch version of hinge loss.
  - `compute_loss()`: Placeholder or stub for computing loss over dataset.
  - `optimize_weights(num_epochs, optimizer, weights, m)`: Runs optimization loop to update scoring weights.

# Scripts Module Overview

Here's an overview of the `scripts` folder, showing its tree structure, the general purpose of each file, and the list of functions they contain along with brief descriptions.

```text
scripts/
├── create_city_data/
│   ├── get_ccra.py
│   ├── run_ghgi_bulk_import.py
│   ├── run_ccra_bulk_import.py
│   ├── run_context_bulk_import.py
│   ├── get_context.py
│   ├── add_ghgis_to_city_data.py
│   ├── add_ccras_to_city_data.py
│   └── add_context_to_city_data.py
├── upload_to_frontend/
│   ├── enrich_for_frontend_schema.py
│   ├── run_pipeline.py
│   ├── upload_to_s3.py
│   └── run_pipeline_bulk.py
├── script_outputs/  (directory for script outputs)
├── get_actions.py
├── translate_explanations.py
├── translate_actions.py
├── add_explanations.py
├── update_adaptation_effectiveness.py
├── add_biome.py
├── xlsx_csv2json.py
├── delete_empty_actions.py
├── validator_city_data.py
├── validator_action_list_schema.py
├── json2xlsx_csv.py
└── combine_action_lists.py
```

## File Summaries

### create_city_data/get_ccra.py

- **Purpose:** Fetches Climate Change Risk Assessment (CCRA) data for a given city code and scenario.
- **Functions:**
  - `get_ccra(locode, scenario_name)`: Retrieves CCRA JSON data from an external API for the specified city and scenario.

### create_city_data/run_ghgi_bulk_import.py

- **Purpose:** Bulk imports GHG intensity data for multiple cities into local city data files.
- **Functions:**
  - `load_locodes_from_file(file_name)`: Reads a list of city codes from a file.
  - `process_city(locode)`: Fetches and writes GHG intensity data for one city.
  - `main(bulk_file)`: Orchestrates bulk import using a CSV of city codes.

### create_city_data/run_ccra_bulk_import.py

- **Purpose:** Bulk imports CCRA data for a list of cities.
- **Functions:**
  - Similar to `run_ghgi_bulk_import.py`, reads city codes, fetches CCRA data via `get_ccra`, and writes to files.
  - `main(bulk_file)`: Entry point for CCRA bulk import.

### create_city_data/run_context_bulk_import.py

- **Purpose:** Bulk imports additional contextual data for cities.
- **Functions:**
  - Reads city codes, fetches context data via `get_context`, and writes to city data files.
  - `main(bulk_file)`: Entry point for context bulk import.

### create_city_data/get_context.py

- **Purpose:** Fetches general context data (e.g., socio‑economic info) for a given city code.
- **Functions:**
  - `get_context(locode)`: Calls an external API to retrieve city context JSON.

### create_city_data/add_ghgis_to_city_data.py

- **Purpose:** Merges bulk‑imported GHG intensity data into existing city JSON files.
- **Functions:**
  - Reads GHGI files, loads city JSON, updates GHG fields, and writes back.

### create_city_data/add_ccras_to_city_data.py

- **Purpose:** Integrates CCRA hazard data into city JSON files.
- **Functions:**
  - Reads CCRA JSON outputs, loads city JSON, updates hazard entries, and writes back.

### create_city_data/add_context_to_city_data.py

- **Purpose:** Adds socio‑economic context data to city JSON files.
- **Functions:**
  - Reads context JSON outputs, loads city JSON, updates context fields, and writes back.

### upload_to_frontend/enrich_for_frontend_schema.py

- **Purpose:** Transforms city and action data into the frontend's expected JSON schema.
- **Functions:**
  - `enrich_for_frontend(...)`: Reads generic data files, reshapes and annotates them for frontend consumption.

### upload_to_frontend/run_pipeline.py

- **Purpose:** Executes the end‑to‑end pipeline to enrich data and upload to the frontend.
- **Functions:**
  - `main()`: Calls enrichment and upload steps in sequence.

### upload_to_frontend/upload_to_s3.py

- **Purpose:** Uploads prepared JSON files to an S3 bucket for the frontend.
- **Functions:**
  - `upload_to_s3(bucket_name, file_path)`: Pushes a file to the specified S3 bucket.

### upload_to_frontend/run_pipeline_bulk.py

- **Purpose:** Bulk runs the frontend upload pipeline over multiple city datasets.
- **Functions:**
  - Similar to `run_pipeline.py`, loops over city data folders and uploads each.

### get_actions.py

- **Purpose:** Fetches the master list of climate actions from the global API.
- **Functions:**
  - `get_actions(language: str = 'en') -> Optional[list[dict]]`: Retrieves climate actions JSON with retry logic.

### translate_explanations.py

- **Purpose:** Translates the `explanation` field in frontend JSON files into Spanish/Portuguese.
- **Functions:**
  - `translate_text(text: str, target_lang: str, model: str) -> str`: Calls OpenAI to translate a text string.
  - `translate_file_explanations(file_path: str)`: Loads a translated JSON, updates each entry's `explanation`, and saves.
  - `main()`: Finds all `_es.json`/`_pt.json` files and runs translation.

### translate_actions.py

- **Purpose:** Translates action names, descriptions, and lists into other languages.
- **Functions:**
  - `translate_text(text: str | None, target_language: str) -> str | None`: Translates a single string or returns `None`.
  - `translate_list(items: List[str], target_language: str) -> List[str]`: Translates list items in batch.
  - `translate_action(action: Dict[str, Any], target_language: str) -> Dict[str, Any]`: Translates all relevant fields of an action dict.
  - `main()`: Loads the action list, applies translations, and writes output files.

### add_explanations.py

- **Purpose:** Generates LLM‑driven `explanation` text for each action and adds it to the JSON.
- **Functions:**
  - `extract_city_code(filename: str) -> str`: Parses city code from a filename.
  - `load_city_data(city_code: str) -> dict`: Loads a city's JSON data.
  - `load_action_data() -> List[dict]`: Reads base action list.
  - `generate_single_explanation(...)`: Calls OpenAI to produce an explanation string for one action.
  - `update_actions_with_explanations(actions_data, city_data) -> List[dict]`: Iterates actions, adds `explanation`.
  - `main()`: Orchestrates reading, generating, and writing back updated actions.

### update_adaptation_effectiveness.py

- **Purpose:** Refines the `AdaptationEffectivenessPerHazard` field per action/hazard via an LLM.
- **Functions:**
  - `load_json_file(file_path: Path) -> dict`: Reads JSON file into Python.
  - `save_json_file(data: dict, file_path: Path)`: Writes Python object to JSON.
  - `get_effectiveness_per_hazard(action: dict) -> Tuple[...]`: Calls OpenAI to break down overall effectiveness into per-hazard levels.
  - `main()`: Loads merged actions, processes each adaptation action, and saves updates.

### add_biome.py

- **Purpose:** Annotates each action with a `Biome` field indicating ecosystem applicability.
- **Functions:**
  - `load_actions_data() -> List[Dict]`: Reads actions JSON.
  - `get_biome_for_action(action: Dict) -> str`: Infers biome tag (e.g., 'urban', 'wetland').
  - `update_actions_with_biome(actions: List[Dict]) -> List[Dict]`: Applies biome tagging.
  - `save_updated_actions(actions: List[Dict])`: Writes actions back to JSON.
  - `main()`: Orchestrates loading, tagging, and saving.

### xlsx_csv2json.py

- **Purpose:** Converts Excel or CSV files into JSON format using Pandas.
- **Functions:**
  - `xlsx_csv2json(input_file: Path, output_file: Path)`: Reads spreadsheet, writes JSON list.

### delete_empty_actions.py

- **Purpose:** Cleans action lists by removing entries with empty hazard or effectiveness fields.
- **Functions:**
  - `filter_empty_adaptation_effectiveness(df)`: Drops rows missing adaptation details.
  - `filter_empty_mitigation_ghg(df)`: Drops rows missing GHG info.
  - `main()`: Loads CSVs, applies filters, and saves cleaned lists.

### validator_city_data.py

- **Purpose:** Validates city JSON data against a schema.
- **Functions:**
  - `main(output_filename)`: Loads city data, runs JSON Schema validation, and reports errors.

### validator_action_list_schema.py

- **Purpose:** Ensures the action list JSON conforms to the generic schema.
- **Functions:**
  - `main(output_filename)`: Loads action list, validates against schema, and logs violations.

### json2xlsx_csv.py

- **Purpose:** Converts JSON files into Excel and CSV formats for downstream use.
- **Functions:**
  - `json2xlsx_csv(json_file: Path, output_file: Path)`: Reads JSON and writes to both XLSX and CSV.

### combine_action_lists.py

- **Purpose:** Merges multiple action list JSON files into a single consolidated list.
- **Functions:**
  - `combine_json_files(input_folder, output_file)`: Reads all JSONs in a folder, concatenates lists, writes out a single JSON.
