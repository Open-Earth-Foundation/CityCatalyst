import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]))
import numpy as np
from porto import *
from benchmark import reference,metrics

CANDIDATES={'nearest15':('nearest',15,False),'nearest3':('nearest',3,False),'blend35_3':('blend35',3,False),
            'blend35_8':('blend35',8,False),'blend55_3':('blend55',3,False),'blend35_median3':('blend35',3,True)}
report={};cache=ROOT/'experiments/cache';cache.mkdir(exist_ok=True)
baseline=json.loads((INPUT/'arvc-poa.json').read_text(encoding='utf-8'))
for hazard,page in PAGES.items():
    print('Processing',hazard,flush=True)
    rgb=figure(page);aff=fit_ticks(rgb);yy,xx,ids=map_domain(rgb,aff);pixels=rgb[yy,xx].astype(np.float32)
    labels={};labels['nearest'],_=classify_nearest(pixels)
    labels['blend35'],_=classify_blended(pixels,.35)
    labels['blend55'],_=classify_blended(pixels,.55)
    np.savez_compressed(cache/(hazard+'.npz'),ids=ids,yy=yy,xx=xx,**labels)
    write_json(cache/(hazard+'-affine.json'),aff)
    ref,counts=reference(hazard)
    ship={int(k):v for k,v in baseline['hazards'][hazard+'_risk_2050'].items()}
    report[hazard]={'baseline':{part:metrics(ref,counts,ship,part,jvp=True) for part in ['development','validation']}}
    for name,(lab,n,med) in CANDIDATES.items():
        values,support=aggregate(ids,labels[lab],n,med)
        write_json(cache/(hazard+'-'+name+'.json'),{'values':values,'support':support})
        report[hazard][name]={part:metrics(ref,counts,values,part) for part in ['development','validation']}
        m=report[hazard][name]['validation']
        print(name,'validation correct/all',round(m['exact_all_pct'],2),'missing',round(m['missing_pct'],2),'MAE',round(m['mae'],3),'zero-ref',round(m['predicted_zero_reference_pct'],2),flush=True)
write_json(ROOT/'experiments/deterministic-development.json',report)
summary={name:{key:float(np.mean([report[h][name]['validation'][key] for h in PAGES])) for key in ['exact_all_pct','missing_pct','mae','predicted_zero_reference_pct']} for name in ['baseline',*CANDIDATES]}
write_json(ROOT/'experiments/deterministic-validation-summary.json',summary)
print(json.dumps(summary,indent=2),flush=True)
