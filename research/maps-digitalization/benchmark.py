"""Reference values are isolated here; PDF recovery code has no access to them."""
import json,hashlib
import numpy as np
from PIL import Image
from pyproj import Transformer
from porto import INPUT,E0,N1,CELL,NX

def reference(hazard,min_pixels=15):
    manifest=json.loads((INPUT/'arvc-manifest.json').read_text(encoding='utf-8'))
    if 'EPSG:3857' not in manifest['provenance']['encoding']['format']:raise ValueError('Unsupported raster encoding CRS')
    entry=manifest['layers']['arvc_off_risk_'+hazard+'_2050']
    im=Image.open(INPUT/('arvc_off_risk_'+hazard+'_2050.png'))
    transparency=im.info.get('transparency')
    valid_alpha=transparency==255 or (isinstance(transparency,bytes) and len(transparency)==256 and transparency[:255]==bytes([255])*255 and transparency[255]==0)
    if im.mode!='P' or not valid_alpha:raise ValueError('Unsupported indexed PNG / no-data encoding')
    idx=np.asarray(im);y,x=np.where(idx!=255)
    (south,west),(north,east)=entry['bounds'];proj=Transformer.from_crs(4326,3857,always_xy=True)
    xmin,ymin=proj.transform(west,south);xmax,ymax=proj.transform(east,north)
    e,n=Transformer.from_crs(3857,31982,always_xy=True).transform(xmin+(x+.5)*(xmax-xmin)/im.width,ymax-(y+.5)*(ymax-ymin)/im.height)
    gx=np.floor((e-E0)/CELL).astype(int);gy=np.floor((N1-n)/CELL).astype(int)
    assert np.all((gx>=0)&(gx<NX)&(gy>=0))
    ids=gy*NX+gx;counts=np.bincount(ids);sums=np.bincount(ids,weights=idx[y,x]/254)
    return {int(k):float(sums[k]/counts[k]) for k in np.flatnonzero(counts>=min_pixels)},counts

def split(k):
    y,x=divmod(int(k),NX)
    fold=int.from_bytes(hashlib.sha256(f'{x//12}:{y//12}'.encode()).digest()[:4],'big')%5
    return 'test' if fold==0 else 'validation' if fold==1 else 'development'

def metrics(reference_values,counts,prediction,subset=None,jvp=False):
    ref={k:v for k,v in reference_values.items() if subset is None or split(k)==subset}
    pred={k:v for k,v in prediction.items() if subset is None or split(k)==subset}
    common=sorted(ref.keys()&pred.keys())
    if not common or not ref:raise ValueError('Empty comparison domain')
    a=np.array([ref[k] for k in common]);b=np.array([pred[k] for k in common])
    ca=np.minimum(np.floor(a*5).astype(int),4)
    cb=np.minimum(np.rint(b*9).astype(int)//2,4) if jvp else np.minimum(np.floor(b*5).astype(int),4)
    correct=int((ca==cb).sum());high_total=sum(v>=.6 for v in ref.values())
    zero_reference=[k for k in pred if k>=len(counts) or counts[k]==0]
    low_reference=[k for k in pred if k<len(counts) and 0<counts[k]<15]
    predicted_high=int((cb>=3).sum())
    return {'eligible':len(ref),'common':len(common),'missing':len(ref)-len(common),'missing_pct':100*(len(ref)-len(common))/len(ref),
        'exact_common_pct':100*correct/len(common),'exact_all_pct':100*correct/len(ref),'bias':float((b-a).mean()),'mae':float(abs(b-a).mean()),
        'high_recall_pct':100*int(((ca>=3)&(cb>=3)).sum())/high_total if high_total else None,
        'high_precision_common_pct':100*int(((ca>=3)&(cb>=3)).sum())/predicted_high if predicted_high else None,
        'predicted_low_reference_pct':100*len(low_reference)/max(len(pred),1),
        'predicted_cells':len(pred),'predicted_zero_reference_cells':len(zero_reference),'predicted_zero_reference_pct':100*len(zero_reference)/max(len(pred),1)}
