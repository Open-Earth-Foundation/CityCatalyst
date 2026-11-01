"""Serial subprocess scheduler; failures retained and no external processes touched."""
import sys,os,time,json,subprocess,datetime
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
import psutil
def main():
    manifest=json.loads((HERE/'input-manifest.json').read_text())
    status={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'layers':{}}
    if (HERE/'run-status.json').exists():status=json.loads((HERE/'run-status.json').read_text())
    def save():(HERE/'run-status.json').write_text(json.dumps(status,indent=2),encoding='utf-8')
    for meta in manifest:
        name=meta['name'];st=status['layers'].setdefault(name,{'stages':[]})
        if (HERE/'predictions'/name/'complete.json').exists():st['status']='succeeded';save();continue
        st['status']='running';save()
        for stage,script,complete in [('preprocess','preprocess.py',HERE/'intermediate'/name/'success.json'),('inference','infer.py',HERE/'predictions'/name/'complete.json')]:
            if complete.exists():continue
            cmd=[sys.executable,'-B','-u','-X','utf8',str(HERE/script),name]
            attempt=1
            while (HERE/'logs'/f'{name}-{stage}-{attempt}.log').exists():attempt+=1
            log=HERE/'logs'/f'{name}-{stage}-{attempt}.log'
            env=os.environ.copy();env.update(TEMP=str(HERE/'tmp'),TMP=str(HERE/'tmp'),PYTHONDONTWRITEBYTECODE='1',OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1')
            start=time.perf_counter();peak=0;min_free=psutil.virtual_memory().available
            print('START',name,stage,flush=True)
            with log.open('w',encoding='utf-8') as stream:
                p=subprocess.Popen(cmd,cwd=HERE,env=env,stdout=stream,stderr=subprocess.STDOUT)
                while p.poll() is None:
                    try:
                        parent=psutil.Process(p.pid);tree=[parent]+parent.children(recursive=True)
                        peak=max(peak,sum(q.memory_info().rss for q in tree if q.is_running()))
                        min_free=min(min_free,psutil.virtual_memory().available)
                    except psutil.Error:pass
                    time.sleep(1)
            event={'stage':stage,'attempt':attempt,'command':cmd,'log':str(log),'seconds':time.perf_counter()-start,'exit_code':p.returncode,'peak_process_tree_mib':peak/2**20,'minimum_free_host_mib':min_free/2**20}
            st['stages'].append(event)
            print('END',name,json.dumps(event),flush=True)
            if p.returncode!=0 or not complete.exists():st['status']='failed';save();break
        else:st['status']='succeeded'
        save()
    status['ended_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
    print('RUN_COMPLETE',json.dumps({k:v['status'] for k,v in status['layers'].items()}),flush=True)
    if any(v['status']!='succeeded' for v in status['layers'].values()):raise SystemExit(1)
if __name__=='__main__':main()
