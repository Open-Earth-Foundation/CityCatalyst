"""Evaluation-only: unchanged Porto10m contract, direct Richfield PDF f/fs fills."""
import sys
sys.dont_write_bytecode=True
import json,hashlib,time,math,gc
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];OLD=HERE.parent/'loam'
sys.path.insert(0,str(ROOT))
import numpy as np
from PIL import Image
import rasterio,pymupdf,shapely
from rasterio.transform import Affine
from rasterio.features import shapes as raster_shapes
from shapely.geometry import box,shape,mapping
from shapely.ops import unary_union,transform as geom_transform
import porto,richfield,benchmark_10m_all as contract
def write(p,v):
    p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2,allow_nan=False),encoding='utf-8')
def sha(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def label(path):return np.asarray(Image.open(path)).astype(np.uint8)
def metrics(ref,pred,valid,classes):
    conf=np.zeros((classes,classes+1),np.int64)
    eligible=(ref!=255)&valid;present=(pred!=255)&valid;common=eligible&present
    np.add.at(conf,(ref[common],pred[common]),1)
    conf[:,-1]=np.bincount(ref[eligible&~present],minlength=classes)
    out={'eligible_foreground':int(eligible.sum()),'predicted_foreground':int(present.sum()),'correct':int((common&(ref==pred)).sum()),'missing_foreground':int((eligible&~present).sum()),'incorrect_class_on_source':int((common&(ref!=pred)).sum()),'predicted_on_source_background':int((present&~eligible).sum()),'confusion_with_missing_column':conf.tolist(),'classes':{}}
    sums={k:0 for k in ['intersection','union','predicted','reference']}
    for k in range(classes):
        a=(ref==k)&valid;b=(pred==k)&valid
        inter=int((a&b).sum());union=int((a|b).sum());p=int(b.sum());r=int(a.sum())
        s={'intersection':inter,'union':union,'predicted':p,'reference':r,'iou':inter/union if union else None,'precision':inter/p if p else None,'recall':inter/r if r else None,'false_positive':p-inter,'false_negative':r-inter}
        out['classes'][str(k)]=s
        for key in sums:sums[key]+=s[key]
    out['micro']={**sums,'iou':sums['intersection']/sums['union'] if sums['union'] else None,'precision':sums['intersection']/sums['predicted'] if sums['predicted'] else None,'recall':sums['intersection']/sums['reference'] if sums['reference'] else None}
    assert out['correct']+out['missing_foreground']+out['incorrect_class_on_source']==out['eligible_foreground']
    return out
def score_porto(meta):
    hazard=meta['hazard'];name=meta['name'];rgb=porto.figure(meta['page']);aff=porto.fit_ticks(rgb)
    yy,xx,_=porto.map_domain(rgb,aff);ref=contract.reference_grid(hazard)
    blocks=np.array([[int.from_bytes(hashlib.sha256(f'{x}:{y}'.encode()).digest()[:4],'big')%5==0 for x in range(13)] for y in range(14)])
    test=blocks[np.arange(contract.H)[:,None]//300,np.arange(contract.W)[None,:]//300]
    oldbench=json.loads((ROOT/'outputs'/'porto-all-10m'/'benchmark.json').read_text())['hazards'][hazard]['methods']['loam']
    result={'reference_sha256':sha(porto.INPUT/f'arvc_off_risk_{hazard}_2050.png'),'affine':aff,'methods':{}}
    for method,folder in [('previous',OLD),('mode0',HERE)]:
        src=np.full(rgb.shape[:2],-1,np.int16);lab=label(folder/'predictions'/name/'labels.png').astype(np.int16);lab[lab==255]=-1
        src[yy,xx]=lab[yy,xx];grid=contract.sample(src,aff)
        target=HERE/'evaluation'/'porto'/hazard/(method+'-10m.tif');target.parent.mkdir(parents=True,exist_ok=True)
        contract.save_grid(target,grid)
        scores={s:contract.scores(ref,grid,mask) for s,mask in [('all',np.ones(ref.shape,bool)),('test',test)]}
        for s in scores:
            assert scores[s]['eligible']==oldbench[s]['eligible'],(hazard,s,'eligible mismatch')
            if method=='previous':
                diffs={}
                for key,v in scores[s].items():
                    saved=oldbench[s][key]
                    if isinstance(v,float):
                        assert np.isclose(v,saved,rtol=1e-13,atol=1e-15),(hazard,s,key,v,saved)
                        if v!=saved:diffs[key]={'recomputed':v,'saved':saved,'delta':v-saved}
                    else:assert v==saved,(hazard,s,key,v,saved)
                result.setdefault('prior_float_rounding_differences',{})[s]=diffs
            scores[s]['incorrect_present']=scores[s]['common']-scores[s]['correct']
            assert scores[s]['correct']+scores[s]['incorrect_present']+scores[s]['missing']==scores[s]['eligible']
        result['methods'][method]={**scores,'output':str(target),'sha256':sha(target)}
        if method=='previous':
            with rasterio.open(ROOT/'outputs'/'porto-all-10m'/hazard/'loam.tif') as ds:
                previous=ds.read(1).astype(np.int16);previous[previous==255]=-1
                assert np.array_equal(grid,previous),(hazard,'previous grid mismatch')
            result['prior_grid_exactly_equal']=True
        del src,lab,grid;gc.collect()
    result['test_delta_percentage_points']={k:result['methods']['mode0']['test'][k]-result['methods']['previous']['test'][k] for k in ['exact_all_pct','missing_pct','exact_common_pct','high_recall_pct']}
    return result
def rich_grid(geo):
    bounds=richfield.project(box(*geo['page_frame']),geo).bounds
    x0=math.floor(bounds[0]/10)*10;y1=math.ceil(bounds[3]/10)*10
    w=math.ceil((bounds[2]-x0)/10);h=math.ceil((y1-bounds[1])/10)
    a=Affine(10,0,x0,0,-10,y1)
    xx,yy=np.meshgrid(x0+(np.arange(w)+.5)*10,y1-(np.arange(h)+.5)*10)
    inv=np.linalg.inv(np.array([geo['E'][:2],geo['N'][:2]]));off=np.array([geo['E'][2],geo['N'][2]])
    px=inv[0,0]*(xx-off[0])+inv[0,1]*(yy-off[1]);py=inv[1,0]*(xx-off[0])+inv[1,1]*(yy-off[1])
    frame=box(*geo['page_frame']);valid=shapely.contains_xy(frame,px,py)
    return a,px,py,valid
def sample_page(lab,scale,px,py,valid):
    sx=np.floor(px*scale).astype(int);sy=np.floor(py*scale).astype(int)
    keep=valid&(sx>=0)&(sx<lab.shape[1])&(sy>=0)&(sy<lab.shape[0])
    out=np.full(px.shape,255,np.uint8);out[keep]=lab[sy[keep],sx[keep]];return out
def save_tif(path,arr,aff):
    with rasterio.open(path,'w',driver='GTiff',height=arr.shape[0],width=arr.shape[1],count=1,dtype='uint8',crs='EPSG:26915',transform=aff,nodata=255,compress='deflate',tiled=True) as ds:
        ds.write(arr,1);ds.update_tags(sampling='10m center nearest source-render pixel, GeoPDF affine; 255=no predicted polygon. Reference255=source background, not unknown hazard truth.',scope='document-source fidelity only')
    with rasterio.open(path) as ds:assert ds.res==(10.,10.) and np.array_equal(arr,ds.read(1))
def score_richfield(meta):
    name=meta['name'];layer=meta['layer'];scale=meta.get('render_pixels_per_point',1)
    with pymupdf.open(richfield.PDF) as doc:
        page=doc[meta['page']-1];geo=richfield.georeference(doc,page)
        colors=next(c for pn,n,c in richfield.LAYERS if n==layer)
        geoms,counts,overlap=richfield.source_shapes(page,colors,lambda s:s.startswith('Inundation_') or s=='Prioritization Scores')
    aff,px,py,valid=rich_grid(geo);ref10=np.full(px.shape,255,np.uint8)
    for k,g in enumerate(geoms.values()):ref10[valid&shapely.contains_xy(g,px,py)]=k
    dest=HERE/'evaluation'/'richfield'/name;dest.mkdir(parents=True,exist_ok=True)
    save_tif(dest/'source-10m.tif',ref10,aff)
    frame_geom=box(*geo['page_frame']);result={'source_pdf_sha256':sha(richfield.PDF),'source_path_counts':counts,'source_overlap_pt2_before_draw_order':overlap,'geo':geo,'source_dpi':72*scale,'methods':{},'reference':'Direct PDF f/fs geometry with clipping and draw order, source fidelity only; background is known absence of this PDF layer, not independent flood truth.'}
    for method,folder,source_name,s in [('previous72',OLD,'richfield-'+layer,1),('mode0',HERE,name,scale)]:
        lab=label(folder/'predictions'/source_name/'labels.png');h,w=lab.shape
        pred10=sample_page(lab,s,px,py,valid);save_tif(dest/(method+'-10m.tif'),pred10,aff)
        frame=richfield.mask_geometry(frame_geom,w,h,s);ref=np.full((h,w),255,np.uint8)
        for k,g in enumerate(geoms.values()):
            ref[richfield.mask_geometry(g,w,h,s)&frame]=k
        Image.fromarray(ref).save(dest/(method+'-source-at-input-resolution.png'))
        pix=metrics(ref,lab,frame,len(geoms));grid=metrics(ref10,pred10,valid,len(geoms))
        cont={};features=[]
        for k,(class_name,g) in enumerate(geoms.items()):
            pred=(lab==k)&frame
            pieces=[shapely.make_valid(shape(geometry)) for geometry,v in raster_shapes(pred.astype(np.uint8),mask=pred,transform=Affine(1/s,0,0,0,1/s,0))]
            model=unary_union(pieces).intersection(frame_geom);source=g.intersection(frame_geom)
            inter=model.intersection(source).area;union=model.union(source).area
            cont[class_name]={'intersection_pt2':inter,'union_pt2':union,'predicted_pt2':model.area,'reference_pt2':source.area,'iou':inter/union if union else None,'precision':inter/model.area if model.area else None,'recall':inter/source.area if source.area else None}
            if method=='mode0' and not model.is_empty:
                utm=richfield.project(model,geo);ll=geom_transform(richfield.LL.transform,utm)
                features.append({'type':'Feature','properties':{'class_index':k,'class':class_name,'method':'LOAM mode0','source_dpi':72*s},'geometry':mapping(ll)})
        total={key:sum(v[key] for v in cont.values()) for key in ['intersection_pt2','union_pt2','predicted_pt2','reference_pt2']}
        total.update(iou=total['intersection_pt2']/total['union_pt2'] if total['union_pt2'] else None,precision=total['intersection_pt2']/total['predicted_pt2'] if total['predicted_pt2'] else None,recall=total['intersection_pt2']/total['reference_pt2'] if total['reference_pt2'] else None)
        result['methods'][method]={'input_dpi':72*s,'source_pixel_centers':pix,'grid10m':grid,'continuous_page_geometry':{'classes':cont,'micro':total},'output10m':str(dest/(method+'-10m.tif'))}
        if method=='mode0':write(dest/'prediction.geojson',{'type':'FeatureCollection','provenance':{'geo':geo,'scope':'mask pixels registered by embedded source GeoPDF'},'features':features})
        del ref,frame,lab,pred10;gc.collect()
    result['same10m_micro_iou_delta_percentage_points']=100*(result['methods']['mode0']['grid10m']['micro']['iou']-result['methods']['previous72']['grid10m']['micro']['iou'])
    result['same_input_resolution_comparison']=scale==1
    return result
def main():
    start=time.perf_counter();manifest=json.loads((HERE/'input-manifest.json').read_text())
    prior=json.loads((HERE/'metrics.json').read_text()) if (HERE/'metrics.json').exists() else {'porto':{},'richfield':{},'richfield72_controls':{}}
    result={**prior,'method':'LOAM mode0 canonical1024 CUDA FP32','config':json.loads((HERE/'frozen-config.json').read_text()),'contract_script_sha256':sha(ROOT/'benchmark_10m_all.py'),'reference_boundaries':['Porto same-author numerical PNG derivatives, unauthenticated TIFF provenance','10m samples repeat roughly30m native raster information','Retrospective existing3km test blocks, not blind','Richfield direct source PDF f/fs fidelity, not hazard truth'],'uncompleted':[]}
    for m in manifest:
        if not (HERE/'predictions'/m['name']/'complete.json').exists():result['uncompleted'].append(m['name']);continue
        group='porto' if m['family']=='porto' else ('richfield72_controls' if m.get('control') else 'richfield')
        if m['name'] in result[group]:continue
        print('EVALUATE',m['name'],flush=True)
        result[group][m['name']]=score_porto(m) if m['family']=='porto' else score_richfield(m)
        write(HERE/'metrics.json',result)
    rows=list(result['porto'].values())
    result['porto_macro_test']={method:{k:float(np.mean([r['methods'][method]['test'][k] for r in rows])) for k in ['exact_all_pct','exact_common_pct','missing_pct','mae','bias','high_recall_pct']} for method in ['previous','mode0']} if rows else {}
    result['porto_pooled_test']={}
    for method in ['previous','mode0']:
        fields=['eligible','common','correct','missing','incorrect_present','predicted','predicted_without_reference','high_reference','high_true_positive','high_predicted_common']
        totals={key:sum(r['methods'][method]['test'][key] for r in rows) for key in fields}
        if totals['eligible']:totals.update(exact_all_pct=100*totals['correct']/totals['eligible'],missing_pct=100*totals['missing']/totals['eligible'])
        result['porto_pooled_test'][method]=totals
    result['evaluation_seconds_this_invocation']=time.perf_counter()-start
    write(HERE/'metrics.json',result);print('METRICS_SAVED',result['porto_macro_test'],flush=True)
if __name__=='__main__':main()
