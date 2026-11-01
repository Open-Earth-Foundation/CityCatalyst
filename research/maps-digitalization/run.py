"""Run the two document profiles; use --route to avoid regenerating unrelated artifacts."""
import argparse,json,hashlib,importlib.metadata,datetime
import numpy as np
from PIL import features
from porto import *
from benchmark import reference,metrics

def porto():
    baseline=json.loads((INPUT/'arvc-poa.json').read_text(encoding='utf-8'))
    selection=json.loads((ROOT/'SELECTION.json').read_text(encoding='utf-8'))
    report={'selection_sha256':digest(ROOT/'SELECTION.json'),'hazards':{},'reference_warning':'Same-author indexed PNG derivatives. Original TIFF provenance was not authenticated. Native ingestion is not scored against itself.'}
    for hazard,page in PAGES.items():
        rgb=figure(page);aff=fit_ticks(rgb);yy,xx,ids=map_domain(rgb,aff)
        labels,_=classify_blended(rgb[yy,xx].astype(np.float32),selection['configuration']['minimum_alpha'])
        vals,support=aggregate(ids,labels,selection['configuration']['recognized_pixel_minimum'])
        # A bin interval excludes classification error; explicitly avoid a confidence claim.
        for k,v in vals.items():
            support[k].update(value_lower=max(0,v-.05),value_upper=min(1,v+.05),interval_kind='palette quantization only, NOT confidence or classification uncertainty',release_status='research_only_failed_coverage_gate')
        prov={'method':'PDF colour mixing experiment; failed validation coverage gate; not recommended for decisions','source_pdf_sha256':digest(INPUT/'porto-alegre-arvc.pdf'),
          'page':page,'decoded_rgb_sha256':hashlib.sha256(rgb.tobytes()).hexdigest(),'decoder':'Pillow '+importlib.metadata.version('pillow')+'; libjpeg '+str(features.version_codec('jpg')),
          'affine':aff,'selection_sha256':report['selection_sha256'],'cell_geometry':'250m aggregation square, not a traced risk footprint'}
        export_cells(OUT/'porto-experimental'/(hazard+'.geojson'),hazard,vals,support,prov)
        totals=np.bincount(ids);recognized=np.bincount(ids[labels>=0],minlength=len(totals))
        write_json(OUT/'porto-experimental'/(hazard+'-missing.json'),{'note':'Absence means insufficient observed colour support; it does not identify source masking.',
          'cells':[{'id':int(k),'reason':'no_accepted_colour' if recognized[k]==0 else 'insufficient_accepted_pixels','accepted_pixels':int(recognized[k]),'municipal_pixels':int(totals[k])} for k in np.flatnonzero((totals>0)&(recognized<selection['configuration']['recognized_pixel_minimum']))]})
        raw={int(k):v for k,v in baseline['hazards'][hazard+'_risk_2050'].items()}
        corrected={k:float(.9*v+.05) for k,v in raw.items()}
        correction_meta={k:{'status':'existing_reconstruction_scale_corrected','value_lower':max(0,v-.05045),'value_upper':min(1,v+.05045),'interval_kind':'palette plus stored rounding only; classification/coverage uncertainty excluded'} for k,v in corrected.items()}
        export_cells(OUT/'porto-corrected-existing'/(hazard+'.geojson'),hazard,corrected,correction_meta,{'method':'Existing JVP reconstruction migrated to printed 0.1-bin midpoint scale; NOT new source recovery','input_sha256':digest(INPUT/'arvc-poa.json'),'missing_means':'Unknown: may be source mask OR extraction omission; never assume zero risk','cell_geometry':'250m aggregation square, not a risk footprint'})
        # Native route preserves every cell with >=1 numerical source pixel, including low-support edges.
        native,counts=reference(hazard,min_pixels=1)
        metadata={k:{'source_valid_pixels':int(counts[k]),'low_support':bool(counts[k]<15),'status':'aggregated_published_raster_derivative'} for k in native}
        target=OUT/'porto-raster-source'/(hazard+'.geojson')
        export_cells(target,hazard,native,metadata,{'method':'Numerical ingestion of published indexed PNG; value=index/254, 255=no-data, unweighted valid-pixel-centre mean in 250m cells','input_sha256':digest(INPUT/('arvc_off_risk_'+hazard+'_2050.png')),'manifest_sha256':digest(INPUT/'arvc-manifest.json'),'original_TIFF_authenticated':False,'cell_geometry':'250m aggregation square; preserve source PNG for ~29m detail; low-support edge cells flagged'})
        loaded=json.loads(target.read_text(encoding='utf-8'));assert {int(f['id']):f['properties']['value'] for f in loaded['features']}==native
        ref,_=reference(hazard)
        comparisons={}
        for part in ['validation','test',None]:
            comparisons[part or 'all_descriptive']={'jvp':metrics(ref,counts,raw,part,jvp=True),'scale_fix_only':metrics(ref,counts,corrected,part),'experimental':metrics(ref,counts,vals,part)}
        report['hazards'][hazard]={'comparisons':comparisons,'native_ingestion':{'cells':len(native),'low_support_cells':sum(counts[k]<15 for k in native).__int__(),'readback_values_identical':True},
          'eligibility_sensitivity_test':{str(n):metrics(reference(hazard,n)[0],counts,vals,'test') for n in [5,30]}}
        v=comparisons['validation'];base=v['jvp'];trial=v['experimental'];fixed=v['scale_fix_only']
        report['hazards'][hazard]['validation_gates']={
          'correct_all_gain_at_least_8pp':trial['exact_all_pct']-base['exact_all_pct']>=8,
          'missing_at_most_10pct':trial['missing_pct']<=10,
          'common_agreement_drop_at_most_1pp':trial['exact_common_pct']>=base['exact_common_pct']-1,
          'mae_better_than_scale_fix':trial['mae']<fixed['mae'],
          'empty_reference_increase_at_most_0_5pp':trial['predicted_zero_reference_pct']<=base['predicted_zero_reference_pct']+.5,
          'low_reference_increase_at_most_2pp':trial['predicted_low_reference_pct']<=base['predicted_low_reference_pct']+2,
          'high_recall_gain_at_least_10pp':trial['high_recall_pct'] is not None and base['high_recall_pct'] is not None and trial['high_recall_pct']>=base['high_recall_pct']+10,
          'high_precision_common_at_least_70pct':trial['high_precision_common_pct'] is not None and trial['high_precision_common_pct']>=70}
        print(hazard,'test',json.dumps(comparisons['test']),flush=True)
    names=['jvp','scale_fix_only','experimental']
    report['test_macro_average']={name:{key:float(np.mean([report['hazards'][h]['comparisons']['test'][name][key] for h in PAGES])) for key in ['exact_all_pct','exact_common_pct','missing_pct','mae','bias','predicted_zero_reference_pct']} for name in names}
    write_json(OUT/'porto-benchmark.json',report)
    write_json(OUT/'runtime.json',{'versions':{p:importlib.metadata.version(p) for p in ['numpy','scipy','pillow','shapely','pyproj','pymupdf']},'input_hashes':{p.name:digest(p) for p in INPUT.iterdir() if p.is_file()},'OpenRouter_budget_file':'../BUDGET.json'})
    print(json.dumps(report['test_macro_average'],indent=2),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--route',choices=['all','porto','richfield'],default='all');args=p.parse_args()
    manifest={'status':'running','route':args.route,'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'pipeline_hashes':{f:digest(ROOT/f) for f in ['porto.py','benchmark.py','richfield.py','run.py']},'selection_sha256':digest(ROOT/'SELECTION.json'),
      'input_hashes':{p.name:digest(p) for p in INPUT.iterdir() if p.is_file()}}
    write_json(OUT/'run-manifest.json',manifest)
    if args.route in ['all','richfield']:
        import richfield
        richfield.run()
    if args.route in ['all','porto']:porto()
    manifest.update(status='complete',finished_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),output_hashes={str(p.relative_to(OUT)):digest(p) for p in OUT.rglob('*') if p.is_file() and p.name!='run-manifest.json'})
    write_json(OUT/'run-manifest.json',manifest)
