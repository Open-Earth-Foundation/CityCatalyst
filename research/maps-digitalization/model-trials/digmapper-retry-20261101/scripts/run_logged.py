import datetime,json,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
name=sys.argv[1];argv=sys.argv[2:];start=time.monotonic()
path=ROOT/'logs'/f'{name}.log'
if path.exists():raise RuntimeError(f'Refusing to overwrite {path}')
record={'argv':argv,'cwd':str(ROOT),'started_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
try:
    with path.open('w',encoding='utf-8') as log:
        result=subprocess.run(argv,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,timeout=240,text=True,encoding='utf-8',errors='replace')
    record['exit_code']=result.returncode
except Exception as exc:
    record.update(error=repr(exc),exit_code=None)
record['elapsed_s']=round(time.monotonic()-start,3)
path.with_suffix('.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print(json.dumps(record))
print(path.read_text(encoding='utf-8')[-15000:])
sys.exit(record.get('exit_code') or (1 if 'error' in record else 0))
