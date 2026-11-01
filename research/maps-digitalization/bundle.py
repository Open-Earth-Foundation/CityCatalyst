"""Package results without credentials, caches, local API helper or virtual environments."""
import json,zipfile,hashlib
from pathlib import Path
ROOT=Path(__file__).parent
manifest=json.loads((ROOT/'outputs/run-manifest.json').read_text(encoding='utf-8'))
if manifest['status']!='complete' or manifest['route']!='all':raise SystemExit('Full pipeline not complete')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for f,h in manifest['pipeline_hashes'].items():
    if digest(ROOT/f)!=h:raise SystemExit('Stale pipeline manifest')
for f,h in manifest['output_hashes'].items():
    if digest(ROOT/'outputs'/f.replace('\\','/'))!=h:raise SystemExit('Output changed after completed run: '+f)
base=[p for p in ROOT.glob('*') if p.suffix in ['.py','.md','.json','.txt'] and p.name not in ['bundle.py','DELIVERY.json']]+[ROOT/'comparison.html']
base+=list((ROOT/'outputs').rglob('*'))
base+=list((ROOT/'reviews').glob('*.md'))+list((ROOT/'reviews').glob('*.json'))
base+=list((ROOT/'experiments').glob('*.json'))+list((ROOT/'experiments').glob('*.py'))
base=[p for p in base if p.is_file()]
results=[]
for name,files in [('recovered-maps-and-code.zip',base),('full-reproduction.zip',base+[p for p in (ROOT/'inputs').iterdir() if p.is_file()])]:
    target=ROOT/name
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in sorted(set(files)):z.write(p,p.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(target) as z:
        if z.testzip() is not None:raise SystemExit('Archive integrity failure')
    results.append({'file':name,'bytes':target.stat().st_size,'sha256':digest(target)})
(ROOT/'DELIVERY.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
