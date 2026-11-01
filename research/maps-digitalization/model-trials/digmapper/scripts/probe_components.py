import hashlib, json, pathlib, time, urllib.request, urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1]
urls={
 'ldtr-thrust-config':'https://drive.google.com/uc?export=download&id=1p7nlIqAiCZonahATYPCDQIFyZM-lyKlL',
 'ldtr-thrust-weights':'https://drive.google.com/uc?export=download&id=1Bjes7tXUZRDCCQrlXqPs2tgWDO5q9hpL',
 's3-global-weights':'https://pantera-file-test.s3.amazonaws.com/lara/segmentation/layoutlmv3_20240925/model_final.pth',
 'layout-issue5-comments':'https://api.github.com/repos/DARPA-CRITICALMAAS/uncharted-ta1/issues/5/comments',
 'layout-issue7-comments':'https://api.github.com/repos/DARPA-CRITICALMAAS/uncharted-ta1/issues/7/comments',
 'aim-metadata':'https://api.github.com/repos/knowledge-computing/CriticalMAAS_AIM',
 'topaz-github-search':'https://api.github.com/search/repositories?q=TOPAZ+geologic',
 'maplocator-readme':'https://raw.githubusercontent.com/knowledge-computing/MapLocator/main/README.md',
 'point-generator-readme':'https://raw.githubusercontent.com/knowledge-computing/criticalmaas-TA1-synthmap-points/main/README.md',
}
results=[]
for name,url in urls.items():
    start=time.monotonic(); row=dict(name=name,url=url)
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'DIGMAPPER-trial/1.0'}),timeout=35) as r:
            row.update(status=r.status,final_url=r.url,content_type=r.headers.get('Content-Type'))
            # A checkpoint is the only potentially large object; cap it at 700 MiB.
            limit=700*1024*1024 if name=='ldtr-thrust-weights' else 8*1024*1024
            chunks=[]; total=0
            while chunk:=r.read(1024*1024):
                total+=len(chunk)
                if total>limit: raise ValueError('download exceeds bounded size')
                chunks.append(chunk)
            data=b''.join(chunks)
    except urllib.error.HTTPError as e:
        row.update(status=e.code,error=str(e)); data=e.read()
    except Exception as e: row.update(error=repr(e)); data=str(e).encode()
    suffix='.html' if row.get('content_type','').startswith('text/html') else '.bin' if name=='ldtr-thrust-weights' and not row.get('error') else '.txt'
    p=ROOT/'evidence'/(name+suffix)
    p.write_bytes(data)
    row.update(file=str(p.relative_to(ROOT)),bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),elapsed_s=round(time.monotonic()-start,3))
    results.append(row); print(json.dumps(row),flush=True)
    (ROOT/'evidence/component-probes.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
