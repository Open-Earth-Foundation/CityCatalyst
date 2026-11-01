"""Mode-0 exact upstream bitmap interface and canonical CUDA FP32 model inference."""
import sys,os
sys.dont_write_bytecode=True
from pathlib import Path
HERE=Path(__file__).resolve().parent;OLD=HERE.parent/'loam'
os.environ['OMP_NUM_THREADS']='1';os.environ['MKL_NUM_THREADS']='1'
os.environ['MPLCONFIGDIR']=str(HERE/'cache'/'matplotlib')
sys.path.insert(0,str(OLD/'upstream'))
import json,csv,time,gc,hashlib,uuid
import numpy as np
from PIL import Image
import torch,psutil
from LOAM.loam_model import LOAM
from LOAM.utils.data_loading import BasicDataset
from postprocessing_workers.postprocessing_for_bitmap_worker import postprocessing_for_bitmap_worker_multiple_image as bitmap_worker
def write(p,v):p.write_text(json.dumps(v,indent=2,allow_nan=False),encoding='utf-8')
def digest(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def main():
    import argparse
    ap=argparse.ArgumentParser();ap.add_argument('name');ap.add_argument('--probe',action='store_true');args=ap.parse_args()
    lock=HERE.parent/'gpu.lock';token='loam-quality-'+str(uuid.uuid4())
    owner={'owner':token,'pid':os.getpid(),'directory':str(HERE),'layer':args.name,'created':time.time()}
    # Atomic exclusive lock. Never delete an existing lock owned by another worker.
    with lock.open('x',encoding='utf-8') as f:json.dump(owner,f)
    try:run(args,owner)
    finally:
        if lock.exists() and json.loads(lock.read_text())['owner']==token:lock.unlink()
def run(args,owner):
    torch.set_num_threads(1);torch.set_num_interop_threads(1);torch.manual_seed(0);np.random.seed(0)
    torch.backends.cuda.matmul.allow_tf32=False;torch.backends.cudnn.allow_tf32=False
    torch.backends.cudnn.benchmark=False
    assert torch.cuda.is_available(),'CUDA unavailable; no speedmode fallback'
    started=time.perf_counter()
    meta=next(m for m in json.loads((HERE/'input-manifest.json').read_text()) if m['name']==args.name)
    out=HERE/'predictions'/args.name;out.mkdir(parents=True,exist_ok=True)
    if not args.probe and (out/'complete.json').exists():return
    d=HERE/'intermediate'/args.name;assert (d/'success.json').exists()
    rows=list(csv.reader((d/'intermediate9'/'auxiliary_info.csv').open()))[1:]
    aux={r[1]:np.asarray(r[2:],np.float32) for r in rows}
    assert len(rows)==len(aux)==len(meta['legends']), 'Duplicate or missing auxiliary rows'
    state=torch.load(OLD/'checkpoint_epoch14.pth',map_location='cpu',weights_only=True,mmap=True)
    assert state.pop('mask_values')==[0,1]
    net=LOAM(n_channels=7,n_classes=2,bilinear=False)
    strict=str(net.load_state_dict(state,strict=True));print('STRICT_LOAD',strict,flush=True)
    del state;gc.collect();net=net.eval().to('cuda',dtype=torch.float32)
    print('CUDA_FP32',torch.__version__,torch.cuda.get_device_name(0),torch.cuda.mem_get_info(),flush=True)
    tile_root=HERE/'bitmaps'/args.name
    folders=[tile_root/'full',tile_root/'mask',tile_root/'tiles',tile_root/'small-mask']
    for f in folders:f.mkdir(parents=True,exist_ok=True);(f/'sup').mkdir(exist_ok=True)
    w,h=meta['size'];stats=[];peak_rss=0
    for leg in meta['legends']:
        k=leg['index'];key=f'{args.name}_bin{k:02}_poly';done=out/f'bin{k:02}-complete.json'
        if done.exists() and not args.probe:stats.append(json.loads(done.read_text()));continue
        kt=time.perf_counter();z=aux[key];assert z.shape==(41,) and np.isfinite(z).all()
        zc=torch.from_numpy(z[:32]).unsqueeze(0).to('cuda');zm=torch.from_numpy(z[32:]).unsqueeze(0).to('cuda')
        # Call official mode-0 worker, including OpenCV BGR-to-gray conversion,
        # binary channels, bottom/right padding, and saved 1024-square tiles.
        ret=bitmap_worker(0,k,args.name,f'bin{k:02}_poly',str(d/'intermediate7_2'),str(HERE/'no-groundtruth'),str(d/'intermediate7'),str(d/'intermediate5'),str(d/'intermediate8_2'),*[str(f) for f in folders],1024,False,0)
        assert ret[2]==((h+1023)//1024)*((w+1023)//1024)
        mask=np.zeros((h,w),bool);prob=np.zeros((h,w),np.float32);tiles=0;channel_hashes={}
        for y in range(0,h,1024):
            for x in range(0,w,1024):
                stem=f'{key}_{y//1024}_{x//1024}'
                paths=[folders[2]/(stem+'.png')]+[folders[2]/'sup'/f'{stem}_sup_{j}.png' for j in range(6)]
                arr=np.stack([BasicDataset.preprocess(None,Image.open(p),1.0,False)[0] for p in paths]).astype(np.float32)
                assert arr.shape==(7,1024,1024) and np.isfinite(arr).all()
                channel_hashes[stem]=[digest(p) for p in paths]
                tt=time.perf_counter()
                with torch.inference_mode():
                    logits=net(torch.from_numpy(arr).unsqueeze(0).to('cuda'),zc,zm).cpu()
                    logits=torch.nn.functional.interpolate(logits,(1024,1024),mode='bilinear')
                    assert tuple(logits.shape)==(1,2,1024,1024)
                    ah,aw=min(1024,h-y),min(1024,w-x)
                    p=logits.softmax(1)[0,1,:ah,:aw].numpy();b=logits.argmax(1)[0,:ah,:aw].numpy().astype(bool)
                    prob[y:y+ah,x:x+aw]=p;mask[y:y+ah,x:x+aw]=b
                tiles+=1;peak_rss=max(peak_rss,psutil.Process().memory_info().rss)
                ev={'layer':args.name,'class':k,'origin':[x,y],'tile_shape':[1024,1024],'valid_shape':[ah,aw],'seconds':time.perf_counter()-tt,'peak_cuda_allocated_mib':torch.cuda.max_memory_allocated()/2**20,'peak_cuda_reserved_mib':torch.cuda.max_memory_reserved()/2**20,'rss_mib':peak_rss/2**20}
                print('TILE',json.dumps(ev),flush=True)
                del arr,logits
                if args.probe:
                    write(HERE/'evidence'/'canonical-cuda-probe.json',{**ev,'strict_load':strict,'torch':torch.__version__,'full_precision':True,'tf32':False})
                    return
        Image.fromarray(mask.astype(np.uint8)*255).save(out/f'bin{k:02}-mask.png');np.save(out/f'bin{k:02}-probability.npy',prob)
        st={'index':k,'seconds':time.perf_counter()-kt,'tiles':tiles,'positive_pixels':int(mask.sum()),'peak_cuda_allocated_mib':torch.cuda.max_memory_allocated()/2**20,'peak_cuda_reserved_mib':torch.cuda.max_memory_reserved()/2**20,'peak_rss_mib':peak_rss/2**20}
        write(done,st);write(out/f'bin{k:02}-bitmap-hashes.json',channel_hashes);stats.append(st)
        print('CLASS_COMPLETE',json.dumps(st),flush=True)
    best=np.full((h,w),-.1,np.float32);labels=np.full((h,w),255,np.uint8);overlap=np.zeros((h,w),np.uint8)
    for leg in meta['legends']:
        k=leg['index'];b=np.asarray(Image.open(out/f'bin{k:02}-mask.png'))>0;p=np.load(out/f'bin{k:02}-probability.npy')
        take=b&(p>best);labels[take]=k;best[take]=p[take];overlap+=b.astype(np.uint8)
    Image.fromarray(labels).save(out/'labels.png');Image.fromarray(overlap).save(out/'mask-overlap-count.png')
    complete={'status':'succeeded','name':args.name,'seconds':time.perf_counter()-started,'classes':stats,'tiles':sum(v['tiles'] for v in stats),'unknown_pixels':int((labels==255).sum()),'overlap_pixels':int((overlap>1).sum()),'checkpoint_sha256':digest(OLD/'checkpoint_epoch14.pth'),'config_sha256':digest(HERE/'frozen-config.json'),'strict_load':strict,'mode':0,'dtype':'float32','device':'cuda','tile_hw':[1024,1024],'torch':torch.__version__,'gpu_lock_owner':owner}
    write(out/'complete.json',complete);print('INFERENCE_SUCCESS',json.dumps(complete),flush=True)
if __name__=='__main__':main()
