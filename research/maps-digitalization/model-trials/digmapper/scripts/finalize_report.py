"""Assemble the evidence-backed blocked trial; never synthesize model predictions."""
import datetime, hashlib, html, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def read(p): return json.loads((ROOT/p).read_text(encoding='utf-8'))
def write(p,v): (ROOT/p).write_text(json.dumps(v,indent=2,ensure_ascii=False,allow_nan=False),encoding='utf-8')
def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
manifest=read('inputs/manifest.json'); offline=read('outputs/offline-legend-results.json')
versions=read('evidence/versions.json')
logs=[json.loads(p.read_text(encoding='utf-8')) for p in sorted((ROOT/'logs').glob('*.json'))]
priority={'porto-heat','porto-flood','richfield-inundation-100yr'}
common_reason='No released full DIGMAPPER workflow or TOPAZ implementation/checkpoint located. Paper-linked layout weights unavailable; Detectron2 installation failed. GPT-4o calls prohibited by trial scope.'
null_porto={k:None for k in ['exact_common_pct','exact_all_pct','missing_pct','bias','mae','high_risk_recall','high_risk_precision','zero_reference_output_coverage_pct','low_reference_output_coverage_pct']}
porto_denominators={k:None for k in ['eligible_reference_cells','common_cells','exact_common_cells','exact_all_cells','missing_cells','reference_high_risk_cells','predicted_high_risk_cells','true_positive_high_risk_cells','zero_reference_cells','zero_reference_cells_with_prediction','low_reference_cells','low_reference_cells_with_prediction']}
null_rich={k:None for k in ['iou','precision','recall','edge_median_m','edge_p95_m','edge_p99_9_m','edge_max_m']}
layers=[]
for r in manifest['layers']:
    did_attempt=r['id'] in priority
    attempt=read(f"outputs/{r['id']}-layout-attempt.json") if did_attempt else None
    layers.append({'id':r['id'],'dataset':r['dataset'],'layer':r['layer'],'page_1based':r['page'],
        'status':'failed' if did_attempt else 'not_attempted',
        'status_scope':'pretrained layout component startup; not a full-system inference run',
        'full_system_status':'blocked','full_system_attempted':False,
        'reason':attempt['error'] if did_attempt else 'Shared setup/weight blockers established on priority maps; repeated startup attempts on other layers would not run inference.',
        'source_preparation_status':'succeeded','legend_preparation_status':'succeeded',
        'pretrained_inference_completed':False,'predictions_produced':False,
        'predicted_mask':None,'predicted_geojson':None,'georeferencing_model_result':None,
        'evaluation_status':'not_scored_no_model_output',
        'metrics':dict(null_porto if r['dataset']=='porto' else null_rich),
        'raw_denominators':dict(porto_denominators if r['dataset']=='porto' else {'prediction_area':None,'reference_area':None,'intersection_area':None,'union_area':None,'edge_vertices_checked':None}),
        'evaluated_cells_or_pixels':0,'source_image':r['source_image'],
        'component_attempt':f"outputs/{r['id']}-layout-attempt.json" if did_attempt else None})
source_verification=[{**p,'sha256_after':sha(p['path']),'unchanged':sha(p['path'])==p['sha256']} for p in manifest['source_pdfs']]
write('evidence/source-preservation.json',source_verification)
metrics={
 'schema_version':1,'method':'DIGMAPPER','paper':'https://arxiv.org/abs/2506.16006',
 'trial_date':'2026-10-30','generated_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'status':'blocked','full_system_runnable':False,'full_system_tested':False,
 'reason':common_reason,'independent_DIGMAPPER_success':False,'LOAM_run':False,
 'successful_pretrained_inferences':0,'full_system_scores':None,
 'coverage':{'required_layers':11,'prepared_layers':11,'pretrained_component_startup_attempts':3,
             'startup_failures':3,'remaining_layers_not_attempted':8,'predicted_layers':0,
             'offline_prompt_dry_runs':2,'paid_api_calls':0},
 'components':[
  {'name':'DIGMAPPER Docker/Luigi orchestration','status':'blocked','repository':None,'checkpoint':None,
   'evidence':'Author-owned CriticalMAAS_AIM clone is empty; no full-system release identified in paper, author project, public author/org repositories.'},
  {'name':'TOPAZ polygon extraction','status':'blocked','repository':None,'checkpoint_url':None,'checkpoint_sha256':None,
   'evidence':'Named by paper section 2.2; no official implementation or weights located in examined sources. LOAM is not a substitute.'},
  {'name':'paper-linked LARA LayoutLMv3 detector','repository':'https://github.com/DARPA-CRITICALMAAS/uncharted-ta1',
   'revision':versions['repositories']['uncharted-ta1']['revision'],'status':'failed_installation_and_missing_weights',
   'checkpoint_url':'s3://pantera-file-test/lara/segmentation/layoutlmv3_20240925/model_final.pth',
   'checkpoint_sha256':None,'config_yaml_sha256':None,'config_json_sha256':None,
   'weight_probe_result':'HTTP 404 NoSuchBucket at regional and global S3 HTTPS endpoints',
   'container_result':'uncharted/lara-segmentation:latest denied; authentication required',
   'installation_result':'Detectron2 pinned revision a59f05630a8f205756064244bf5beb8661f96180 fails C++ compile; see logs/install-layout-longpaths.log',
   'map_attempts':3,'predictions_produced':False},
  {'name':'author legend ICL implementation','repository':'https://github.com/knowledge-computing/criticalmaas-legend-detection',
   'revision':versions['repositories']['criticalmaas-legend-detection']['revision'],'status':'offline_preparation_only',
   'model_requested':'gpt-4o','model_called':False,'manual_layout_aids':True,'example_pairs':5,
   'prepared_layers':11,'prompt_dry_runs':2,'predictions_produced':False,
   'limitation':'Related GeoSearch 2025 author release; offline dry-run is not DIGMAPPER inference or a 15-example accuracy reproduction.'},
  {'name':'LDTR line detector','repository':'https://github.com/knowledge-computing/LDTR',
   'revision':versions['repositories']['LDTR']['revision'],'status':'cpu_extension_build_failed',
   'checkpoint_url':'https://drive.google.com/file/d/1Bjes7tXUZRDCCQrlXqPs2tgWDO5q9hpL/view',
   'checkpoint_sha256':None,'checkpoint_downloaded':False,'download_response':'Public Google Drive size warning offers thrust_fault_line_model.pt (934M); the saved response is HTML, not weights.',
   'config_url':'https://drive.google.com/file/d/1p7nlIqAiCZonahATYPCDQIFyZM-lyKlL/view',
   'config_sha256':sha(ROOT/'evidence/ldtr-thrust-config.txt'),
   'error':'NotImplementedError: Cuda is not availabel',
   'scope':'Fault-line detector, not a flood/risk polygon extractor. Download beyond warning deferred after CPU extension failed; no GPU allocation attempted.'},
  {'name':'DIGMAPPER georeferencing','status':'not_attempted','score':None,
   'reason':'Integrated text/visual pipeline unavailable. Public MapLocator README is a demonstration link; no recovered source transform is counted as independent model georeferencing.'}
 ],
 'evaluation_contract':{
   'blind_test':False,'numeric_reference_values_read':False,'reference_used_for_inference':False,
   'porto_grid_metres':250,'porto_origin_utm':[462000,6692000],'porto_grid_columns':152,
   'porto_hash_block_metres':3000,'minimum_reference_pixels_per_cell':15,
   'class_boundaries':[0.2,0.4,0.6,0.8],'value_decoding':'legend bin midpoints if genuine polygon masks become available',
   'missing_prediction_policy':'Unsuccessful in exact_all for a completed inference trial; this blocked pre-inference trial is unscored.',
   'unknown_policy':'No zero-risk assignment; no fabricated empty masks.',
   'polygon_mask_arbitration':None,'minimum_predicted_support':None,
   'why_no_polygon_decoding_policy':'TOPAZ model/output unavailable; no executable polygon decoder or tuned thresholds invented.',
   'layout_threshold_frozen':0.25,'layout_input_resize':'None in local attempt; native Porto raster, Richfield 144 DPI full page; upstream model transform never reached.',
   'manual_aids':'Source-derived legend crops; five hand-boxed printed heat legend examples only for offline prompts. Tick/GeoPDF coordinates retained for future alignment.',
   'richfield_reference':'Existing direct PDF fill geometry including f and fs paths; source-fidelity reference, not independently verified flood truth.',
   'richfield_reference_read':False,'aligned_source_fragments_saved':True,'model_overlay_available':False},
 'layers':layers,'offline_component_results':'outputs/offline-legend-results.json',
 'runtime_seconds':{'torch_install':read('logs/install-torch.json')['elapsed_s'],
   'layout_final_build_attempt':read('logs/install-layout-longpaths.json')['elapsed_s'],
   'legend_install':read('logs/install-legend.json')['elapsed_s'],
   'ldtr_cpu_extension_attempt':read('logs/ldtr-cpu-extension-retry.json')['elapsed_s'],
   'priority_layout_startups':sum(read(f'outputs/{p}-layout-attempt.json')['elapsed_s'] for p in priority),
   'offline_legend_command':read('logs/offline-legend.json')['elapsed_s'],
   'pretrained_forward_pass':None},
 'gpu':{'used':False,'lock_acquired':False,'cpu_thread_limit':2},
 'source_pdfs_unchanged':all(v['unchanged'] for v in source_verification),
 'evidence':{'versions':'evidence/versions.json','download_probes':'evidence/downloads.json',
             'release_probes':'evidence/release-probes.json','component_probes':'evidence/component-probes.json',
             'commands':'commands.ps1','logs':'logs','overlay':'overlay.html'},
 'limitations':['No full-system score can be inferred from offline component preparation.',
                'No pretrained checkpoint was loaded and no forward pass completed.',
                'Absence from examined public sources does not prove no private or differently named release exists.',
                'LDTR weights appear publicly offered; missing checkpoint claims apply to layout/TOPAZ, not every component.']}
write('metrics.json',metrics)
write('outputs/prediction-manifest.json',{'status':'no_predictions','reason':common_reason,'masks':[],'geojson':[],
      'overlay_status':'source_only_with_explicit_blocked_notice','no_empty_masks_fabricated':True})
table='\n'.join(f"| {r['id']} | {r['page_1based']} | {r['status']} | {'Detector import failed' if r['id'] in priority else 'Shared setup blockers; no additional launch'} |" for r in layers)
report=f'''# DIGMAPPER trial: blocked full system

Test date: 2026-10-30. Scope: JVP's six Porto Alegre hazards and five Richfield layers. **No full-system inference completed, no pretrained checkpoint was loaded, and no mask or GIS prediction was produced. Accuracy metrics are null, not zero or an invented score.** No LOAM run was performed or counted as DIGMAPPER success.

## What was actually executed

Created an isolated Python 3.11.15 environment in this directory and installed PyTorch 2.0.1 / torchvision 0.15.2. Cloned and inspected official linked/author code before executing it. Attempted the LARA layout installation four times, resolving a missing build dependency, interpreter mismatch, and Git path-length issue; the final attempt reached native C++ compilation and failed. Loaded full source images and attempted the local layout detector on Porto heat, Porto flood, and Richfield 100-year inundation, in that order. All three stopped at the unavailable Detectron2 import. These are component startup failures, not completed inference runs.

Installed the authors' released legend package, ran its actual `prepare()` implementation on **all 11 source layers**, and verified the resulting artifact bundles. Ran its `infer(..., dry_run=True)` on Porto flood and Richfield 100-year with five manually boxed printed heat-legend examples. It saved prompts and input snapshots; it made **zero model calls**. This tests preparation and serialization only. No accuracy is claimed for the five-example configuration or for DIGMAPPER's 15-example method.

Cloned LDTR, downloaded its public thrust-fault configuration, requested its published checkpoint, and attempted to build its required extension in CPU mode. The extension raised `NotImplementedError: Cuda is not availabel`. The weight URL returned an HTML download confirmation offering a 934M checkpoint; it did not return model bytes. The full checkpoint transfer was not pursued after the extension failed. No fault-line inference was run, and fault lines would not supply the requested flood/risk polygon masks.

## Release identity and precise blockers

The [paper](https://arxiv.org/html/2506.16006v1) describes LayoutLMv3 layout segmentation, GPT-4o legend interpretation, **TOPAZ polygon extraction**, LDTR line extraction, point detection, and text/visual georeferencing, wrapped in Docker modules with Luigi orchestration. TOPAZ is the relevant polygon model. Running LOAM or another segmenter would not reproduce this system.

| Component | Primary source and pinned revision | Observed availability |
|---|---|---|
| Full DIGMAPPER/AIM workflow | [Author AIM repository](https://github.com/knowledge-computing/CriticalMAAS_AIM) | Actual clone reports an empty repository; no revision, Docker modules, Luigi DAG, or system runner obtained. |
| LayoutLMv3 | [Paper-linked LARA repository](https://github.com/DARPA-CRITICALMAAS/uncharted-ta1/tree/{versions['repositories']['uncharted-ta1']['revision']}) | Code downloaded; required map-specific `config.yaml`, `config.json`, and `model_final.pth` not obtained. |
| Legend ICL | [Author release](https://github.com/knowledge-computing/criticalmaas-legend-detection/tree/{versions['repositories']['criticalmaas-legend-detection']['revision']}) | Installed and offline functions tested. Real prediction requires GPT-4o; paid API calls excluded. This is a related author release, not a recovered full-system package. |
| TOPAZ | [Paper section 2.2](https://arxiv.org/html/2506.16006v1#S2.SS2) | No official runnable implementation or checkpoint located. Public author/org listings and TOPAZ search evidence retained. |
| LDTR | [Author release](https://github.com/knowledge-computing/LDTR/tree/{versions['repositories']['LDTR']['revision']}) | Code and configuration downloaded. Public checkpoint offered; CPU extension build failed. |
| Georeferencing and point extraction integration | [Author project](https://sofiakirsanova.github.io/projects/criticalmaas/), [MapLocator](https://github.com/knowledge-computing/MapLocator), [point-data generator](https://github.com/knowledge-computing/criticalmaas-TA1-synthmap-points) | Related demonstration/generator sources located; no verified complete DIGMAPPER deployment, georeferencing integration, or paper-specific point checkpoint obtained. |

The [pinned LARA workflow](https://github.com/DARPA-CRITICALMAAS/uncharted-ta1/blob/7a50dc0cecde38b6c5db9c8f7d01b3e628bcf8b9/.github/workflows/build_containers.yml) names `s3://pantera-file-test/lara/segmentation/layoutlmv3_20240925` and AWS secrets. Actual anonymous GETs for all three required files returned **HTTP 404 `NoSuchBucket`**, including a second global-endpoint weight request. This is the current observed response, not a claim that the URL presently returns access denied. Responses, URLs, and SHA-256 hashes are in `evidence/release-probes.json` and `evidence/component-probes.json`.

GitHub releases for the linked repository were empty. The advertised container `uncharted/lara-segmentation:latest` returned **`denied: requested access to the resource is denied` / `unauthorized: authentication required`** to `docker manifest inspect`. Docker itself was available (29.9.2), so an unavailable daemon is not the reason for stopping. No image was pulled, service started, or host configuration changed.

The final Detectron2 build used upstream-pinned commit `a59f05630a8f205756064244bf5beb8661f96180` and failed with **`fatal error C1083: Cannot open compiler generated file: '': Invalid argument`**, followed by compiler exit 1. Earlier recoverable errors and the final failure remain in the logs. Installing Python package metadata with `--no-deps` afterwards did not make the detector runnable; the actual priority-map attempts all report **`ModuleNotFoundError: No module named 'detectron2'`**. Solving compilation alone would still leave the layout checkpoint and TOPAZ/system release missing.

Search covered the paper's links, the authors' project pages, InferLink and Knowledge Computing public repositories, the CriticalMAAS organization, GitHub repository/release/issue endpoints, Hugging Face exact-name searches, the documented S3 source, and the documented container. The [InferLink MapSense page](https://www.inferlink.com/mapsense) offers a pilot service, not a public DIGMAPPER download in the examined material. No contact was made. Negative release findings are bounded to these sources and this date.

## Coverage

Every row has successful source and offline legend preparation. `failed` below means the named layout component was launched and failed before model loading. `not_attempted` means no additional detector launch after the same blockers were established. **Full-system status is blocked for all 11 rows.**

| Layer | PDF page (1-based) | Pretrained component status | Reason |
|---|---:|---|---|
{table}

## Inputs, aids, and evaluation limits

Porto input is the full largest embedded map image from each prescribed page, at native resolution (heat 1213 x 1758; flood 1155 x 1668). Selecting that embedded figure is a source-derived layout aid. Richfield input is each complete prescribed page rendered at 144 DPI (2448 x 1584). Sequential preparation avoided concurrent large page jobs. Manual source-legend crops and the five hand-boxed heat-legend examples are recorded explicitly in `inputs/manifest.json` and `inputs/heat-legend-example-manual.json`. They are not model detections.

Source-derived Porto printed-tick transforms and Richfield GeoPDF transforms were retained for alignment. They were not counted as independent model georeferencing. The Porto heat fragment exactly follows `make_fine_overlay.py` (cell 21547, 3000 x 1750 m extent), and the Richfield Wood Lake fragment follows `make_visuals.py` (PDF rectangle 280,285,600,465; 3 pixels/point). `overlay.html` displays those originals and explicitly marks the model overlay unavailable. No fabricated or all-zero mask is provided.

The layout confidence threshold was fixed at the upstream default 0.25 before startup attempts; CPU mode and full images were fixed. No polygon decoder, support threshold, or overlap arbitration was invented because the TOPAZ model and its outputs were unavailable. No numeric reference rasters, benchmark values, training labels, or reference geometry were used for inference or tuning. These previously audited examples are not a blind test.

The specified Porto comparison would use the common 250 m grid, origin (462000,6692000), 152 columns, 3 km hash blocks, >=15 valid reference pixels/cell, legend-bin midpoint values and class thresholds 0.2/0.4/0.6/0.8. Missing model predictions would count unsuccessful in `exact_all` for a completed inference trial. Here, inference never ran, so exact/common/all, missing, bias/MAE, high-risk recall/precision, zero/low-reference coverage, and their eligible denominators are **null / not evaluated**. Zero evaluated cells is recorded separately; null does not mean zero risk or zero eligible cells.

Richfield IoU, precision/recall, and edge-error metrics are likewise null. The intended comparison is against existing direct PDF vectors including both `f` and `fs` fill paths in document/GeoPDF coordinates, rather than rendered text/stroke pixels. That is source-fidelity, not independently validated flood truth. No reference scoring was performed without predicted geometry.

## Runtime, environment, and reproducibility

Recorded runtimes: PyTorch install {metrics['runtime_seconds']['torch_install']:.3f} s; final layout build {metrics['runtime_seconds']['layout_final_build_attempt']:.3f} s; legend package install {metrics['runtime_seconds']['legend_install']:.3f} s; LDTR CPU extension attempt {metrics['runtime_seconds']['ldtr_cpu_extension_attempt']:.3f} s; three layout startups {metrics['runtime_seconds']['priority_layout_startups']:.3f} s combined; all offline legend preparation and prompt packaging {metrics['runtime_seconds']['offline_legend_command']:.3f} s. These are setup/startup times, **not model inference performance**. No GPU was used or locked. CPU thread limit was two.

Run from this directory with PowerShell 7 non-login. `commands.ps1` contains commands grouped by discovery, installation, source preparation, component attempts, and reporting. It deliberately requires selecting a phase; it does not launch paid inference. `scripts/run_logged.py` records argv, working directory, UTC time, exit code, timeout, and stdout/stderr. Use `python -X utf8` throughout. The pre-existing Python interpreter is used only to read/render source PDFs and helpers, with bytecode writing disabled; it was not modified. All installs are inside this trial directory.

`evidence/versions.json`, package freeze, pinned cloned repositories, HTTP responses, and `artifact-hashes.json` identify the exact artifacts. Model-weight hashes are null because no checkpoint bytes were obtained; the LDTR HTML warning is never identified as a model. Both original PDF hashes were checked unchanged. The three downloaded nonempty upstream checkouts remain clean.

To unblock full-system evaluation requires the actual DIGMAPPER module images and Luigi workflow, TOPAZ inference implementation and trained checkpoint/configuration, an accessible compatible map-layout checkpoint bundle, and a permitted way to execute its legend/georeferencing stages. This report does not treat available generic backbone weights, LOAM, offline preparation, or published paper scores as substitutes.
'''
(ROOT/'report.md').write_text(report,encoding='utf-8')

images=[('Porto Alegre heat',ROOT/'outputs/porto-heat-source-fragment.png','The prescribed 3000 x 1750 m heat fragment. Original pixels; no predicted risk mask.'),
        ('Richfield 100-year inundation',ROOT/'outputs/richfield-100yr-source-fragment.png','Wood Lake, PDF points 280,285,600,465. Original rendering; no predicted flood geometry.')]
sections=''.join(f'<section><h3>{title}</h3><p>{caption}</p><figure><img src="{p.as_posix()}" alt="{html.escape(caption)}"><figcaption>Model overlay unavailable: pretrained inference did not complete.</figcaption></figure></section>' for title,p,caption in images)
page='''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DIGMAPPER evidence</title><style>
:root{--foreground:#202733;--muted-foreground:#526071;--border:#d3dae3;--card:#f3f5f7;--warning:#956300;--warning-surface:#fff1ce;--radius:10px;--font-sans:system-ui,sans-serif}body{color:var(--foreground);font:15px/1.5 var(--font-sans);margin:0}p{margin:8px 0}h3{font-size:18px;margin:18px 0 6px}.notice{background:var(--warning-surface);color:var(--warning);border-radius:var(--radius);padding:16px}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}.stats div{background:var(--card);padding:16px;border-radius:var(--radius);flex:1;min-width:120px}.stats strong{display:block;font-size:25px}figure{margin:12px 0}img{display:block;width:100%;height:auto;border:1px solid var(--border);box-sizing:border-box}figcaption{color:var(--muted-foreground);margin-top:6px;font-size:13px}section+section{margin-top:20px}
</style></head><body><div class="notice"><strong>Full DIGMAPPER system blocked</strong><p>No pretrained checkpoint loaded. No mask, GeoJSON prediction, or accuracy score produced.</p></div><div class="stats"><div><strong>11 / 11</strong>source layers prepared</div><div><strong>3</strong>layout startups failed</div><div><strong>0</strong>inferences completed</div></div>'''+sections+'''<p>Legend component: 11 manual-crop preparations and 2 offline prompt packages. These are not model predictions. See report.md and metrics.json for release evidence and all layer statuses.</p></body></html>'''
(ROOT/'overlay.html').write_text(page,encoding='utf-8')
print(json.dumps({'report':'report.md','metrics':'metrics.json','layers':len(layers),'full_system_status':metrics['status'],'source_pdfs_unchanged':metrics['source_pdfs_unchanged']}))
