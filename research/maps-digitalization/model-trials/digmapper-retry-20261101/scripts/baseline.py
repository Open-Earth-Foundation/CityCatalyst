import hashlib,json,sys,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; PROJECT=ROOT.parents[1]
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
files=list((PROJECT/'inputs').rglob('*'))
files += [PROJECT/n for n in ['porto.py','richfield.py','benchmark_10m_all.py','outputs/porto-all-10m/benchmark.json','model-trials/PROTOCOL.md']]
for trial in ['digmapper','uiuc','loam']:
    files += [PROJECT/'model-trials'/trial/n for n in ['report.md','metrics.json']]
files += list((PROJECT/'model-trials/digmapper/evidence').rglob('*'))
files += list((PROJECT/'model-trials/digmapper/inputs').rglob('*'))
data={'created_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'python':sys.version,'executable':sys.executable,'files':{p.relative_to(PROJECT).as_posix():{'bytes':p.stat().st_size,'sha256':digest(p)} for p in files if p.is_file()}}
path=ROOT/'evidence/source-baseline.json'
if path.exists():raise RuntimeError('Baseline already exists')
path.write_text(json.dumps(data,indent=2),encoding='utf-8')
print(json.dumps({'files_hashed':len(data['files']),'benchmark_sha256':data['files']['benchmark_10m_all.py']['sha256']}))
