"""Evaluation-only stage. Frozen predictions are mandatory before reading references."""
import sys, json, hashlib, datetime, csv, importlib.metadata, platform, time, re
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
sys.path.insert(0,str(ROOT))
import numpy as np
from PIL import Image
import rasterio
from rasterio.transform import Affine
from rasterio.features import rasterize
from scipy.ndimage import binary_erosion,distance_transform_edt
from shapely.geometry import shape
from shapely.ops import transform
import porto,richfield

def save(p,x):
    p.parent.mkdir(exist_ok=True,parents=True)
    p.write_text(json.dumps(x,indent=2,ensure_ascii=False,allow_nan=False),encoding='utf-8')

def digest(p):
    with open(p,'rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def porto_metrics(ref,counts,pred,subset=None):
    import benchmark
    r={k:v for k,v in ref.items() if subset is None or benchmark.split(k)==subset}
    p={k:v for k,v in pred.items() if subset is None or benchmark.split(k)==subset}
    common=sorted(r.keys() & p.keys())
    a=np.array([r[k] for k in common]);b=np.array([p[k] for k in common])
    ca=np.minimum(np.floor(a*5).astype(int),4);cb=np.minimum(np.floor(b*5).astype(int),4)
    correct=int((ca==cb).sum());high_tp=int(((ca>=3)&(cb>=3)).sum())
    high_total=sum(v>=.6 for v in r.values());pred_high=int((cb>=3).sum())
    z=sum(k>=len(counts) or counts[k]==0 for k in p)
    low=sum(k<len(counts) and 0<counts[k]<15 for k in p)
    confusion=np.zeros((5,6),dtype=np.int64)
    for k,v in r.items():confusion[min(int(v*5),4),min(int(p[k]*5),4) if k in p else 5]+=1
    pct=lambda n,d:100*n/d if d else None
    m={'eligible':len(r),'common':len(common),'missing':len(r)-len(common),'correct':correct,
       'missing_pct':pct(len(r)-len(common),len(r)),'exact_common_pct':pct(correct,len(common)),
       'exact_all_pct':pct(correct,len(r)),'bias':float((b-a).mean()) if len(a) else None,
       'mae':float(abs(b-a).mean()) if len(a) else None,
       'sum_error':float((b-a).sum()),'sum_abs_error':float(abs(b-a).sum()),
       'high_true_positive_cells':high_tp,'high_reference_cells':high_total,
       'predicted_high_common_cells':pred_high,'high_recall_pct':pct(high_tp,high_total),
       'high_precision_common_pct':pct(high_tp,pred_high),'predicted_cells':len(p),
       'predicted_zero_reference_cells':int(z),'predicted_zero_reference_pct':pct(z,len(p)),
       'predicted_low_reference_cells':int(low),'predicted_low_reference_pct':pct(low,len(p)),
       'confusion_matrix_with_missing':confusion.tolist(),
       'confusion_axes':{'rows':'reference classes 0,1,2,3,4','columns':'predicted classes 0,1,2,3,4,missing'}}
    if common:
        existing=benchmark.metrics(ref,counts,pred,subset=subset)
        for k,v in existing.items():
            if v is None:assert m[k] is None
            else:assert abs(m[k]-v)<1e-9,(k,m[k],v)
    return m

def edge_metrics(a,b,spacing):
    ae=a&~binary_erosion(a);be=b&~binary_erosion(b)
    if not ae.any() or not be.any():
        return {'status':'undefined_empty_boundary','predicted_edge_pixels':int(ae.sum()),'reference_edge_pixels':int(be.sum())}
    ab=distance_transform_edt(~be,sampling=spacing)[ae]
    ba=distance_transform_edt(~ae,sampling=spacing)[be]
    d=np.r_[ab,ba]
    return {'status':'succeeded','predicted_edge_pixels':len(ab),'reference_edge_pixels':len(ba),
            'mean_symmetric_m':float(d.mean()),'median_m':float(np.median(d)),
            'p95_m':float(np.percentile(d,95)),'max_m':float(d.max()),
            'prediction_to_reference_mean_m':float(ab.mean()),'reference_to_prediction_mean_m':float(ba.mean()),
            'tolerance_2_pixels_m':float(max(spacing)*2),'symmetric_within_2_pixels_pct':float((d<=max(spacing)*2).mean()*100)}

def overlap_metrics(pred,ref,spacing):
    tp=int((pred&ref).sum());fp=int((pred&~ref).sum());fn=int((~pred&ref).sum())
    return {'true_positive_pixels':tp,'false_positive_pixels':fp,'false_negative_pixels':fn,
            'predicted_pixels':tp+fp,'reference_pixels':tp+fn,'union_pixels':tp+fp+fn,
            'iou':tp/(tp+fp+fn) if tp+fp+fn else None,
            'precision':tp/(tp+fp) if tp+fp else None,'recall':tp/(tp+fn) if tp+fn else None,
            'edge_errors':edge_metrics(pred,ref,spacing)}

def geotiff(path,labels,aff,crs):
    with rasterio.open(path,'w',driver='GTiff',height=labels.shape[0],width=labels.shape[1],count=1,
        dtype='uint8',crs=crs,transform=aff,compress='deflate',nodata=0) as ds:ds.write(labels,1)

def main():
    start=time.perf_counter();cfg=json.loads((HERE/'frozen-config.json').read_text(encoding='utf-8'))
    sha=digest(HERE/'frozen-config.json');assert sha==(HERE/'frozen-config.sha256').read_text().strip()
    # First inspect the entire run inventory, before any numeric reference loads.
    inventory={}
    for l in cfg['layers']:
        p=HERE/'predictions'/l['id']/'run.json'
        inventory[l['id']]=json.loads(p.read_text()) if p.exists() else {'status':'not attempted','reason':'No completed model run artifact'}
        if p.exists():assert inventory[l['id']]['config_sha256']==sha
    out=HERE/'evaluation';out.mkdir(exist_ok=True)
    result={'method':cfg['model'],'config_sha256':sha,'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'evaluation_contract':{'porto':'250m grid, >=15 reference pixels, >=3 predicted pixels, literal .2-wide classes; missing unsuccessful',
         'richfield':'source fill fidelity only, full GeoPDF frame at 2 px/point; recovered f and fs vectors, no independent hazard truth',
         'reference_provenance':'same-author numeric PNG derivatives; not authenticated original TIFFs','blind_test':False,
        'references_used_for_training_or_inference':False},
        'model_provenance':{k:cfg[k] for k in ['model_revision','pipeline_revision','checkpoint_url','checkpoint_sha256','device','precision','cpu_threads','batch_size']},
        'pipeline_scope':'CPU-adapted pretrained segmentation core with unchanged upstream UNet; not the stock CUDA CLI or automatic end-to-end georeferencing/legend/export pipeline. Public checkpoint identity is pinned; equivalence to golden_muscat-0.3.ckpt is unverified.',
        'source_aids':{'legend_crops':'manually located source swatch interiors','georeference':'reused source tick/GeoPDF transforms; not predicted by model',
           'layout':'known document map frame for evaluation; whole input figure/page inferred'},
        'layers':{},'porto_pooled':{}}
    records=[]
    for l in cfg['layers']:
        key=l['id'];run=inventory[key];entry={'status':run['status'],'page':l['page'],'run':run};result['layers'][key]=entry
        if run['status']!='succeeded':continue
        dst=out/key;dst.mkdir(exist_ok=True)
        labels=np.array(Image.open(HERE/'predictions'/key/'labels.png'))
        assert digest(HERE/'predictions'/key/'labels.png')==run['labels_sha256']
        if l['dataset']=='porto':
            rgb=np.array(Image.open(HERE/'sources'/key/'map.png'));aff=l['affine']
            yy,xx,ids=porto.map_domain(rgb,aff)
            vals,support=porto.aggregate(ids,labels[yy,xx].astype(np.int16)-1,support=3)
            for v in support.values():v['status']='estimated_from_pretrained_model_legend_masks'
            porto.export_cells(dst/'cells-250m.geojson',l['hazard'],vals,support,{
              'method':cfg['model'],'config_sha256':sha,'affine':aff,'minimum_recognized_pixels':3,
              'model_georeferencing':False,'source_legend_assistance':True,'reference_used':False})
            save(dst/'predicted-cells.json',vals)
            geotiff(dst/'labels-georeferenced.tif',labels,Affine(aff['mx'],0,aff['bx']-aff['mx']/2,0,aff['my'],aff['by']-aff['my']/2),'EPSG:31982')
            # Only now read reference values, after predicted geodata have been frozen.
            import benchmark
            ref,counts=benchmark.reference(l['hazard'],min_pixels=15)
            metrics={s:porto_metrics(ref,counts,vals,None if s=='all' else s) for s in ['all','development','validation','test']}
            entry['metrics']=metrics
            entry['municipal_source_pixels']=len(ids);entry['municipal_recognized_pixels']=int((labels[yy,xx]>0).sum())
            rows=[]
            for k in sorted(set(ref)|set(vals)):
                r=ref.get(k);p=vals.get(k)
                rows.append({'cell_id':k,'fold':benchmark.split(k),'reference_valid_pixels':int(counts[k]) if k<len(counts) else 0,
                  'reference_value':r,'prediction_value':p,'reference_class':min(int(r*5),4) if r is not None else None,
                  'prediction_class':min(int(p*5),4) if p is not None else None,
                  'predicted_support':support.get(k,{}).get('recognized_pixels',0)})
            with open(dst/'cells.csv','w',newline='',encoding='utf-8') as f:
                writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
            records.append(metrics)
            print(key,json.dumps(metrics['all']),flush=True)
        else:
            geo=l['geo'];s=l['render_scale'];h,w=labels.shape
            source_path=ROOT/'outputs/richfield'/(l['name']+'.geojson')
            source=json.loads(source_path.read_text(encoding='utf-8'))
            inv=np.linalg.inv(np.array([geo['E'][:2],geo['N'][:2]]));off=np.array([geo['E'][2],geo['N'][2]])
            def to_page(x,y,z=None):
                a=inv@np.array([np.asarray(x)-off[0],np.asarray(y)-off[1]]);return a[0],a[1]
            polys={f['properties']['class']:transform(to_page,transform(richfield.UTM.transform,shape(f['geometry']))) for f in source['features']}
            xmin,ymin,xmax,ymax=geo['page_frame']
            frame=((np.arange(h)[:,None]+.5)/s>=ymin)&((np.arange(h)[:,None]+.5)/s<ymax)&((np.arange(w)[None,:]+.5)/s>=xmin)&((np.arange(w)[None,:]+.5)/s<xmax)
            spacing=(geo['scale_m_per_point'][1]/s,geo['scale_m_per_point'][0]/s)
            truth=np.zeros_like(labels);classes={}
            for leg in l['legends']:
                k=leg['index'];ref=rasterize([(polys[leg['label']],1)],out_shape=(h,w),transform=Affine.scale(1/s),fill=0,dtype='uint8').astype(bool)&frame
                truth[ref]=k;prediction=(labels==k)&frame
                classes[leg['label']]=overlap_metrics(prediction,ref,spacing)
            Image.fromarray(truth).save(dst/'source-fill-labels.png')
            entry['classes']=classes;entry['foreground_union']=overlap_metrics((labels>0)&frame,truth>0,spacing)
            entry['macro_class_iou']=float(np.mean([c['iou'] for c in classes.values()]))
            entry['evaluated_pixels']=int(frame.sum());entry['unknown_frame_pixels']=int(((labels==0)&frame).sum())
            entry['source_vector_sha256']=digest(source_path)
            v=json.loads((ROOT/'outputs/richfield/validation.json').read_text())['layers'][l['name']]
            entry['source_path_counts']=v['source_paths']
            assert set(v['source_paths']).issubset({'f','fs'})
            a,b,c=geo['E'];d,e,f=geo['N']
            geotiff(dst/'labels-georeferenced.tif',labels,Affine(a/s,b/s,c,d/s,e/s,f),'EPSG:26915')
            print(key,json.dumps({'macro_class_iou':entry['macro_class_iou'],'union_iou':entry['foreground_union']['iou'],'paths':entry['source_path_counts']}),flush=True)
        save(dst/'metrics.json',entry)
    for subset in ['all','development','validation','test']:
        ms=[x[subset] for x in records]
        sums={k:sum(m[k] for m in ms) for k in ['eligible','common','missing','correct','sum_error','sum_abs_error','high_true_positive_cells','high_reference_cells','predicted_high_common_cells','predicted_cells','predicted_zero_reference_cells','predicted_low_reference_cells']}
        ratio=lambda a,b:100*sums[a]/sums[b] if sums[b] else None
        sums.update(exact_common_pct=ratio('correct','common'),exact_all_pct=ratio('correct','eligible'),missing_pct=ratio('missing','eligible'),
          bias=sums['sum_error']/sums['common'] if sums['common'] else None,mae=sums['sum_abs_error']/sums['common'] if sums['common'] else None,
          high_recall_pct=ratio('high_true_positive_cells','high_reference_cells'),high_precision_common_pct=ratio('high_true_positive_cells','predicted_high_common_cells'),
          predicted_zero_reference_pct=ratio('predicted_zero_reference_cells','predicted_cells'),predicted_low_reference_pct=ratio('predicted_low_reference_cells','predicted_cells'))
        sums['confusion_matrix_with_missing']=np.sum([np.array(x['confusion_matrix_with_missing']) for x in ms],axis=0).tolist()
        result['porto_pooled'][subset]=sums
    install_phases=[]
    for file in ['install.log','install-lightning.log']:
        content=(HERE/'logs'/file).read_text(encoding='utf-8-sig')
        for phase,number,unit in re.findall(r'(Resolved|Prepared|Installed).*? in ([0-9.]+)(ms|s)',content):
            install_phases.append({'log':file,'phase':phase,'seconds':float(number)/(1000 if unit=='ms' else 1)})
    result['runtime']={'dependency_installation_tool_reported_seconds':sum(x['seconds'] for x in install_phases),
        'dependency_installation_phases':install_phases,'dependency_installation_timing_note':'Sum of uv-reported resolution, preparation/download, and installation phases; not a combined stopwatch measurement.',
        'inference_seconds_total':sum(v.get('seconds',0) for v in inventory.values()),'evaluation_seconds':time.perf_counter()-start,
        'model_forward_calls':sum(v.get('model_forward_calls',0) for v in inventory.values())}
    result['scope']={s:sum(v['status']==s for v in inventory.values()) for s in ['succeeded','failed','not attempted']}
    save(HERE/'metrics.json',result)
    save(HERE/'versions.json',{'python':sys.version,'platform':platform.platform(),'packages':{d.metadata['Name']:d.version for d in importlib.metadata.distributions()}})
    print('SAVED',HERE/'metrics.json',flush=True)

if __name__=='__main__':main()
