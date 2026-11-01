# Dedicated model trials — 2026-10-30

User requests three parallel agents, each GPT-6 Astra at xhigh, to actually test LOAM, UIUC/Golden-Muscat, and DIGMAPPER on JVP's two shared document examples. Each agent must work independently without further delegation. Preserve existing source inputs, code, benchmarks, exports and CityCatalyst checkout. Write only inside your assigned model-trials subdirectory. Download public code/weights and install an isolated environment there as needed; do not install into the shared existing virtualenv. No cloud-compute purchase or paid API calls for these trials.

## Sources and helpers (read-only)

Project: C:/Users/WBW/Documents/geo-map-recovery-20261028
Existing interpreter: C:/Users/WBW/AppData/Local/Temp/pdf-geojson-verification-20261028/.venv/Scripts/python.exe

- inputs/porto-alegre-arvc.pdf; six hazards/pages via porto.py PAGES (1-based: flood85, landslide93, heat100, drought106, arbovirus111, storm117).
- inputs/Richfield_FloodRiskPrioritization.pdf; five layers/pages via richfield.py LAYERS (1-based15,16,17,18,31).
- JVP shipped data in inputs/arvc-poa.json and inputs/richfield-flood-*.json.
- Current deterministic reconstruction: outputs/porto-experimental/*.geojson; exact PDF vectors outputs/richfield/*.geojson.
- Reference numeric raster derivatives inputs/arvc_off_risk_*_2050.png plus inputs/arvc-manifest.json. These are same-author derivatives, not independently authenticated original TIFFs. Reference values belong ONLY in evaluation, never inference, segmentation prompts, training, thresholds, or registration.
- porto.py has figure(), fit_ticks(), map_domain(), legend RAMP, coordinate transforms, aggregation/export helpers. benchmark.py has reference() and metrics(). Import read-only; route new outputs to your own directory, never run run.py against the main outputs.
- REPORT.md, BENCHMARK-100M.md and outputs/porto-benchmark.json explain existing limitations and baseline results.

## Evaluation contract

1. Pin upstream revisions, weight URLs/hashes and model identity. Inspect downloaded code before running. Prefer official pretrained checkpoints, no model training from evaluation labels.
2. Provide the source map and source-derived legend samples. Record whether manual layout/legend/georeference aids were used. For comparing segmentation, reuse our source-derived coordinate transform rather than fitting to the numeric reference. If your full system independently georeferences, score that separately.
3. Freeze decoding/resizing/mask arbitration/support thresholds before evaluating reference values. No tuning on test results. These previously audited maps/blocks cannot be described as a blind test.
4. Start inference with Porto heat and flood, then run all six hazards when feasible. For Richfield start 100-year inundation and then other layers when feasible. Do not silently limit coverage to an attractive crop. Report each of the 11 layers as succeeded/failed/not attempted with reason; bounded real installation/inference attempts are required before declaring unavailable.
5. Porto common evaluation is the existing 250m grid, origin and 3km hash blocks from benchmark.py. Use >=15 valid reference pixels per cell; missing predictions count unsuccessful in exact_all_pct. Report exact_common, exact_all, missing, bias/MAE, high-risk recall/precision, zero-reference and low-reference output coverage, with raw denominators. Values use legend bin midpoints; classes use 0.2/0.4/0.6/0.8. Preserve unknowns, never silently assign zero risk or restrict prediction to reference coverage. Document minimum predicted support and handling of overlapping model masks.
6. Richfield assess source-fidelity: IoU, precision/recall and edge errors versus direct PDF vector extraction in document coordinates/GeoPDF transform. This is not independently validated flood truth. Label fill geometry differs from rendered labels/strokes. Include f and fs paths via existing recovered vectors.
7. Save full predicted masks and aligned original/model overlay fragments at the same scale. Focus Porto heat on the existing crop from make_fine_overlay.py; Richfield Wood Lake crop from make_visuals.py. No generative image edits.
8. Save report.md, metrics.json, commands/logs, versions/hashes, predicted data and overlay HTML. Include exact rerun commands, model availability, installation/inference runtime, scope and limitations. If a method cannot run, save concrete failure evidence; do not substitute another method and keep the original name.

## Resource coordination

Host observed: 31.8 GiB RAM, RTX4070Ti 12 GiB, only 1.4 GiB GPU free at launch. Other work owns the occupied memory: do not kill processes or change system configuration. Use bounded tiling/batch sizes and CPU fallback if upstream supports it. If using GPU, acquire an exclusive lock file model-trials/gpu.lock via atomic exclusive creation, write your identity, and remove only your own lock on completion. If occupied, do independent CPU/setup work or CPU inference; do not busy-poll. Do not run three whole-map high-memory preprocessing jobs simultaneously; use tiles/sequential stages. Public downloads should be bounded to required checkpoints, not entire training datasets.

These are sibling agents. Keep all writes scoped to your own subdirectory except your owned transient lock. Do not create PRs, publish, send messages externally, or spawn other agents.
