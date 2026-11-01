"""Bounded, anonymous, read-only HTTP checks with byte-exact evidence."""
import concurrent.futures, datetime, hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
CAP = 12 * 1024 * 1024

def check(item):
    start = time.monotonic()
    row = dict(item, checked_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(), method='GET')
    data = b''
    headers = {'User-Agent': 'DIGMAPPER-public-release-reproducibility/2.0'}
    if item.get('range'): headers['Range'] = item['range']
    try:
        try:
            response = urlopen(Request(item['url'], headers=headers), timeout=25)
        except HTTPError as exc:
            response = exc
        with response as response:
            row.update(status=response.status, final_url=response.url,
                       headers={k: v for k,v in response.headers.items() if k.lower() in ('content-type','content-length','etag','last-modified','link','x-ratelimit-remaining','x-ratelimit-reset','www-authenticate','docker-content-digest')})
            data = response.read(CAP+1)
            row['truncated'] = len(data)>CAP
            data = data[:CAP]
    except Exception as exc:
        row.update(status=None, transport_error=repr(exc), truncated=False)
    target = ROOT/'evidence'/f"{item['name']}.body"
    if target.exists(): raise RuntimeError(f'Refusing to overwrite {target}')
    target.write_bytes(data)
    row.update(file=target.relative_to(ROOT).as_posix(), bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), elapsed_s=round(time.monotonic()-start,3))
    return row

def main():
    config=Path(sys.argv[1]); items=json.loads(config.read_text(encoding='utf-8-sig'))
    output=ROOT/'evidence'/f'{config.stem}-results.json'
    if output.exists(): raise RuntimeError(f'Refusing to overwrite {output}')
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for row in pool.map(check,items):
            results.append(row)
            print(json.dumps({k:row.get(k) for k in ['name','status','bytes','truncated','transport_error']},ensure_ascii=False),flush=True)
            output.write_text(json.dumps(results,indent=2,ensure_ascii=False),encoding='utf-8')
    assert len(results)==len(items)

if __name__=='__main__': main()
