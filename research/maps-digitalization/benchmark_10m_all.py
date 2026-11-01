"""Frozen 10m centre-sampling evaluation; no coarse aggregation or parameter tuning."""
import json, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
from pyproj import Transformer
import rasterio
from rasterio.transform import Affine
from porto import ROOT, INPUT, OUT, PAGES, E0, N1, figure, fit_ticks, map_domain, classify_blended, digest, write_json

DEST=OUT/'porto-all-10m'
SIZE=10; W=3800; H=4200
TRANSFORM=Affine(10,0,E0,0,-10,N1)
METHODS=['colour_recovery','golden_muscat','loam','jvp_resampled']

def sample(src,aff):
    x=np.floor((E0+(np.arange(W)+.5)*10-aff['bx'])/aff['mx']+.5).astype(int)
    y=np.floor((N1-(np.arange(H)+.5)*10-aff['by'])/aff['my']+.5).astype(int)
    out=np.full((H,W),-1,np.int16)
    gx=(x>=0)&(x<src.shape[1]);gy=(y>=0)&(y<src.shape[0])
    out[np.ix_(gy,gx)]=src[np.ix_(y[gy],x[gx])]
    return out

def reference_grid(hazard):
    manifest=json.loads((INPUT/'arvc-manifest.json').read_text(encoding='utf-8'))
    entry=manifest['layers']['arvc_off_risk_'+hazard+'_2050']
    im=Image.open(INPUT/f'arvc_off_risk_{hazard}_2050.png')
    assert im.mode=='P'
    assert im.info['transparency']==255 or im.info['transparency']==bytes([255])*255+bytes([0])
    src=np.asarray(im);(s,w),(n,e)=entry['bounds']
    merc=Transformer.from_crs(4326,3857,always_xy=True)
    xmin,ymin=merc.transform(w,s);xmax,ymax=merc.transform(e,n)
    trans=Transformer.from_crs(31982,3857,always_xy=True)
    ref=np.full((H,W),255,np.uint8)
    for start in range(0,H,100):
        end=min(H,start+100)
        xx,yy=np.meshgrid(E0+(np.arange(W)+.5)*10,N1-(np.arange(start,end)+.5)*10)
        mx,my=trans.transform(xx,yy)
        sx=np.floor((mx-xmin)/(xmax-xmin)*im.width).astype(int)
        sy=np.floor((ymax-my)/(ymax-ymin)*im.height).astype(int)
        valid=(sx>=0)&(sx<im.width)&(sy>=0)&(sy<im.height)
        chunk=ref[start:end];chunk[valid]=src[sy[valid],sx[valid]]
    # Ensure the extent contains all valid native reference pixel centres.
    yy,xx=np.where(src!=255)
    en=Transformer.from_crs(3857,31982,always_xy=True)
    ee,nn=en.transform(xmin+(xx+.5)*(xmax-xmin)/im.width,ymax-(yy+.5)*(ymax-ymin)/im.height)
    assert np.all((ee>=E0)&(ee<E0+W*10)&(nn<=N1)&(nn>N1-H*10))
    return ref

def scores(ref,pred,mask):
    eligible=(ref!=255)&mask;present=(pred>=0)&mask;common=eligible&present
    a=ref[common].astype(float)/254;b=(pred[common].astype(float)+.5)/10
    ca=np.minimum(np.floor(a*5).astype(int),4);cb=pred[common]//2
    n=int(eligible.sum());c=int(common.sum());correct=int((ca==cb).sum())
    high=int(((ref!=255)&(ref/254>=.6)&mask).sum());tp=int(((ca>=3)&(cb>=3)).sum());ph=int((cb>=3).sum())
    unsupported=int((present&~(ref!=255)).sum());p=int(present.sum())
    ratio=lambda x,d:100*x/d if d else None
    confusion=np.zeros((5,6),np.int64)
    np.add.at(confusion,(ca,cb),1)
    missing=eligible&~present
    mc=np.minimum(np.floor(ref[missing].astype(float)/254*5).astype(int),4)
    confusion[:,5]=np.bincount(mc,minlength=5)
    assert int(confusion.sum())==n
    return dict(eligible=n,common=c,correct=correct,missing=n-c,exact_all_pct=ratio(correct,n),exact_common_pct=ratio(correct,c),missing_pct=ratio(n-c,n),mae=float(np.abs(b-a).mean()) if c else None,bias=float((b-a).mean()) if c else None,high_reference=high,high_true_positive=tp,high_predicted_common=ph,high_recall_pct=ratio(tp,high),high_precision_common_pct=ratio(tp,ph),predicted=p,predicted_without_reference=unsupported,predicted_without_reference_pct=ratio(unsupported,p),confusion=confusion.tolist())

def save_grid(path,steps):
    encoded=np.where(steps<0,255,steps).astype(np.uint8)
    with rasterio.open(path,'w',driver='GTiff',width=W,height=H,count=1,dtype='uint8',crs='EPSG:31982',transform=TRANSFORM,nodata=255,compress='deflate',tiled=True) as ds:
        ds.write(encoded,1)
        ds.update_tags(encoding='0..9: risk bin midpoint (step+0.5)/10; 255 unknown',sampling='Nearest source pixel at each 10m cell centre; no added source detail')
    with rasterio.open(path) as ds:
        assert ds.res==(10.,10.) and np.array_equal(ds.read(1),encoded)

def main():
    DEST.mkdir(exist_ok=True)
    # Stable geographical blocks, independent of output resolution.
    blocks=np.array([[int.from_bytes(hashlib.sha256(f'{x}:{y}'.encode()).digest()[:4],'big')%5==0 for x in range(13)] for y in range(14)])
    test=blocks[np.arange(H)[:,None]//300,np.arange(W)[None,:]//300]
    report={'grid_m':10,'shape':[H,W],'origin':[E0,N1],'crs':'EPSG:31982','methods':METHODS,'contract':'10m cell centres; reference nearest native pixel footprint; no 250m averaging; existing 3km test blocks; retrospective','reference':'Same-author numerical PNG derivatives; TIFF provenance unauthenticated. Repeated 10m samples are correlated, not new independent observations.','eligibility':'Reference pixel covering the 10m centre has data. The former 15 reference-pixel threshold is inapplicable below source resolution.','predictions':'Existing frozen source-pixel outputs sampled to 10m. JVP is an explicitly upsampled coarse baseline, not a new 10m extraction.','hazards':{},'script_sha256':digest(__file__)}
    jvp=json.loads((INPUT/'arvc-poa.json').read_text(encoding='utf-8'))
    for hazard,page in PAGES.items():
        print('Starting '+hazard,flush=True)
        folder=DEST/hazard;folder.mkdir(exist_ok=True)
        rgb=figure(page);aff=fit_ticks(rgb);yy,xx,ids=map_domain(rgb,aff)
        ref=reference_grid(hazard)
        result={'source_pixel_size_m':[aff['mx'],abs(aff['my'])],'reference_sha256':digest(INPUT/f'arvc_off_risk_{hazard}_2050.png'),'methods':{}}
        for method in METHODS:
            src=np.full(rgb.shape[:2],-1,np.int16)
            if method=='colour_recovery':
                labels,_=classify_blended(rgb[yy,xx],.35);src[yy,xx]=labels
            elif method in ('golden_muscat','loam'):
                trial='uiuc' if method=='golden_muscat' else 'loam'
                file=ROOT/'model-trials'/trial/'predictions'/('porto-'+hazard)/'labels.png'
                labels=np.asarray(Image.open(file)).astype(np.int16)
                assert labels.shape==src.shape
                if trial=='uiuc':labels-=1
                else:labels[labels==255]=-1
                src[yy,xx]=labels[yy,xx]
            if method=='jvp_resampled':
                # Read shipped cells; use documented intended legend step.
                grid=np.full((H,W),-1,np.int16)
                for key,value in jvp['hazards'][hazard+'_risk_2050'].items():
                    k=int(key)
                    row,col=divmod(k,152)
                    grid[row*25:(row+1)*25,col*25:(col+1)*25]=int(np.rint(float(value)*9))
            else:grid=sample(src,aff)
            assert set(np.unique(grid))<=set(range(-1,10))
            target=folder/(method+'.tif');save_grid(target,grid)
            result['methods'][method]={'all':scores(ref,grid,np.ones(ref.shape,bool)),'test':scores(ref,grid,test),'output':str(target),'sha256':digest(target)}
            print(method, result['methods'][method]['test']['exact_all_pct'],flush=True)
        report['hazards'][hazard]=result
        write_json(DEST/'benchmark.json',report)
    report['test_macro']={m:{key:float(np.mean([v['methods'][m]['test'][key] for v in report['hazards'].values()])) for key in ['exact_all_pct','missing_pct','mae','high_recall_pct']} for m in METHODS}
    write_json(DEST/'benchmark.json',report)
    print(json.dumps(report['test_macro'],indent=2))

if __name__=='__main__':main()
