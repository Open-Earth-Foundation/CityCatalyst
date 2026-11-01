"""Bounded, sequential stage runner; only our own subprocesses may be stopped."""
import os,sys,json,time,subprocess,hashlib
from pathlib import Path
import psutil
HERE=Path(__file__).resolve().parent
def write(path,obj):path.write_text(json.dumps(obj,indent=2),encoding='utf-8')
def run_stage(name,stage,timeout,force=False):
    cmd=[sys.executable,'-X','utf8',stage+'.py',name]
    if stage=='infer' and force:cmd.append('--force')
    logfile=HERE/'logs'/f'{stage}-{name}-run.txt'
    t=time.perf_counter();peak=0;reason=None
    with logfile.open('w',encoding='utf-8') as log:
        child=subprocess.Popen(cmd,cwd=HERE,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'PYTHONUNBUFFERED':'1','PYTHONDONTWRITEBYTECODE':'1'})
        proc=psutil.Process(child.pid)
        while child.poll() is None:
            try:peak=max(peak,sum(p.memory_info().rss for p in [proc,*proc.children(recursive=True)] if p.is_running()))
            except psutil.NoSuchProcess:pass
            if time.perf_counter()-t>timeout:reason='stage timeout'
            if peak>2300*2**20:reason='own subprocess RSS exceeded 2300 MiB'
            if reason:
                descendants=proc.children(recursive=True)
                for own in reversed(descendants):
                    try:own.terminate()
                    except psutil.NoSuchProcess:pass
                child.terminate();child.wait(timeout=15);break
            time.sleep(1)
        code=child.returncode
    return {'command':cmd,'exit_code':code,'seconds':time.perf_counter()-t,'peak_rss_mb':peak/2**20,'stop_reason':reason,'log':str(logfile.relative_to(HERE))}
def main():
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--force',action='store_true');parser.add_argument('--layers',nargs='+');args=parser.parse_args()
    allitems=json.loads((HERE/'input-manifest.json').read_text());names=['porto-heat','porto-flood','richfield-inundation-100yr']+[x['name'] for x in allitems if x['name'] not in ('porto-heat','porto-flood','richfield-inundation-100yr')]
    if args.layers:names=[n for n in names if n in args.layers]
    status={'started_utc':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'settings_sha256':hashlib.sha256((HERE/'frozen-settings.json').read_bytes()).hexdigest(),'layers':{}}
    write(HERE/'run-status.json',status)
    for name in names:
        complete=HERE/'predictions'/name/'complete.json'
        if args.force and complete.exists():complete.unlink()
        st={'status':'running','stages':[]};status['layers'][name]=st;write(HERE/'run-status.json',status)
        print('LAYER_START',name,flush=True)
        for stage,limit in [('preprocess',180),('infer',1200)]:
            result=run_stage(name,stage,limit,args.force);st['stages'].append(result);write(HERE/'run-status.json',status)
            print('STAGE_END',name,stage,json.dumps(result),flush=True)
            if result['exit_code']!=0:st['status']='failed';st['reason']=result['stop_reason'] or f'{stage} exit {result["exit_code"]}';break
        else:st['status']='succeeded'
        write(HERE/'run-status.json',status)
    print('ALL_TRIALS_FINISHED',flush=True)
if __name__=='__main__':main()
