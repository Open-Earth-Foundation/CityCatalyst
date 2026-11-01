"""Faithful original network/weights and official trade-off=6 bitmaps, in strips."""
import os, sys, json, csv, time, hashlib, gc
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
os.environ['OMP_NUM_THREADS']='2';os.environ['MKL_NUM_THREADS']='2'
sys.path.insert(0,str(HERE/'upstream'))
import numpy as np
from PIL import Image
import torch, psutil
from LOAM.loam_model import LOAM

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    import argparse
    ap=argparse.ArgumentParser();ap.add_argument('name');ap.add_argument('--smoke',action='store_true');ap.add_argument('--force',action='store_true');args=ap.parse_args()
    torch.set_num_threads(4);torch.set_num_interop_threads(1);torch.manual_seed(0)
    np.random.seed(0)
    t=time.perf_counter();meta=next(x for x in json.loads((HERE/'input-manifest.json').read_text()) if x['name']==args.name)
    out=HERE/'predictions'/args.name;out.mkdir(parents=True,exist_ok=True)
    if args.force and (out/'complete.json').exists():(out/'complete.json').unlink()
    d=HERE/'intermediate'/args.name
    assert (d/'success.json').exists()
    aux={r[1]:np.asarray(r[2:],np.float32) for r in list(csv.reader((d/'intermediate9'/'auxiliary_info.csv').open()))[1:]}
    state=torch.load(HERE/'checkpoint_epoch14.pth',map_location='cpu',weights_only=True,mmap=True)
    mask_values=state.pop('mask_values');assert mask_values==[0,1]
    net=LOAM(n_channels=7,n_classes=2,bilinear=False)
    print('STRICT_LOAD',net.load_state_dict(state,strict=True),flush=True)
    del state;gc.collect();net.eval()
    print('MODEL',sum(p.numel() for p in net.parameters()),'parameters','CPU',torch.__version__,'threads',torch.get_num_threads(),flush=True)
    w,h=meta['size'];th,tw=256,1024;peak=0;tiles=0;stats=[]
    for legend in meta['legends']:
        k=legend['index'];key=f'{args.name}_bin{k:02}_poly'
        if not args.smoke and not args.force and (out/f'bin{k:02}-complete.json').exists():
            stats.append(json.loads((out/f'bin{k:02}-complete.json').read_text()));continue
        z=aux[key];assert z.shape==(41,) and np.isfinite(z).all()
        zc=torch.from_numpy(z[:32]).unsqueeze(0);zm=torch.from_numpy(z[32:]).unsqueeze(0)
        base=d/'intermediate7_2'/args.name
        paths=[base/f'{key}_v7.png']*4+[d/'intermediate7'/f'{args.name}_crop_blackregion.png',d/'intermediate5'/'Extraction_3'/f'{args.name}_overall_boundary_candidate.png',base/f'{key}_v2.png']
        images=[np.array(Image.open(p).convert('L')) for p in paths]
        assert all(im.shape==(h,w) for im in images)
        prob=np.zeros((h,w),np.float32);mask=np.zeros((h,w),bool);kt=time.perf_counter();kn=0
        for y in range(0,h,th):
            for x in range(0,w,tw):
                ah,aw=min(th,h-y),min(tw,w-x)
                a=np.zeros((7,th,tw),np.float32)
                for j,im in enumerate(images):
                    v=im[y:y+ah,x:x+aw].copy()
                    # Same transformations as postprocessing_for_bitmap_worker and BasicDataset.
                    if j in (0,1,4):v[v>0]=255
                    a[j,:ah,:aw]=v.astype(np.float32)/(255 if np.any(v>1) else 1)
                tt=time.perf_counter()
                with torch.inference_mode():
                    logits=net(torch.from_numpy(a).unsqueeze(0),zc,zm)
                    assert tuple(logits.shape)==(1,2,th,tw)
                    p=logits.softmax(1)[0,1,:ah,:aw].numpy()
                    b=logits.argmax(1)[0,:ah,:aw].numpy().astype(bool)
                    prob[y:y+ah,x:x+aw]=p;mask[y:y+ah,x:x+aw]=b
                tiles+=1;kn+=1;peak=max(peak,psutil.Process().memory_info().rss)
                if args.smoke or kn%8==0:
                    print(json.dumps({'name':args.name,'class':k,'tile':[x,y,aw,ah],'tile_s':time.perf_counter()-tt,'tiles':kn,'peak_rss_mb':peak/2**20}),flush=True)
                del logits,a
                if args.smoke:
                    np.savez_compressed(out/'smoke-real-source.npz',probability=p,mask=b,origin_xy=[x,y])
                    (out/'smoke.json').write_text(json.dumps({'seconds':time.perf_counter()-t,'rss_mb':peak/2**20,'tile_hw':[th,tw],'scope':'one real source tile; not a complete layer'}),encoding='utf-8')
                    return
        Image.fromarray(mask.astype(np.uint8)*255).save(out/f'bin{k:02}-mask.png')
        np.save(out/f'bin{k:02}-probability.npy',prob)
        st={'index':k,'seconds':time.perf_counter()-kt,'tiles':kn,'positive_pixels':int(mask.sum()),'peak_rss_mb':peak/2**20,'torch_threads':torch.get_num_threads()}
        (out/f'bin{k:02}-complete.json').write_text(json.dumps(st),encoding='utf-8');stats.append(st)
        print('CLASS_COMPLETE',json.dumps(st),flush=True)
    # Winner arbitration uses float32 probabilities (saved losslessly), only accepted masks.
    best=np.full((h,w),-.1,np.float32);labels=np.full((h,w),255,np.uint8);overlap=np.zeros((h,w),np.uint8)
    for legend in meta['legends']:
        k=legend['index'];b=np.asarray(Image.open(out/f'bin{k:02}-mask.png'))>0;p=np.load(out/f'bin{k:02}-probability.npy')
        take=b&(p>best);labels[take]=k;best[take]=p[take];overlap+=b.astype(np.uint8)
    Image.fromarray(labels).save(out/'labels.png');Image.fromarray(overlap).save(out/'mask-overlap-count.png')
    result={'status':'succeeded','name':args.name,'seconds_this_invocation':time.perf_counter()-t,'class_seconds_total':sum(s['seconds'] for s in stats),'classes':stats,'overlap_pixels':int((overlap>1).sum()),'unknown_pixels':int((labels==255).sum()),'checkpoint_sha256':sha(HERE/'checkpoint_epoch14.pth'),'settings_sha256':sha(HERE/'frozen-settings.json'),'model':'unmodified upstream LOAM, 7 channels, 2 classes, CPU float32','tiles':sum(s['tiles'] for s in stats)}
    (out/'complete.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print('INFERENCE_SUCCESS',json.dumps(result),flush=True)

if __name__=='__main__':main()
