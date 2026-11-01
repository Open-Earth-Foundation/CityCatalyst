"""Descriptive rebenchmark of the delivered 100m heat layer; never tune recovery."""
import hashlib
import json
import numpy as np
from PIL import Image
from pyproj import Transformer
from porto import ROOT, INPUT, OUT, E0, N1, digest, write_json
from benchmark import reference, metrics


def cell_ids(e,n,size):
    nx = int(38000/size)
    x = np.floor((np.asarray(e)-E0)/size).astype(int)
    y = np.floor((N1-np.asarray(n))/size).astype(int)
    assert np.all((x>=0)&(x<nx)&(y>=0))
    return y*nx+x


def test_cells(ids,size):
    nx = int(38000/size)
    span = int(3000/size)
    return np.array([int.from_bytes(hashlib.sha256(f'{(int(k)%nx)//span}:{(int(k)//nx)//span}'.encode()).digest()[:4],'big')%5==0 for k in ids])


def source_pixels():
    manifest = json.loads((INPUT/'arvc-manifest.json').read_text(encoding='utf-8'))
    assert 'EPSG:3857' in manifest['provenance']['encoding']['format']
    entry = manifest['layers']['arvc_off_risk_heat_2050']
    im = Image.open(INPUT/'arvc_off_risk_heat_2050.png')
    alpha = im.info.get('transparency')
    assert im.mode=='P' and (alpha==255 or (isinstance(alpha,bytes) and alpha==bytes([255])*255+bytes([0])))
    idx = np.asarray(im)
    y,x = np.where(idx!=255)
    (s,w),(n,e) = entry['bounds']
    merc = Transformer.from_crs(4326,3857,always_xy=True)
    xmin,ymin = merc.transform(w,s)
    xmax,ymax = merc.transform(e,n)
    e,n = Transformer.from_crs(3857,31982,always_xy=True).transform(xmin+(x+.5)*(xmax-xmin)/im.width,ymax-(y+.5)*(ymax-ymin)/im.height)
    return e,n,idx[y,x].astype(float)/254


def aggregate_reference(ids,values,threshold):
    counts = np.bincount(ids)
    sums = np.bincount(ids,weights=values)
    means = np.divide(sums,counts,out=np.full(len(counts),np.nan),where=counts>0)
    return {int(k):float(means[k]) for k in np.flatnonzero(counts>=threshold)}, counts


def score_arrays(truth,prediction):
    present = np.isfinite(prediction)
    a,b = truth[present],prediction[present]
    ca,cb = np.minimum((a*5).astype(int),4),np.minimum((b*5).astype(int),4)
    correct = int((ca==cb).sum())
    tp = int(((ca>=3)&(cb>=3)).sum())
    high = int((truth>=.6).sum())
    predicted_high = int((cb>=3).sum())
    return {'eligible':len(truth),'common':int(present.sum()),'missing':int((~present).sum()),
            'missing_pct':float(100*(~present).mean()),'exact_common_pct':100*correct/len(a),
            'exact_all_pct':100*correct/len(truth),'bias':float((b-a).mean()),
            'mae':float(abs(b-a).mean()),'high_reference_count':high,
            'high_true_positive_count':tp,'high_predicted_common_count':predicted_high,
            'high_recall_pct':100*tp/high if high else None,
            'high_precision_common_pct':100*tp/predicted_high if predicted_high else None}


def score_grid(ref,counts,pred,size,threshold,subset):
    rid = np.array(sorted(ref),dtype=int)
    pid = np.array(sorted(pred),dtype=int)
    if subset=='test':
        rid = rid[test_cells(rid,size)]
        pid = pid[test_cells(pid,size)]
    result = score_arrays(np.array([ref[int(k)] for k in rid]),np.array([pred.get(int(k),np.nan) for k in rid]))
    pc = np.array([counts[k] if k<len(counts) else 0 for k in pid])
    result.update(predicted_cells=len(pid),predicted_zero_reference_cells=int((pc==0).sum()),
                  predicted_zero_reference_pct=float(100*(pc==0).mean()),
                  predicted_low_reference_cells=int(((pc>0)&(pc<threshold)).sum()),
                  predicted_low_reference_pct=float(100*((pc>0)&(pc<threshold)).mean()))
    return result


def main():
    sample_ref,sample_counts = aggregate_reference(np.array([0,0,1]),np.array([0.,.8,.7]),2)
    assert sample_ref=={0:.4} and sample_counts.tolist()==[2,1]
    sample_score = score_arrays(np.array([.1,.7,.9]),np.array([.1,np.nan,.3]))
    assert sample_score['common']==2 and sample_score['missing']==1 and sample_score['high_recall_pct']==0
    e,n,truth = source_pixels()
    ids = {size:cell_ids(e,n,size) for size in (100,250)}
    # Geographic split must be identical at both resolutions, including block edges.
    assert np.array_equal(test_cells(ids[100],100),test_cells(ids[250],250))
    ee = np.array([E0+2999.9,E0+3000,E0+6000])
    nn = np.array([N1-2999.9,N1-3000,N1-6000])
    assert np.array_equal(test_cells(cell_ids(ee,nn,100),100),test_cells(cell_ids(ee,nn,250),250))
    files = {100:OUT/'porto-experimental-100m/heat.geojson',250:OUT/'porto-experimental/heat.geojson'}
    preds = {size:{int(f['id']):f['properties']['value'] for f in json.loads(path.read_text(encoding='utf-8'))['features']} for size,path in files.items()}
    report = {'scope':'Porto Alegre heat only; existing 100m export, no parameter tuning or other hazards regenerated',
              'evaluation':'Descriptive rerun on previously observed hash-selected 3km test blocks; not a new blind test; no spatial buffer',
              'reference':'Same-author indexed numerical PNG derivative, original TIFF provenance unauthenticated; not ground survey truth',
              'eligibility':'100m: >=3 valid reference pixels, ceil(15*(100/250)^2); 250m: >=15. Sensitivity at 1 and 5 pixels for 100m.',
              'support_change':'PDF acceptance is >=3 recognized pixels at 100m versus >=8 at 250m; resolution and support both changed.',
              'inputs':{str(size):{'path':str(path),'sha256':digest(path)} for size,path in files.items()},
              'reference_png_sha256':digest(INPUT/'arvc_off_risk_heat_2050.png'),
              'manifest_sha256':digest(INPUT/'arvc-manifest.json'),'script_sha256':digest(__file__),
              'native_grid':{},'same_reference_pixels':{},'sensitivity_100m':{}}
    for size,threshold in [(100,3),(250,15)]:
        ref,counts = aggregate_reference(ids[size],truth,threshold)
        report['native_grid'][str(size)] = {part:score_grid(ref,counts,preds[size],size,threshold,part) for part in ['test','all']}
        if size==250:
            old_ref,old_counts = reference('heat')
            assert ref.keys()==old_ref.keys() and np.allclose(list(ref.values()),list(old_ref.values()),rtol=0,atol=1e-12)
            assert np.array_equal(counts,old_counts)
            old_score = metrics(old_ref,old_counts,preds[size],'test')
            stored = json.loads((OUT/'porto-benchmark.json').read_text(encoding='utf-8'))['hazards']['heat']['comparisons']['test']['experimental']
            for key in old_score:
                assert old_score[key] == stored[key], (key,old_score[key],stored[key])
                assert np.isclose(old_score[key],report['native_grid']['250']['test'][key]) if old_score[key] is not None else report['native_grid']['250']['test'][key] is None
    counts100 = np.bincount(ids[100])
    for threshold in (1,3,5):
        ref,counts = aggregate_reference(ids[100],truth,threshold)
        report['sensitivity_100m'][str(threshold)] = score_grid(ref,counts,preds[100],100,threshold,'test')
    # Identical reference locations, assessed at native raster detail, avoid comparing different denominators.
    use = test_cells(ids[100],100)&(counts100[ids[100]]>=3)
    predicted = {size:np.array([preds[size].get(int(k),np.nan) for k in ids[size][use]]) for size in (100,250)}
    common = np.isfinite(predicted[100])&np.isfinite(predicted[250])
    for size in (100,250):
        report['same_reference_pixels'][str(size)] = {'all_eligible_locations':score_arrays(truth[use],predicted[size]),
                'locations_predicted_by_both':score_arrays(truth[use][common],predicted[size][common])}
    assert report['same_reference_pixels']['100']['all_eligible_locations']['eligible']==report['same_reference_pixels']['250']['all_eligible_locations']['eligible']
    assert len(set(ids[100])) > len(set(ids[250]))
    report['checks']=['100m and 250m physical test-block membership identical, including edge cases',
                      '250m reference values/counts and all stored heat metrics reproduced',
                      'same-reference-location comparison shares identical denominator',
                      'input hashes recorded; original exports and recovery settings unchanged']
    write_json(OUT/'porto-100m-benchmark.json',report)
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
