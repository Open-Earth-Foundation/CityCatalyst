"""Verify serialized outputs and evaluation denominators independently of exports."""
import sys,json,hashlib
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
sys.path.insert(0,str(ROOT))
import numpy as np
from PIL import Image
import rasterio
from shapely.geometry import shape
import porto

cfg=json.loads((HERE/'frozen-config.json').read_text());metrics=json.loads((HERE/'metrics.json').read_text())
checks=[]
for layer in cfg['layers']:
    key=layer['id'];entry=metrics['layers'][key]
    assert entry['status']=='succeeded',key
    p=HERE/'predictions'/key/'labels.png';labels=np.array(Image.open(p))
    assert hashlib.sha256(p.read_bytes()).hexdigest()==entry['run']['labels_sha256']
    assert labels.shape==tuple(reversed(layer['map_size']))
    assert int(labels.max())<=len(layer['legends'])
    assert len(list((HERE/'predictions'/key).glob('mask-*.png')))==len(layer['legends'])
    item={'id':key,'mask_shape_verified':list(labels.shape),'raw_legend_masks':len(layer['legends'])}
    with rasterio.open(HERE/'evaluation'/key/'labels-georeferenced.tif') as r:
        assert np.array_equal(r.read(1),labels)
        assert r.nodata==0
        if layer['dataset']=='porto':
            a=layer['affine'];assert np.allclose(r.xy(0,0),(a['bx'],a['by']),atol=1e-8)
        else:
            geo=layer['geo'];sample=np.array([.25,.25,1.]);xy=[np.dot(geo[k],sample) for k in ['E','N']]
            assert np.allclose(r.xy(0,0),xy,atol=1e-8)
        item['geotiff_pixels_and_pixel_center_registration_verified']=True
    if layer['dataset']=='porto':
        rgb=np.array(Image.open(HERE/'sources'/key/'map.png'));yy,xx,ids=porto.map_domain(rgb,layer['affine'])
        values=json.loads((HERE/'evaluation'/key/'cells-250m.geojson').read_text())['features']
        assert all(shape(f['geometry']).is_valid for f in values)
        sampled=values[::max(1,len(values)//25)]
        for f in sampled:
            l=labels[yy[ids==f['id']],xx[ids==f['id']]];l=l[l>0]
            assert len(l)>=3
            mean=float(np.mean((l.astype(float)-.5)/10))
            assert abs(mean-f['properties']['value'])<1e-12
            assert len(l)==f['properties']['recognized_pixels']
        item['independent_pixel_mean_checks']=len(sampled)
        for name,m in entry['metrics'].items():
            assert m['common']+m['missing']==m['eligible']
            assert abs(m['exact_all_pct']-100*m['correct']/m['eligible'])<1e-12
            cm=np.array(m['confusion_matrix_with_missing'])
            assert int(cm.sum())==m['eligible']
            assert int(np.trace(cm[:,:5]))==m['correct']
            assert int(cm[:,5].sum())==m['missing']
    else:
        for label,m in entry['classes'].items():
            assert m['true_positive_pixels']+m['false_negative_pixels']==m['reference_pixels']
            assert m['true_positive_pixels']+m['false_positive_pixels']==m['predicted_pixels']
            assert m['union_pixels']==m['true_positive_pixels']+m['false_positive_pixels']+m['false_negative_pixels']
        if layer['name']=='prioritization-score':assert entry['source_path_counts']=={'fs':474,'f':272}
        item['confusion_counts_verified']=True
    checks.append(item)
result={'passed':True,'layers_checked':len(checks),'checks':checks}
(HERE/'output-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
