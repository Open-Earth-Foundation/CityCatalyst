"""Build auditable null metrics. Does not invent or execute model predictions."""
import collections,datetime,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];PROJECT=ROOT.parents[1]
def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))
def write(path,data):
    dest=ROOT/path
    assert not dest.exists(),str(dest)
    dest.write_text(json.dumps(data,indent=2,ensure_ascii=False,allow_nan=False),encoding='utf-8')
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
    return h.hexdigest()

probes=[]
for path in sorted((ROOT/'evidence').glob('*probes-results.json')):
    probes.extend(json.loads(path.read_text(encoding='utf-8')))
write('evidence/http-index.json',dict(ordinary_http_requests=len(probes),statuses=dict(collections.Counter(x['status'] for x in probes)),
    results=probes,container_registry_results=read('evidence/registry-results.json'),
    container_layer_results=read('evidence/container-layer-results.json'),
    note='Registry authentication responses were not retained; their status and hashes are recorded. All ordinary response bodies are complete, not truncated.'))
for row in probes:
    assert digest(ROOT/row['file'])==row['sha256']
    assert not row['truncated'] and row['status'] is not None
baseline=read('evidence/source-baseline.json')
changed=[]
for rel,old in baseline['files'].items():
    path=PROJECT/rel
    if not path.exists() or digest(path)!=old['sha256']:changed.append(rel)
assert not changed,changed
write('evidence/source-preservation.json',dict(checked_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    files_checked=len(baseline['files']),all_unchanged=True,changed=changed,
    scope='All shared inputs; porto.py/richfield.py; 10 m script and existing benchmark; protocol; prior three reports/metrics; prior DIGMAPPER evidence and prepared input images.',
    previous_trial_checkouts_modified=False,gpu_used=False,gpu_lock_acquired=False,gpu_lock_path_exists_at_check=(PROJECT/'model-trials/gpu.lock').exists()))

porto_keys=['eligible','common','correct','incorrect','missing','exact_all_pct','exact_common_pct','incorrect_common_pct','missing_pct',
    'mae','bias','high_reference','high_true_positive','high_predicted_common','high_recall_pct','high_precision_common_pct',
    'predicted','predicted_without_reference','predicted_without_reference_pct','confusion','zero_reference_output_coverage_pct','low_reference_output_coverage_pct']
richfield_keys=['iou','precision','recall','edge_median_m','edge_p95_m','edge_p99_9_m','edge_max_m','prediction_area_m2','reference_area_m2',
    'intersection_area_m2','union_area_m2','missing','incorrect','predicted_without_reference']
source=read('evidence/input-readiness.json')
layers=[]
for row in source['layers']:
    layers.append(dict(id=row['id'],dataset=row['dataset'],page_1based=row['page_1based'],input_ready=True,
        execution_status='not_attempted',full_system_status='blocked',polygon_component_status='blocked_before_model_start',
        reason='Exact DIGMAPPER TOPAZ inference implementation/checkpoint not located or obtained in fresh public-source checks.',
        inference_started=False,pretrained_forward_pass_completed=False,model_checkpoint_loaded=False,
        predictions_produced=False,full_mask=None,georeferenced_prediction=None,aligned_overlay=None,
        evaluation_status='not_evaluated_no_model_output',evaluated_cells_or_pixels=0,
        metrics={key:None for key in (porto_keys if row['dataset']=='porto' else richfield_keys)},
        raw_denominators=None,source_image=row['source_image'],source_image_sha256=row['source_image_sha256']))
availability=[
 dict(component='DIGMAPPER full system / author AIM',status='blocked_release_not_obtained',
      evidence=['aim-metadata.body','aim-contents.body','aim-branches.body','aim-releases.body','aim-deployments.body','../logs/aim-ls-remote.log'],
      result='Repository size 0; contents 404; branches/releases/deployments empty; git ls-remote succeeded with no refs.'),
 dict(component='TOPAZ polygon model',status='not_located_in_examined_public_sources',repository=None,checkpoint_url=None,checkpoint_sha256=None,
      result='No verified TOPAZ polygon implementation/checkpoint or runnable DIGMAPPER deployment obtained. Public negative evidence is bounded; private or differently named releases remain possible.'),
 dict(component='Third-party Windows launcher',status='executed_identity_checks_only',repository='https://github.com/cxp114/criticalmaas-uncharted-ta1',
      revision='d346eb549f2d91139cc78594eee30a05ae7afb23',release='v0.1.0',
      release_sha256='94c02406b4c908d073336f7e86997e1115bd0c88d74bd6c3cf31543b19762382',
      result='307 archive entries, no .pth/.pt/.ckpt/.safetensors/.onnx files. Source CLI lists five non-polygon pipelines; TOPAZ target rejected with exit 2. No inference.'),
 dict(component='Author poly_itemseg_update system',status='excluded_wrong_polygon_method',
      repository='https://github.com/Fandel-Lin/poly_itemseg_update',revision='67bb6ab710fa88b630dc403e46abf85bcbbf99e8',
      result='938-entry complete tree, polygon README/model/handler name LOAM; available point weights do not supply TOPAZ. Not run or relabelled.'),
 dict(component='jterstriep/topaz:0.2.5 Linux image',status='excluded_name_collision',
      manifest_digest='sha256:73a765c2314324082686ec877bdd1facb2628af89a8825c65810a18a2cf2c5ac',
      inspected_application_layer_sha256='3e6a918752ba84608894d0b36aba553d857833c6298b4106514f6123c6148b98',
      result='Downloaded and digest-verified 65,602,698-byte application layer; README/setup.py identify tbepler/topaz, package topaz-em 0.2.5 for cryo-EM. Full 7.35 GB image not pulled or run.'),
 dict(component='Paper-linked LARA LayoutLMv3',status='unavailable_public_weights_and_image',revision='7a50dc0cecde38b6c5db9c8f7d01b3e628bcf8b9',
      result='Fresh 404 NoSuchBucket for config.yaml/config.json/model_final.pth and global weight endpoint; docker manifest denied/unauthorized. No new Detectron2 build or layout startup.'),
 dict(component='Author legend package',status='not_reexecuted_no_polygon_model',revision='a12e9603c3ea0ee8d4eb8fc53a326e37be53c930',
      result='Release tree revision verified. Prior preparation-only result not counted as current inference. No GPT-4o calls.'),
 dict(component='LDTR / point extraction / other polygon methods',status='not_run_outside_requested_polygon_model',
      result='No substitution for TOPAZ; no redundant LDTR extension build.'),
]
write('evidence/availability-summary.json',availability)
run_intent=dict(method='DIGMAPPER',required_polygon_component='TOPAZ',
    priority_order=['porto-heat','porto-flood','richfield-inundation-100yr'],all_layers=[x['id'] for x in layers],
    full_workflow_preferred=True,source_only_manual_aids_allowed=True,reference_values_allowed_for_evaluation_only=True,
    native_pixels_approximately_m=30,evaluation_grid_m=10,no_250m_averaging=True,
    gpu_policy='Reserved principally for LOAM. Atomic exclusive model-trials/gpu.lock required before GPU inference; release only own lock.',
    gpu_acquired=False,model_checkpoint=None,inference_command=None,decoder=None,
    model_thresholds=None,paid_api_calls=0,external_source_uploads=0,host_changes=0,
    reason_no_inference_configuration='No exact runnable TOPAZ model obtained; inventing a runner or decoder would misidentify the method.')
write('configs/run-intent.json',run_intent)
metrics=dict(schema_version=2,method='DIGMAPPER',required_polygon_component='TOPAZ',trial_date='2026-11-01',
    generated_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),status='blocked_before_polygon_inference',
    conclusion='Fresh public release and artifact checks completed, but no exact runnable TOPAZ polygon model obtained. All real-data accuracy metrics are null.',
    full_system_runnable=False,full_system_tested=False,polygon_model_obtained=False,
    independent_DIGMAPPER_success=False,LOAM_run=False,
    coverage=dict(required_layers=11,source_inputs_verified=11,polygon_inference_startups=0,pretrained_forward_passes=0,predicted_layers=0,evaluated_layers=0,paid_api_calls=0),
    full_system_scores=None,polygon_scores=None,components=availability,layers=layers,
    evaluation_contract=read('configs/evaluation-contract.json'),
    inference_runtime_seconds=None,peak_inference_gpu_memory_mib=None,peak_inference_host_memory_mib=None,
    runtime_seconds={p.stem:json.loads(p.read_text(encoding='utf-8'))['elapsed_s'] for p in sorted((ROOT/'logs').glob('*.json'))},
    gpu=dict(used=False,lock_acquired=False,own_lock_released='not_applicable_never_acquired',initial_free_mib=10467,total_mib=12282),
    environment=dict(shell='PowerShell 7.6.9 non-login',discovery_python=sys.version,source_validation_python=source['python'],
        initial_host_free_gib=read('evidence/initial-memory.json')['FreePhysicalMemory']/1024**2,
        docker_linux_daemon_available=True,wsl2_available=True,new_dependency_installations=0),
    evidence=dict(http_index='evidence/http-index.json',availability='evidence/availability-summary.json',
        input_readiness='evidence/input-readiness.json',source_preservation='evidence/source-preservation.json',
        synthetic_scorer_test='evidence/scorer-contract-validation.json',commands='commands.ps1',artifact_hashes='artifact-hashes.json'),
    limitations=[
        'No polygon/full-system inference occurred. Package inspection and CLI dispatch checks are not model tests.',
        'Search covers examined public sources, not every private or differently named release.',
        'ACM final-version HTML/PDF returned HTTP 403; arXiv current API identifies v1. Crossref confirms the published DOI but no accessible final text was verified.',
        'Anonymous GitHub Packages enumeration returned HTTP 401; no authenticated/private registry coverage.',
        'Porto reference PNGs are same-author derivatives, not independently authenticated TIFFs. Retrospective, not blind; repeated 10 m sampling adds no native source information.',
        'Supplied 10 m script covers Porto. Richfield source-fidelity metrics would use direct PDF fill geometry; no new Richfield numerical evaluation was performed.',
        'Source validation interpreter lacks rasterio: first full scorer import failed. The subsequent synthetic check executes only the unchanged scores function by AST; GeoTIFF export/full benchmark were not exercised.',
    ],prerequisites=[
        'Exact TOPAZ inference code and trained checkpoint/configuration, or an accessible identified DIGMAPPER/TOPAZ Linux image with model bytes and input/output contract.',
        'For a full-system run: module images and Luigi workflow, accessible map-layout checkpoint, permitted legend/georeferencing credentials. For a TOPAZ-only run: source-derived manual aids may replace those stages and must be disclosed.',
        'Freeze decoder, resizing, mask arbitration and support policy from actual TOPAZ interface before any real reference scoring.',
        'If image/weights are private, supply access to the identified release; no credential or paid API request was made without a relevant polygon model.',
    ])
write('metrics.json',metrics)
print(json.dumps({'status':metrics['status'],'required_layers':11,'source_inputs_verified':11,'http_probes':len(probes),'prior_files_unchanged':len(baseline['files'])}))
