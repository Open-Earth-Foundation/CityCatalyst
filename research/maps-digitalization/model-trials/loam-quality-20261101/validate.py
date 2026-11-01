"""Meaningful artifact invariants, read-only provenance, frozen protocol, GIS QA."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import json,hashlib,gc
import numpy as np
from PIL import Image
import rasterio
HERE=Path(__file__).resolve().parent;OLD=HERE.parent/'loam';ROOT=HERE.parents[1]
def sha(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def main():
    original=json.loads((HERE/'read-only-input-hashes.json').read_text());changed=[p for p,h in original.items() if sha(Path(p))!=h]
    assert not changed,changed
    assert sha(HERE/'frozen-config.json')==(HERE/'frozen-config.sha256').read_text().strip()
    manifest=json.loads((HERE/'input-manifest.json').read_text());result={'read_only_inputs_unchanged':len(original),'frozen_config_unchanged':True,'layers':{},'tiffs':[],'mode0_channel_evidence':{}}
    for m in manifest:
        name=m['name'];folder=HERE/'predictions'/name;complete=json.loads((folder/'complete.json').read_text());w,h=m['size']
        assert complete['tile_hw']==[1024,1024] and complete['mode']==0 and complete['dtype']=='float32' and complete['strict_load']=='<All keys matched successfully>'
        assert complete['config_sha256']==sha(HERE/'frozen-config.json')
        lab=np.asarray(Image.open(folder/'labels.png'));assert lab.shape==(h,w)
        best=np.full((h,w),-.1,np.float32);expected=np.full((h,w),255,np.uint8);overlap=np.zeros((h,w),np.uint8)
        for leg in m['legends']:
            k=leg['index'];p=np.load(folder/f'bin{k:02}-probability.npy');b=np.asarray(Image.open(folder/f'bin{k:02}-mask.png'))>0
            assert p.dtype==np.float32 and p.shape==b.shape==(h,w) and np.isfinite(p).all() and p.min()>=0 and p.max()<=1
            # Float32 softmax can round logits that are nearly tied to .5; compare
            # with a small rounding allowance while preserving raw argmax masks.
            assert np.all(p[b]>=.5-1e-7) and np.all(p[~b]<=.5+1e-7)
            take=b&(p>best);expected[take]=k;best[take]=p[take];overlap+=b.astype(np.uint8)
        assert np.array_equal(expected,lab) and np.array_equal(overlap,np.asarray(Image.open(folder/'mask-overlap-count.png')))
        assert complete['tiles']==len(m['legends'])*((h+1023)//1024)*((w+1023)//1024)
        result['layers'][name]={'dimensions':[w,h],'queries':len(m['legends']),'canonical_tiles':complete['tiles'],'winner_arbitration_exact':True,'all_probability_arrays_valid':True,'unknown_pixels':int((lab==255).sum()),'overlap_pixels':int((overlap>1).sum())}
        if m['family']=='richfield':
            scale=m.get('render_pixels_per_point',1)
            old=next(x for x in json.loads((OLD/'input-manifest.json').read_text()) if x['name']=='richfield-'+m['layer'])
            assert m['size']==[int(v*scale) for v in old['size']]
            if scale==1:
                for suffix in ['.tif','.json','-bound.json']:assert sha(HERE/'inputs'/(name+suffix))==sha(OLD/'inputs'/(old['name']+suffix))
        del best,expected,overlap,lab;gc.collect()
    for name in ['porto-heat','porto-flood','richfield-inundation-100yr']:
        key=name+'_bin00_poly';d=HERE/'intermediate'/name
        paths=[d/'intermediate7_2'/name/(key+'_'+s+'.png') for s in ['v7','v4v','c0_x','c1_x']]+[d/'intermediate7'/(name+'_crop_blackregion.png'),d/'intermediate5'/'Extraction_3'/(name+'_overall_boundary_candidate.png'),d/'intermediate8_2'/name/(key+'_rc_v0.png')]
        channels=[]
        for p in paths:
            a=np.asarray(Image.open(p));channels.append({'file':str(p),'sha256':sha(p),'shape':a.shape,'nonzero_values':int(np.count_nonzero(a)),'unique_values':int(len(np.unique(a)))})
        result['mode0_channel_evidence'][name]=channels
    for p in (HERE/'evaluation').rglob('*.tif'):
        with rasterio.open(p) as ds:
            assert ds.res==(10.,10.) and ds.nodata==255 and ds.crs.to_epsg() in (31982,26915)
            result['tiffs'].append({'file':str(p),'shape':ds.shape,'crs':ds.crs.to_string(),'resolution':ds.res,'sha256':sha(p)})
    assert len(result['layers'])==16 and len(result['tiffs'])==42
    scores=json.loads((HERE/'metrics.json').read_text());assert len(scores['porto'])==6 and len(scores['richfield'])==5 and len(scores['richfield72_controls'])==5 and not scores['uncompleted']
    for name,s in scores['porto'].items():
        hazard=name.removeprefix('porto-')
        with rasterio.open(ROOT/'outputs'/'porto-all-10m'/hazard/'loam.tif') as ds:saved=ds.read(1)
        with rasterio.open(HERE/'evaluation'/'porto'/hazard/'previous-10m.tif') as ds:recomputed=ds.read(1)
        assert np.array_equal(saved,recomputed),(name,'prior grid differs')
    result['porto_prior_exact_contract_match']=True
    result['own_gpu_lock_released']=not (HERE.parent/'gpu.lock').exists() or str(HERE) not in (HERE.parent/'gpu.lock').read_text()
    assert result['own_gpu_lock_released']
    (HERE/'validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    include=[p for p in HERE.rglob('*') if p.is_file() and not any(x in p.relative_to(HERE).parts for x in ['.venv','cache','tmp']) and p.name not in ['artifact-hashes.json','validation.log','report.md']]
    hashes={str(p.relative_to(HERE)):sha(p) for p in include}
    (HERE/'artifact-hashes.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8')
    print(json.dumps({'status':'passed','layers':len(result['layers']),'tiffs':len(result['tiffs']),'hashed_artifacts':len(hashes),'read_only_files_unchanged':len(original),'own_gpu_lock_released':result['own_gpu_lock_released']}),flush=True)
if __name__=='__main__':main()
