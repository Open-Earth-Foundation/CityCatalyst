"""Check delivered data integrity and spatial evidence, not model accuracy tuning."""
import sys,json,hashlib
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
import numpy as np
from PIL import Image
from shapely.geometry import shape

def main():
    m=json.loads((HERE/'metrics.json').read_text());manifest=json.loads((HERE/'input-manifest.json').read_text());checks=[]
    settings_hash=hashlib.sha256((HERE/'frozen-settings.json').read_bytes()).hexdigest()
    checkpoint_hash=hashlib.sha256((HERE/'checkpoint_epoch14.pth').read_bytes()).hexdigest()
    for meta in manifest:
        n=meta['name'];st=m['layers'][n]
        if st['status']!='succeeded':checks.append({'layer':n,'status':st['status'],'check':'no completed output claimed'});continue
        out=HERE/'predictions'/n;w,h=meta['size'];labels=np.asarray(Image.open(out/'labels.png'))
        assert labels.shape==(h,w)
        assert set(np.unique(labels)).issubset({255,*range(len(meta['legends']))})
        complete=json.loads((out/'complete.json').read_text())
        assert complete['settings_sha256']==settings_hash
        assert complete['checkpoint_sha256']==checkpoint_hash
        pred_union=np.zeros((h,w),bool);binary_count=np.zeros((h,w),np.uint8)
        for leg in meta['legends']:
            k=leg['index'];mask=np.asarray(Image.open(out/f'bin{k:02}-mask.png'))
            assert mask.shape==(h,w) and set(np.unique(mask)).issubset({0,255})
            p=np.load(out/f'bin{k:02}-probability.npy',mmap_mode='r')
            assert p.shape==(h,w) and p.dtype==np.float32 and np.isfinite(p).all() and p.min()>=0 and p.max()<=1
            b=mask>0;pred_union|=b;binary_count+=b
            # A winner must be accepted by its own binary model mask.
            assert np.all(b[labels==k])
            saved=json.loads((out/f'bin{k:02}-complete.json').read_text());assert int(b.sum())==saved['positive_pixels']
        assert np.array_equal(labels!=255,pred_union)
        assert np.array_equal(binary_count,np.asarray(Image.open(out/'mask-overlap-count.png')))
        assert complete['unknown_pixels']==int((labels==255).sum())
        assert complete['overlap_pixels']==int((binary_count>1).sum())
        if meta['family']=='porto':
            for fold,s in st['metrics']['scores'].items():
                assert s['eligible']==s['common']+s['missing']
                assert s['correct_class_count']<=s['common']
                assert np.isclose(s['exact_all_pct'],100*s['correct_class_count']/s['eligible'])
            fc=json.loads((HERE/'evaluation'/'porto'/f'{meta["hazard"]}.geojson').read_text())
            assert len(fc['features'])==st['metrics']['scores']['all']['predicted_cells']
        else:
            fc=json.loads((HERE/'evaluation'/'richfield'/meta['layer']/'prediction.geojson').read_text())
            for c,s in st['metrics']['classes'].items():
                assert s['source_pixels']==s['intersection_pixels']+s['false_negative_pixels']
                assert s['prediction_pixels']==s['intersection_pixels']+s['false_positive_pixels']
        invalid=sum(not shape(f['geometry']).is_valid for f in fc['features'])
        assert invalid==0,(n,invalid)
        checks.append({'layer':n,'status':'passed','full_shape_hw':[h,w],'legend_masks':len(meta['legends']),'predicted_pixels':int(pred_union.sum()),'unknown_pixels':int((labels==255).sum()),'valid_export_features':len(fc['features'])})
    alignment=json.loads((HERE/'evidence'/'alignment.json').read_text())
    if 'porto_heat' in alignment:assert alignment['porto_heat']['source_crop_xyxy']==[770,1209,862,1269]
    if 'richfield' in alignment:assert alignment['richfield']['source_crop_points']==[280,285,600,465]
    result={'status':'passed','completed_layers':sum(x['status']=='passed' for x in checks),'checks':checks,'alignment':alignment,'scope':'artifact/schema/count/provenance/spatial checks; accuracy is separately reported in metrics.json'}
    (HERE/'validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))
if __name__=='__main__':main()
