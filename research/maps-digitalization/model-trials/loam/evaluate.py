"""Evaluation-only process. Numeric references never enter preprocessing/inference."""
import sys,json,hashlib,time,platform,subprocess
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT))
import numpy as np
from PIL import Image
import porto,benchmark,richfield
import shapely
from shapely.geometry import shape,box,mapping
from shapely.ops import transform,unary_union
from scipy.ndimage import binary_erosion,distance_transform_edt

def write(path,v):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(v,indent=2,ensure_ascii=False,allow_nan=False),encoding='utf-8')
def digest(path):
    hh=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):hh.update(b)
    return hh.hexdigest()

def metric(ref,counts,pred,subset):
    r={k:v for k,v in ref.items() if subset is None or benchmark.split(k)==subset}
    p={k:v for k,v in pred.items() if subset is None or benchmark.split(k)==subset}
    common=sorted(r.keys()&p.keys());a=np.array([r[k] for k in common]);b=np.array([p[k] for k in common])
    ca=np.minimum(np.floor(a*5).astype(int),4);cb=np.minimum(np.floor(b*5).astype(int),4)
    correct=int((ca==cb).sum());tp=int(((ca>=3)&(cb>=3)).sum());rh=sum(v>=.6 for v in r.values());ph=int((cb>=3).sum())
    zero=[k for k in p if k>=len(counts) or counts[k]==0];low=[k for k in p if k<len(counts) and 0<counts[k]<15]
    out={'eligible':len(r),'common':len(common),'missing':len(r)-len(common),'correct_class_count':correct,
      'exact_common_pct':100*correct/len(common) if common else None,'exact_all_pct':100*correct/len(r) if r else None,
      'missing_pct':100*(len(r)-len(common))/len(r) if r else None,'bias':float((b-a).mean()) if common else None,'mae':float(abs(b-a).mean()) if common else None,
      'high_true_positive':tp,'high_reference_all_eligible':rh,'high_predicted_common':ph,'high_predicted_all_output':sum(v>=.6 for v in p.values()),
      'high_recall_pct':100*tp/rh if rh else None,'high_precision_common_pct':100*tp/ph if ph else None,
      'predicted_cells':len(p),'predicted_zero_reference_cells':len(zero),'predicted_low_reference_cells':len(low),
      'predicted_zero_reference_pct':100*len(zero)/len(p) if p else 0,'predicted_low_reference_pct':100*len(low)/len(p) if p else 0,
      'sum_error_common':float((b-a).sum()),'sum_abs_error_common':float(abs(b-a).sum())}
    if common:
        oracle=benchmark.metrics(ref,counts,pred,subset)
        for k,v in oracle.items():
            assert out[k] is None and v is None or np.isclose(out[k],v,rtol=1e-10,atol=1e-10),(k,out[k],v)
    return out

def eval_porto(meta):
    name=meta['name'];labels=np.asarray(Image.open(HERE/'predictions'/name/'labels.png'))
    rgb=porto.figure(meta['page']);aff=porto.fit_ticks(rgb)
    assert aff==meta['affine']
    y,x,ids=porto.map_domain(rgb,aff)
    steps=labels[y,x].astype(np.int16);steps[steps==255]=-1
    pred,support=porto.aggregate(ids,steps,support=3)
    provenance={'model':'LOAM pretrained epoch14, official trade_off=6, CPU strips 256x1024','affine':aff,'source':'source PDF only for prediction','minimum_predicted_pixels':3,'reference_used_for_inference':False,'release_status':'research_trial'}
    porto.export_cells(HERE/'evaluation'/'porto'/f'{meta["hazard"]}.geojson',meta['hazard'],pred,support,provenance)
    ref,counts=benchmark.reference(meta['hazard'],min_pixels=15)
    scores={s or 'all':metric(ref,counts,pred,s) for s in [None,'development','validation','test']}
    rows=[{'cell':k,'fold':benchmark.split(k),'reference':ref.get(k),'prediction':pred.get(k),'reference_pixels':int(counts[k]) if k<len(counts) else 0,'predicted_pixels':support.get(k,{}).get('recognized_pixels',0)} for k in sorted(ref.keys()|pred.keys())]
    write(HERE/'evaluation'/'porto'/f'{meta["hazard"]}-cells.json',rows)
    return {'scores':scores,'prediction_pixels_in_municipal_domain':int((steps>=0).sum()),'municipal_domain_pixels':len(steps),'registration':'unchanged source tick fit; no numeric reference registration','comparison_reference':'same-author indexed PNG derivatives, not independently authenticated TIFF truth'}

def edges(pred,ref,metres):
    a=pred&~binary_erosion(pred);b=ref&~binary_erosion(ref)
    if not a.any() or not b.any():return {'status':'undefined_empty_boundary','prediction_edge_pixels':int(a.sum()),'source_edge_pixels':int(b.sum())}
    da=distance_transform_edt(~b)[a];db=distance_transform_edt(~a)[b];both=np.r_[da,db]
    return {'method':'bidirectional raster boundary pixel-center distances, 72 DPI; label/stroke holes are part of model mismatch',
      'prediction_edge_pixels':len(da),'source_edge_pixels':len(db),'mean_points':float(both.mean()),'median_points':float(np.median(both)),'p95_points':float(np.percentile(both,95)),'max_points':float(both.max()),
      'mean_m':float(both.mean()*metres),'p95_m':float(np.percentile(both,95)*metres),'max_m':float(both.max()*metres),
      'prediction_to_source_mean_m':float(da.mean()*metres),'source_to_prediction_mean_m':float(db.mean()*metres)}

def eval_richfield(meta):
    name=meta['name'];layer=meta['layer'];labels=np.asarray(Image.open(HERE/'predictions'/name/'labels.png'));h,w=labels.shape
    path=ROOT/'outputs'/'richfield'/f'{layer}.geojson';data=json.loads(path.read_text(encoding='utf-8'));geo=data['provenance']['geo']
    audit=json.loads((ROOT/'outputs'/'richfield'/'validation.json').read_text())['layers'][layer]
    inverse=np.linalg.inv(np.array([geo['E'][:2],geo['N'][:2]]));offset=np.array([geo['E'][2],geo['N'][2]])
    def to_page(x,y,z=None):
        a=inverse@np.array([np.asarray(x)-offset[0],np.asarray(y)-offset[1]]);return a[0],a[1]
    frame=richfield.mask_geometry(box(*geo['page_frame']),w,h,1)
    source={f['properties']['class']:transform(to_page,transform(richfield.UTM.transform,shape(f['geometry']))) for f in data['features']}
    result={};metres=float(np.mean(geo['scale_m_per_point']));total={'intersection':0,'union':0,'predicted':0,'reference':0};features=[]
    dest=HERE/'evaluation'/'richfield'/layer;dest.mkdir(parents=True,exist_ok=True)
    for leg in meta['legends']:
        k=leg['index'];g=source[leg['label']];ref=richfield.mask_geometry(g,w,h,1)&frame;pred=(labels==k)&frame
        tp=int((ref&pred).sum());union=int((ref|pred).sum());pc=int(pred.sum());rc=int(ref.sum())
        total['intersection']+=tp;total['union']+=union;total['predicted']+=pc;total['reference']+=rc
        Image.fromarray(ref.astype(np.uint8)*255).save(dest/f'bin{k:02}-source-mask.png')
        from rasterio.features import shapes as raster_shapes
        page_polygons=[]
        for geom,value in raster_shapes(pred.astype(np.uint8),mask=pred):
            page_geom=shapely.make_valid(shape(geom)).intersection(box(*geo['page_frame']))
            page_polygons.append(page_geom)
            ll=transform(richfield.LL.transform,richfield.project(page_geom,geo))
            features.append({'type':'Feature','properties':{'class':leg['label'],'source_page':meta['page'],'pixel_size_points':1,'method':'LOAM model mask; source GeoPDF registration'},'geometry':mapping(ll)})
        result[leg['label']]={'intersection_pixels':tp,'union_pixels':union,'prediction_pixels':pc,'source_pixels':rc,'false_positive_pixels':pc-tp,'false_negative_pixels':rc-tp,
          'iou':tp/union if union else None,'precision':tp/pc if pc else None,'recall':tp/rc if rc else None,'edge_errors':edges(pred,ref,metres)}
        model_geometry=unary_union(page_polygons);source_geometry=g.intersection(box(*geo['page_frame']))
        area_inter=model_geometry.intersection(source_geometry).area
        area_union=model_geometry.union(source_geometry).area
        result[leg['label']]['continuous_page_geometry']={'intersection_pt2':area_inter,'union_pt2':area_union,'prediction_pt2':model_geometry.area,'source_pt2':source_geometry.area,
            'iou':area_inter/area_union if area_union else None,'precision':area_inter/model_geometry.area if model_geometry.area else None,'recall':area_inter/source_geometry.area if source_geometry.area else None,
            'note':'Exact Shapely area overlap of model pixel-square geometry with recovered PDF vector fills in page points; no reference rasterization for these area metrics.'}
    write(dest/'prediction.geojson',{'type':'FeatureCollection','provenance':{'model':'official LOAM epoch14','rasterization':'whole page 72 DPI; original source fills used only for evaluation','geo':geo},'features':features})
    continuous={k:sum(v['continuous_page_geometry'][k] for v in result.values()) for k in ['intersection_pt2','union_pt2','prediction_pt2','source_pt2']}
    continuous.update(iou=continuous['intersection_pt2']/continuous['union_pt2'] if continuous['union_pt2'] else None,precision=continuous['intersection_pt2']/continuous['prediction_pt2'] if continuous['prediction_pt2'] else None,recall=continuous['intersection_pt2']/continuous['source_pt2'] if continuous['source_pt2'] else None)
    return {'classes':result,'continuous_micro':continuous,'micro':{**total,'iou':total['intersection']/total['union'] if total['union'] else None,'precision':total['intersection']/total['predicted'] if total['predicted'] else None,'recall':total['intersection']/total['reference'] if total['reference'] else None},'source_path_counts':audit['source_paths'],
      'evaluation_frame_pixels':int(frame.sum()),'source_vector_sha256':digest(path),'pixel_metres':metres,'comparison_reference':'direct PDF f and fs fills, prior to labels and strokes; source fidelity, not flood truth','registration':'embedded GeoPDF transform, unchanged'}

def main():
    started=time.perf_counter();manifest=json.loads((HERE/'input-manifest.json').read_text());run=json.loads((HERE/'run-status.json').read_text())
    result={'method':'LOAM','availability':'official pretrained checkpoint downloaded; original network ran on CPU','upstream':{'url':'https://github.com/Fandel-Lin/LOAM','revision':'8176ace4f1d5af56baa8d3bd8481c7ed8cccf048'},'checkpoint':{'url':'https://drive.google.com/uc?id=1eqbLoJ2XkWBe9mlZ4hpttc9rFpYUXrGK','sha256':digest(HERE/'checkpoint_epoch14.pth'),'bytes':(HERE/'checkpoint_epoch14.pth').stat().st_size},'settings':json.loads((HERE/'frozen-settings.json').read_text()),'layers':{},'evaluation_is_blind':False}
    for meta in manifest:
        name=meta['name'];complete=HERE/'predictions'/name/'complete.json';st=run['layers'].get(name,{'status':'not attempted','reason':'sequential runner has not reached this layer'})
        if not complete.exists():result['layers'][name]={**st,'metrics':None};continue
        print('EVALUATING',name,flush=True)
        scores=eval_porto(meta) if meta['family']=='porto' else eval_richfield(meta)
        result['layers'][name]={'status':'succeeded','runtime':st,'inference':json.loads(complete.read_text()),'metrics':scores}
    ports=[x for name,x in result['layers'].items() if name.startswith('porto-') and x['status']=='succeeded']
    if ports:
        result['porto_completed_hazards']=len(ports)
        result['porto_macro_average']={s:{k:float(np.mean([v['metrics']['scores'][s][k] for v in ports if v['metrics']['scores'][s][k] is not None])) for k in ['exact_common_pct','exact_all_pct','missing_pct','mae','bias','high_recall_pct','high_precision_common_pct','predicted_zero_reference_pct','predicted_low_reference_pct'] if any(v['metrics']['scores'][s][k] is not None for v in ports)} for s in ['all','development','validation','test']}
        result['porto_macro_contributing_hazards']={s:{k:sum(v['metrics']['scores'][s][k] is not None for v in ports) for k in ['exact_common_pct','exact_all_pct','missing_pct','mae','bias','high_recall_pct','high_precision_common_pct','predicted_zero_reference_pct','predicted_low_reference_pct']} for s in ['all','development','validation','test']}
        result['porto_pooled']={}
        for s in ['all','development','validation','test']:
            fields=['eligible','common','missing','correct_class_count','high_true_positive','high_reference_all_eligible','high_predicted_common','predicted_cells','predicted_zero_reference_cells','predicted_low_reference_cells','sum_error_common','sum_abs_error_common']
            a={k:sum(v['metrics']['scores'][s][k] for v in ports) for k in fields}
            a.update(exact_all_pct=100*a['correct_class_count']/a['eligible'],exact_common_pct=100*a['correct_class_count']/a['common'] if a['common'] else None,mae=a['sum_abs_error_common']/a['common'] if a['common'] else None)
            result['porto_pooled'][s]=a
    result['evaluation_seconds']=time.perf_counter()-started
    completed=[x for x in result['layers'].values() if x['status']=='succeeded']
    result['execution_summary']={'completed_layers':len(completed),'requested_layers':len(manifest),'complete_model_queries':sum(len(x['inference']['classes']) for x in completed),'complete_network_tiles':sum(x['inference']['tiles'] for x in completed),
        'completed_class_compute_seconds':sum(x['inference']['class_seconds_total'] for x in completed),
        'resumed_run_stage_wall_seconds':sum(s['seconds'] for x in completed for s in x['runtime'].get('stages',[])),
        'sampled_peak_process_tree_mib':max([s.get('peak_rss_mb',0) for x in completed for s in x['runtime'].get('stages',[])]+[0]),
        'interrupted_first_attempt':'logs/attempt1; retained complete bins included in class time, abandoned partial work excluded from complete compute sum',
        'gpu_used':False,'numerical_reference_used_for_inference':False}
    write(HERE/'metrics.json',result)
    print('METRICS_SAVED',result.get('porto_macro_average',{}),flush=True)

if __name__=='__main__':main()
