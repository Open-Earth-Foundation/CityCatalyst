"""CPU portability adapter using unmodified upstream UNet and strict checkpoint load.
No evaluation helpers or numeric reference files are imported/read here.
"""
import sys, os, json, argparse, time, hashlib, datetime, traceback, gc
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'Darpa_Unet_Release'))
import numpy as np
from PIL import Image
import torch
from models.models import UNet

def save(path,obj):
    path.write_text(json.dumps(obj,indent=2,ensure_ascii=False,allow_nan=False),encoding='utf-8')

def starts(n):
    return list(range(0,max(0,int(np.ceil((n-256)/192)))*192+1,192))

def run(only=None):
    t0=time.perf_counter(); cfg=json.loads((HERE/'frozen-config.json').read_text(encoding='utf-8'))
    sha=hashlib.sha256((HERE/'frozen-config.json').read_bytes()).hexdigest()
    assert sha==(HERE/'frozen-config.sha256').read_text().strip()
    torch.set_num_threads(cfg['cpu_threads']);torch.set_num_interop_threads(1)
    torch.manual_seed(0)
    checkpoint=HERE/'weights/jaccard_index_value=0.9229.ckpt'
    assert hashlib.file_digest(open(checkpoint,'rb'),'sha256').hexdigest()==cfg['checkpoint_sha256']
    with torch.serialization.safe_globals([argparse.Namespace]):
        ckpt=torch.load(checkpoint,map_location='cpu',weights_only=True)
    model=UNet(n_channels=6,n_classes=2)
    state={k.removeprefix('model.'):v for k,v in ckpt['state_dict'].items()}
    result=model.load_state_dict(state,strict=True)
    save(HERE/'checkpoint-inspection.json',{'load_result':str(result),'parameters':sum(p.numel() for p in model.parameters()),
        'epoch':ckpt.get('epoch'),'global_step':ckpt.get('global_step'),'checkpoint_lightning_version':ckpt.get('pytorch-lightning_version'),
        'keys':list(ckpt),'first_kernel_shape':list(state['inc.double_conv.0.weight'].shape),
        'output_kernel_shape':list(state['outc.conv.weight'].shape),'torch':torch.__version__,
        'device':'cpu','config_sha256':sha})
    del state,ckpt;gc.collect()
    model=model.to(memory_format=torch.channels_last).eval()
    mean=torch.tensor([.485,.456,.406])[None,:,None,None]
    std=torch.tensor([.229,.224,.225])[None,:,None,None]
    predroot=HERE/'predictions';predroot.mkdir(exist_ok=True)
    for layer in cfg['layers']:
        key=layer['id']
        if only and key not in only:continue
        dst=predroot/key;dst.mkdir(exist_ok=True)
        if (dst/'run.json').exists():
            prev=json.loads((dst/'run.json').read_text())
            if prev.get('status')=='succeeded' and prev['config_sha256']==sha:
                print('RESUME skip completed',key,flush=True);continue
        begin=time.perf_counter();started=datetime.datetime.now(datetime.timezone.utc).isoformat()
        print('START',key,started,flush=True)
        try:
            rgb=np.array(Image.open(HERE/'sources'/key/'map.png').convert('RGB'))
            h,w=rgb.shape[:2];ys=starts(h);xs=starts(w)
            padded=np.pad(rgb,((0,ys[-1]+256-h),(0,xs[-1]+256-w),(0,0)),constant_values=0)
            best=np.zeros((h,w),np.float32);labels=np.zeros((h,w),np.uint8)
            positives=np.zeros((h,w),np.uint8);patch_count=0
            for legend in layer['legends']:
                k=legend['index'];lt=time.perf_counter()
                swatch=np.array(Image.open(HERE/'sources'/key/f'legend-{k:02d}.png').convert('RGB'))
                lg=torch.from_numpy(swatch.copy()).permute(2,0,1).float()[None]
                lg=torch.nn.functional.interpolate(lg,size=(256,256),mode='bilinear',align_corners=False,antialias=False)
                lg=((lg/255-mean)/std).contiguous(memory_format=torch.channels_last)
                prob=np.zeros((h,w),np.float32);coverage=np.zeros((h,w),np.uint8)
                with torch.inference_mode():
                    for ri,y in enumerate(ys):
                        for ci,x in enumerate(xs):
                            tile=padded[y:y+256,x:x+256]
                            mt=torch.from_numpy(tile.copy()).permute(2,0,1).float()[None]
                            mt=((mt/255-mean)/std).contiguous(memory_format=torch.channels_last)
                            logits=model(mt,lg)
                            q=torch.softmax(logits,dim=1)[0,1].numpy()
                            if not np.isfinite(q).all():raise ValueError('Nonfinite model output')
                            sy=0 if ri==0 else 32;sx=0 if ci==0 else 32
                            ey=min(256 if ri==len(ys)-1 else 224,h-y)
                            ex=min(256 if ci==len(xs)-1 else 224,w-x)
                            prob[y+sy:y+ey,x+sx:x+ex]=q[sy:ey,sx:ex]
                            coverage[y+sy:y+ey,x+sx:x+ex]+=1;patch_count+=1
                assert np.all(coverage==1),'Every source pixel must be predicted exactly once after overlap discard'
                positive=prob>=cfg['minimum_confidence'];positives+=positive
                Image.fromarray(positive.astype(np.uint8)*255).save(dst/f'mask-{k:02d}.png')
                np.savez_compressed(dst/f'probability-{k:02d}.npz',probability=prob.astype(np.float16))
                take=prob>=best; labels[take]=k;np.maximum(best,prob,out=best)
                print('LEGEND',key,k,'positive',int(positive.sum()),'seconds',round(time.perf_counter()-lt,2),flush=True)
            labels[best<cfg['minimum_confidence']]=0
            Image.fromarray(labels).save(dst/'labels.png')
            np.savez_compressed(dst/'confidence.npz',confidence=best.astype(np.float16))
            Image.fromarray(positives).save(dst/'positive-count.png')
            run={'id':key,'status':'succeeded','started_utc':started,'completed_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 'seconds':time.perf_counter()-begin,'config_sha256':sha,'shape':[h,w],'model_forward_calls':patch_count,
                 'source_pixels':h*w,'unknown_pixels':int((labels==0).sum()),'overlapping_positive_pixels':int((positives>1).sum()),
                 'label_counts':{str(k):int((labels==k).sum()) for k in range(len(layer['legends'])+1)},
                 'device':'cpu','precision':'float32','source_pixel_coverage_check':'all pixels exactly once after overlap discard',
                 'labels_sha256':hashlib.sha256((dst/'labels.png').read_bytes()).hexdigest()}
            save(dst/'run.json',run);print('DONE',json.dumps(run),flush=True)
        except Exception as e:
            traceback.print_exc();save(dst/'run.json',{'id':key,'status':'failed','error':repr(e),'seconds':time.perf_counter()-begin,'config_sha256':sha})
        gc.collect()
    print('TOTAL PROCESS SECONDS',time.perf_counter()-t0,flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--only',nargs='*');args=p.parse_args();run(args.only)
