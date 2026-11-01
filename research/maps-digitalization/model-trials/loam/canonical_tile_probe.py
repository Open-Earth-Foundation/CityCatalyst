"""Unscored fidelity diagnostic: one canonical 1024-square tile, fixed origin/bin.

This never reads reference values and never replaces the frozen full-map outputs.
Run only after the main sequential trial ends and sufficient RAM is available.
"""
import sys,os,json,csv,time
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
os.environ['OMP_NUM_THREADS']='4';os.environ['MKL_NUM_THREADS']='4'
sys.path.insert(0,str(HERE/'upstream'))
import psutil,numpy as np
from PIL import Image
def main():
    name=sys.argv[1] if len(sys.argv)>1 else 'porto-heat'
    assert name=='porto-heat'
    available=psutil.virtual_memory().available
    if available<3*2**30:
        (HERE/'evidence/canonical-tile-probe.json').write_text(json.dumps({'status':'not attempted','reason':'less than 3 GiB available RAM for extra canonical-size diagnostic','available_mb':available/2**20}),encoding='utf-8')
        raise SystemExit(77)
    import torch
    from LOAM.loam_model import LOAM
    torch.set_num_threads(4);torch.set_num_interop_threads(1);torch.manual_seed(0)
    d=HERE/'intermediate'/name;key=name+'_bin00_poly'
    aux={r[1]:np.asarray(r[2:],np.float32) for r in list(csv.reader((d/'intermediate9/auxiliary_info.csv').open()))[1:]}
    z=aux[key];base=d/'intermediate7_2'/name
    paths=[base/f'{key}_v7.png']*4+[d/'intermediate7'/f'{name}_crop_blackregion.png',d/'intermediate5/Extraction_3'/f'{name}_overall_boundary_candidate.png',base/f'{key}_v2.png']
    a=np.zeros((7,1024,1024),np.float32)
    for j,p in enumerate(paths):
        v=np.asarray(Image.open(p).convert('L'))[:1024,:1024].copy()
        if j in (0,1,4):v[v>0]=255
        a[j]=v/(255 if np.any(v>1) else 1)
    state=torch.load(HERE/'checkpoint_epoch14.pth',map_location='cpu',weights_only=True,mmap=True);state.pop('mask_values')
    net=LOAM(n_channels=7,n_classes=2,bilinear=False);print(net.load_state_dict(state,strict=True),flush=True);del state;net.eval()
    t=time.perf_counter()
    with torch.inference_mode():
        logits=net(torch.from_numpy(a)[None],torch.from_numpy(z[:32])[None],torch.from_numpy(z[32:])[None])
        prob=logits.softmax(1)[0,1].numpy();mask=logits.argmax(1)[0].numpy().astype(bool)
    seconds=time.perf_counter()-t
    prior=np.load(HERE/'predictions'/name/'bin00-probability.npy',mmap_mode='r')[:1024,:1024]
    prior_mask=np.asarray(Image.open(HERE/'predictions'/name/'bin00-mask.png'))[:1024,:1024]>0
    np.savez_compressed(HERE/'evidence/canonical-tile-probe.npz',probability=prob,mask=mask)
    Image.fromarray(mask.astype(np.uint8)*255).save(HERE/'evidence/canonical-tile-probe-mask.png')
    result={'status':'succeeded','scope':'one source tile, Porto heat bin 0 at origin (0,0); unscored against any reference; not full layer coverage; no replacement of primary outputs',
        'tile_hw':[1024,1024],'seconds':seconds,'available_mb_at_start':available/2**20,'rss_mb_after_forward':psutil.Process().memory_info().rss/2**20,
        'canonical_foreground_pixels':int(mask.sum()),'primary_strip_foreground_pixels':int(prior_mask.sum()),'mask_disagreement_pixels':int((mask!=prior_mask).sum()),'compared_pixels':mask.size,
        'mean_abs_probability_difference':float(abs(prob-prior).mean()),'max_abs_probability_difference':float(abs(prob-prior).max()),
        'note':'Exploratory context/shape diagnostic after primary scoring. No decoding or model settings were chosen using its result. Primary heat bin 0 used two threads; this probe uses four.'}
    (HERE/'evidence/canonical-tile-probe.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result),flush=True)
if __name__=='__main__':main()
