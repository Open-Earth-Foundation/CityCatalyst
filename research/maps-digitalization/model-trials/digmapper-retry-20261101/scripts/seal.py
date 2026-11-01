import datetime,hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
metrics=json.loads((ROOT/'metrics.json').read_text(encoding='utf-8'))
assert len(metrics['layers'])==11
assert len({x['id'] for x in metrics['layers']})==11
for layer in metrics['layers']:
    assert layer['input_ready'] and not layer['inference_started'] and not layer['predictions_produced']
    assert all(value is None for value in layer['metrics'].values())
assert metrics['coverage']['paid_api_calls']==0
assert not (ROOT/'predictions').exists()
assert not (ROOT/'overlay.html').exists()
repo=ROOT/'upstream/windows-launcher'
revision=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
assert revision=='d346eb549f2d91139cc78594eee30a05ae7afb23'
assert subprocess.check_output(['git','-C',str(repo),'status','--porcelain=v1'],text=True).strip()==''
index=json.loads((ROOT/'evidence/http-index.json').read_text(encoding='utf-8'))
for row in index['results']+index['container_registry_results']+index['container_layer_results']:
    if row.get('file'):assert digest(ROOT/row['file'])==row['sha256']
validation=dict(checked_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),status='passed',
    unique_layer_rows=11,all_real_data_metrics_null=True,no_fabricated_predictions_or_overlays=True,
    http_bodies_match_hashes=True,downloaded_release_matches_published_digest=True,
    container_layer_matches_registry_digest=True,launcher_revision=revision,launcher_checkout_clean=True,
    existing_source_preservation='evidence/source-preservation.json',scorer_validation='evidence/scorer-contract-validation.json')
(ROOT/'evidence/validation.json').write_text(json.dumps(validation,indent=2),encoding='utf-8')
files=[dict(path=p.relative_to(ROOT).as_posix(),bytes=p.stat().st_size,sha256=digest(p))
    for p in sorted(ROOT.rglob('*')) if p.is_file() and '.git' not in p.relative_to(ROOT).parts and p.name!='artifact-hashes.json']
target=ROOT/'artifact-hashes.json';assert not target.exists()
target.write_text(json.dumps(dict(created_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    excluded=['artifact-hashes.json (self)','upstream Git internal database'],files=files),indent=2),encoding='utf-8')
print(json.dumps(dict(validation='passed',artifacts_hashed=len(files),bytes=sum(x['bytes'] for x in files))))
