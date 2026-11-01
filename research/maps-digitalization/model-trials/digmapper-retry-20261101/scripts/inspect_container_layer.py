"""Read only the small application layer to establish the TOPAZ image identity."""
import hashlib,io,json,tarfile,time,datetime
from pathlib import Path
from urllib.request import Request,urlopen
ROOT=Path(__file__).resolve().parents[1]
repo='jterstriep/topaz'
digest='sha256:3e6a918752ba84608894d0b36aba553d857833c6298b4106514f6123c6148b98'
with urlopen('https://auth.docker.io/token?service=registry.docker.io&scope=repository:jterstriep/topaz:pull',timeout=25) as r:
    token=json.loads(r.read())['token']
url=f'https://registry-1.docker.io/v2/{repo}/blobs/{digest}'
start=time.monotonic();target=ROOT/'evidence/topaz-container-application.tar.gz'
assert not target.exists()
h=hashlib.sha256();size=0
with urlopen(Request(url,headers={'Authorization':'Bearer '+token}),timeout=45) as r,target.open('wb') as f:
    status=r.status
    while chunk:=r.read(1024*1024):
        size+=len(chunk)
        if size>70*1024*1024:raise RuntimeError('Unexpected application layer size')
        f.write(chunk);h.update(chunk)
assert 'sha256:'+h.hexdigest()==digest
record=dict(url=url,status=status,bytes=size,sha256=h.hexdigest(),file=target.relative_to(ROOT).as_posix(),checked_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),elapsed_s=round(time.monotonic()-start,3))
(ROOT/'evidence/container-layer-results.json').write_text(json.dumps([record],indent=2),encoding='utf-8')
with tarfile.open(target,'r:gz') as tf:
    files=[{'name':m.name,'bytes':m.size} for m in tf.getmembers()]
    (ROOT/'evidence/container-layer-inventory.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
    for name in ['opt/topaz/README.md','opt/topaz/setup.py','opt/topaz/.git/config']:
        try:
            member=tf.getmember(name)
        except KeyError:continue
        assert member.isfile() and member.size<1024*1024
        content=tf.extractfile(member).read()
        path=ROOT/'evidence'/('container-'+name.split('/')[-1]+'.txt');path.write_bytes(content)
        print(name,content.decode('utf-8',errors='replace')[:4000])
print(json.dumps(record))
