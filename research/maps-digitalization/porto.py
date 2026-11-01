"""Porto ARVC profile: PDF recovery never reads reference hazard values."""
from pathlib import Path
import io,json,hashlib
import numpy as np
import pymupdf
from PIL import Image,ImageDraw
from pyproj import Transformer

ROOT=Path(__file__).parent
INPUT=ROOT/'inputs'
OUT=ROOT/'outputs'
PAGES=dict(flood=85,landslide=93,heat=100,drought=106,arbovirus=111,storm=117)
RAMP=np.array([(253,245,239),(253,226,213),(251,194,170),(252,158,127),(251,123,90),(244,85,62),(227,46,40),(194,22,24),(157,13,19),(102,0,13)],dtype=np.float32)
NONDATA=np.array([(226,226,226),(198,226,242),(45,104,56),(166,209,162),(128,128,128),(0,0,0),(90,90,90),(180,180,180),(255,255,255),(250,250,250)],dtype=np.float32)
FWD=Transformer.from_crs(4326,31982,always_xy=True)
INV=Transformer.from_crs(31982,4326,always_xy=True)
E0,N1,CELL,NX=462000.,6692000.,250.,152

def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def write_json(path,data):
    Path(path).parent.mkdir(parents=True,exist_ok=True)
    Path(path).write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,indent=2),encoding='utf-8')

def figure(page):
    with pymupdf.open(INPUT/'porto-alegre-arvc.pdf') as doc:
        image=max(doc[page-1].get_images(full=True),key=lambda im:im[2]*im[3])
        return np.asarray(Image.open(io.BytesIO(doc.extract_image(image[0])['image'])).convert('RGB'))

def centres(mask):
    ids=np.flatnonzero(mask)
    return np.array([a.mean() for a in np.split(ids,np.where(np.diff(ids)>1)[0]+1) if len(a)])

def fit_ticks(rgb):
    h,w=rgb.shape[:2];dark=rgb.max(2)<100
    left=np.flatnonzero(dark.sum(0)>h*.55).min();bottom=np.flatnonzero(dark.sum(1)>w*.65).max()
    xs=centres(dark[bottom+2:bottom+17,:].sum(0)>=7)
    ys=centres((dark[:,left-14:left-2].sum(1)>=7)&(np.arange(h)>200)&(np.arange(h)<bottom-25))
    if len(xs)!=7 or len(ys)!=7:raise ValueError('Expected seven verified labelled ticks per axis; manual control required')
    e=np.arange(470000,500001,5000);n=np.arange(6685000,6654999,-5000)
    mx,bx=np.polyfit(xs,e,1);my,by=np.polyfit(ys,n,1)
    residual=max(abs(mx*xs+bx-e).max(),abs(my*ys+by-n).max())
    if residual>25:raise ValueError('Tick-fit gate failed')
    return {'mx':float(mx),'bx':float(bx),'my':float(my),'by':float(by),'tick_fit_max_residual_m':float(residual),'control_note':'Printed numeric labels verified for this document profile; residual is not survey accuracy.'}

def map_domain(rgb,aff):
    h,w=rgb.shape[:2];mask=Image.new('1',(w,h));draw=ImageDraw.Draw(mask)
    boundary=json.loads((INPUT/'porto-boundary.json').read_text(encoding='utf-8'))['boundaryGeoJson']['geometry']
    polygons=boundary['coordinates'] if boundary['type']=='MultiPolygon' else [boundary['coordinates']]
    for poly in polygons:
        for i,ring in enumerate(poly):
            ll=np.array(ring);e,n=FWD.transform(ll[:,0],ll[:,1])
            draw.polygon(list(zip((e-aff['bx'])/aff['mx'],(n-aff['by'])/aff['my'])),fill=not i)
    yy,xx=np.nonzero(np.asarray(mask))
    gx=np.floor((aff['mx']*xx+aff['bx']-E0)/CELL).astype(int)
    gy=np.floor((N1-aff['my']*yy-aff['by'])/CELL).astype(int)
    ok=(gx>=0)&(gx<NX)&(gy>=0)
    return yy[ok],xx[ok],gy[ok]*NX+gx[ok]

def classify_nearest(pixels):
    pixels=np.asarray(pixels,dtype=np.float32)
    d=((pixels[:,None,:]-RAMP[None,:,:])**2).sum(2)
    dn=((pixels[:,None,:]-NONDATA[None,:,:])**2).sum(2).min(1)
    steps=d.argmin(1);best=d.min(1)
    valid=(best<=42**2)&(best<dn)
    return np.where(valid,steps,-1),np.sqrt(best)

def classify_blended(pixels,min_alpha):
    """Fit a palette swatch composited with neutral map furniture; never infer through masks."""
    pixels=np.asarray(pixels,dtype=np.float32)
    best=np.full(len(pixels),np.inf,dtype=np.float32);labels=np.full(len(pixels),-1,dtype=np.int16)
    for k,swatch in enumerate(RAMP):
        for bg in (90.,128.,180.,226.,255.):
            direction=swatch-bg
            alpha=np.clip(((pixels-bg)*direction).sum(1)/(direction*direction).sum(),0,1)
            error=np.sqrt(((pixels-(bg+alpha[:,None]*direction))**2).sum(1))
            cost=error+2*(1-alpha)
            take=(alpha>=min_alpha)&(cost<best)
            best[take]=cost[take];labels[take]=k
    dn=np.sqrt(((pixels[:,None,:]-NONDATA[None,:,:])**2).sum(2).min(1))
    # Dark legend reds have blue above green (maximum 13); retain those exact swatches.
    red=(pixels[:,0]>pixels[:,1]+2)&(pixels[:,0]>pixels[:,2]+4)&(pixels[:,1]>=pixels[:,2]-16)
    valid=(best<=14)&(best<dn)&red
    return np.where(valid,labels,-1),best

def aggregate(ids,steps,support=3,median=False):
    if len(ids)==0 or len(ids)!=len(steps) or support<1:raise ValueError('Invalid aggregation inputs')
    keep=steps>=0;k=ids[keep];v=(steps[keep].astype(float)+.5)/10
    counts=np.bincount(k,minlength=int(ids.max())+1);totals=np.bincount(ids,minlength=len(counts))
    sums=np.bincount(k,weights=v,minlength=len(counts));good=np.flatnonzero(counts>=support)
    means=np.divide(sums,counts,out=np.zeros(len(counts)),where=counts>0)
    if median:
        order=np.argsort(k);ks=k[order];vs=v[order]
        for idx,group in zip(*np.unique(ks,return_index=True)):
            means[idx]=np.median(vs[group:group+counts[idx]])
    vals={int(i):float(means[i]) for i in good}
    meta={int(i):{'recognized_pixels':int(counts[i]),'municipal_pixels':int(totals[i]),'support_fraction':float(counts[i]/totals[i]),
                 'bin_quantization_half_width':.05,'status':'estimated_from_observed_colours'} for i in good}
    return vals,meta

def polygon_for_id(k):
    y,x=divmod(int(k),NX);e=E0+x*CELL;n=N1-y*CELL
    ring=[[round(z,7) for z in INV.transform(ee,nn)] for ee,nn in [(e,n),(e,n-CELL),(e+CELL,n-CELL),(e+CELL,n),(e,n)]]
    return {'type':'Polygon','coordinates':[ring]}

def export_cells(path,hazard,values,support,provenance):
    from shapely.geometry import shape
    features=[]
    for k,v in sorted(values.items()):
        if not np.isfinite(v) or not 0<=v<=1:raise ValueError('Risk value must be finite in [0,1]')
        geom=polygon_for_id(k)
        if not shape(geom).is_valid:raise ValueError('Final cell geometry invalid')
        features.append({'type':'Feature','id':k,'properties':{'hazard':hazard,'value':v,'class_index':min(int(np.floor(v*5)),4),**support.get(k,{})},'geometry':geom})
    write_json(path,{'type':'FeatureCollection','provenance':provenance,'features':features})

if __name__=='__main__':
    raise SystemExit('Use run.py; this module separates PDF recovery from benchmark reference ingestion.')
