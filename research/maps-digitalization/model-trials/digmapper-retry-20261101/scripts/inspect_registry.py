"""Inspect public Docker manifests/configuration without pulling or running images."""
import datetime,hashlib,json,time
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
ROOT=Path(__file__).resolve().parents[1]
repo='jterstriep/topaz';tag='0.2.5';rows=[]
def get(name,url,headers=None,persist=True):
    start=time.monotonic();row=dict(name=name,url=url,checked_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
    try: response=urlopen(Request(url,headers=headers or {}),timeout=25)
    except HTTPError as exc: response=exc
    with response as response:
        data=response.read(2*1024*1024);row.update(status=response.status,bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
    if persist:
        p=ROOT/'evidence'/f'{name}.body'
        assert not p.exists();p.write_bytes(data);row['file']=p.relative_to(ROOT).as_posix()
    else:row['body_not_retained']='Anonymous registry authentication response; token kept in memory only'
    row['elapsed_s']=round(time.monotonic()-start,3);rows.append(row)
    print(json.dumps({k:row[k] for k in ['name','status','bytes']}))
    (ROOT/'evidence/registry-results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
    return json.loads(data)
url='https://auth.docker.io/token?'+urlencode({'service':'registry.docker.io','scope':f'repository:{repo}:pull'})
auth=get('registry-auth',url,persist=False)
headers={'Authorization':'Bearer '+auth['token'],'Accept':'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json'}
manifest=get('topaz-container-manifest',f'https://registry-1.docker.io/v2/{repo}/manifests/{tag}',headers)
if 'config' in manifest:
    config=get('topaz-container-config',f"https://registry-1.docker.io/v2/{repo}/blobs/{manifest['config']['digest']}",headers)
    print(json.dumps({'config':config.get('config'),'history':[x.get('created_by') for x in config.get('history',[])]},indent=2))
