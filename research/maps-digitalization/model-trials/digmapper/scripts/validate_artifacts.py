import hashlib, json, pathlib
from legend_icl.artifacts import verify
ROOT=pathlib.Path(__file__).resolve().parents[1]
def read(p): return json.loads((ROOT/p).read_text(encoding='utf-8'))
m=read('metrics.json'); sources=read('inputs/manifest.json')
assert len(m['layers'])==11 and len({x['id'] for x in m['layers']})==11
assert m['status']=='blocked' and m['full_system_tested'] is False
assert m['successful_pretrained_inferences']==0 and not m['LOAM_run']
assert sum(x['status']=='failed' for x in m['layers'])==3
assert sum(x['status']=='not_attempted' for x in m['layers'])==8
for x in m['layers']:
    assert all(v is None for v in x['metrics'].values())
    assert all(v is None for v in x['raw_denominators'].values())
    assert x['evaluated_cells_or_pixels']==0 and x['predicted_mask'] is None
    verify(ROOT/'outputs/legend-prepared'/x['id'])
for x in sources['source_pdfs']:
    assert hashlib.sha256(pathlib.Path(x['path']).read_bytes()).hexdigest()==x['sha256']
for x in read('outputs/offline-legend-results.json')['dry_runs']:
    p=ROOT/'outputs/legend-dry-run'/x['layer']
    verify(p)
    assert json.loads((p/'run.json').read_text())['status']=='dry_run'
    assert not (p/'predictions.json').exists() and not (p/'response.json').exists()
assert not list((ROOT/'outputs').rglob('*.geojson'))
assert read('outputs/prediction-manifest.json')['masks']==[]
assert 'No pretrained checkpoint loaded' in (ROOT/'overlay.html').read_text(encoding='utf-8')
assert not (ROOT/'evidence/ldtr-thrust-weights.html').read_bytes().startswith(b'PK')
result={'status':'passed','required_layers':11,'failed_startups':3,'remaining_not_attempted':8,
        'source_pdf_hashes_unchanged':True,'offline_bundles_verified':14,
        'accuracy_values_all_null':True,'no_fabricated_predictions':True}
verify(ROOT/'outputs/legend-example-five')
(ROOT/'evidence/validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
artifacts={}
for folder in ['evidence','scripts','inputs','outputs','logs']:
    for p in sorted((ROOT/folder).rglob('*')):
        if p.is_file() and '__pycache__' not in p.parts:
            artifacts[p.relative_to(ROOT).as_posix()]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
for name in ['report.md','metrics.json','commands.ps1','overlay.html']:
    p=ROOT/name; artifacts[name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(ROOT/'artifact-hashes.json').write_text(json.dumps(artifacts,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
