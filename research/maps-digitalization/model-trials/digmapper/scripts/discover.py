from pathlib import Path
import urllib.request, json, hashlib, time
root=Path(__file__).resolve().parents[1]
urls={
'paper.html':'https://arxiv.org/html/2506.16006v1',
'paper.pdf':'https://arxiv.org/pdf/2506.16006v1',
'layout-readme.md':'https://raw.githubusercontent.com/DARPA-CRITICALMAAS/uncharted-ta1/main/pipelines/segmentation/README.md',
'github-digmapper-search.json':'https://api.github.com/search/repositories?q=DIGMAPPER',
'github-inferlink-repos.json':'https://api.github.com/orgs/InferLink/repos?per_page=100',
'github-criticalmaas-repos.json':'https://api.github.com/orgs/DARPA-CRITICALMAAS/repos?per_page=100',
}
results=[]
for name,url in urls.items():
 start=time.monotonic()
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'DIGMAPPER-reproducibility-evaluation/1.0'})
  with urllib.request.urlopen(req,timeout=50) as res:
   data=res.read(); status=res.status; final=res.url
  (root/'evidence'/name).write_bytes(data)
  row=dict(url=url,status=status,final_url=final,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),file=name)
 except Exception as exc: row=dict(url=url,error=repr(exc))
 row['elapsed_s']=round(time.monotonic()-start,3); results.append(row);print(json.dumps(row),flush=True)
(root/'evidence/downloads.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
