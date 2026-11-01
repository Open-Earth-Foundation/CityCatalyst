import hashlib, json, pathlib, time, urllib.request, urllib.error
ROOT = pathlib.Path(__file__).resolve().parents[1]
urls = {
    's3-layout-config': 'https://pantera-file-test.s3.ca-central-1.amazonaws.com/lara/segmentation/layoutlmv3_20240925/config.yaml',
    's3-layout-config-json': 'https://pantera-file-test.s3.ca-central-1.amazonaws.com/lara/segmentation/layoutlmv3_20240925/config.json',
    's3-layout-weights': 'https://pantera-file-test.s3.ca-central-1.amazonaws.com/lara/segmentation/layoutlmv3_20240925/model_final.pth',
    'uncharted-releases': 'https://api.github.com/repos/DARPA-CRITICALMAAS/uncharted-ta1/releases',
    'uncharted-issues': 'https://api.github.com/repos/DARPA-CRITICALMAAS/uncharted-ta1/issues?state=all&per_page=100',
    'dockerhub-tags': 'https://hub.docker.com/v2/repositories/uncharted/lara-segmentation/tags/?page_size=20',
    'hf-digmapper': 'https://huggingface.co/api/models?search=digmapper',
    'hf-layoutlmv3-date': 'https://huggingface.co/api/models?search=layoutlmv3_20240925',
    'author-project': 'https://sofiakirsanova.github.io/projects/criticalmaas/',
    'inferlink-mapsense': 'https://www.inferlink.com/mapsense',
    'author-lab-repos': 'https://api.github.com/orgs/knowledge-computing/repos?per_page=100',
}
results = []
for key, url in urls.items():
    start = time.monotonic()
    row = dict(name=key, url=url)
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'DIGMAPPER-trial/1.0', **({'Range':'bytes=0-1023'} if key == 's3-layout-weights' else {})})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read(8*1024*1024)
            row.update(status=r.status, final_url=r.url)
    except urllib.error.HTTPError as e:
        row.update(status=e.code, error=str(e)); data=e.read()
    except Exception as e:
        row.update(error=repr(e)); data=str(e).encode()
    filename = f'evidence/{key}.txt'
    (ROOT/filename).write_bytes(data)
    row.update(file=filename, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), elapsed_s=round(time.monotonic()-start,3))
    results.append(row); print(json.dumps(row), flush=True)
    (ROOT/'evidence/release-probes.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
