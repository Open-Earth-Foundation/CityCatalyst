"""Exercise released preparation and prompt serialization; never request GPT inference."""
import sys
sys.dont_write_bytecode=True
import json, pathlib, time, shutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
from legend_icl.prepare import prepare
from legend_icl.inference import infer, load_record
from legend_icl.artifacts import verify
manifest=json.loads((ROOT/'inputs/manifest.json').read_text(encoding='utf-8'))
records={}; rows=[]
for layer in manifest['layers']:
    start=time.monotonic(); name=layer['id']
    # The upstream same_map guard compares source basenames; give each image its unique ID.
    source=ROOT/layer['source_image']; unique=source.with_name(name+'.png')
    shutil.copyfile(source, unique)
    record=prepare(unique,ROOT/'outputs/legend-prepared'/name,
                   crop=layer['legend_bbox_source_pixels'],map_id=name,replace=True)
    verify(record.parent); records[name]=record
    rows.append({'layer':name,'status':'succeeded','scope':'source preparation only',
                 'manual_crop':True,'record':str(record.relative_to(ROOT)),
                 'elapsed_s':round(time.monotonic()-start,3)})
    print(name,'prepared',flush=True)
# Five manually boxed printed risk legend categories, from Porto heat source only.
# These are example prompts, not target predictions or numeric benchmark labels.
boxes=[(38,75),(75,113),(113,151),(151,188),(188,225)]
annotation={'image_size':[270,405], 'pairs':[
    {'pair_id':str(i),'legend_item':[20,a,46,b],
     'description':[60,a,170,min(a+25,b)]} for i,(a,b) in enumerate(boxes)]}
annotation_path=ROOT/'inputs/heat-legend-example-manual.json'
annotation_path.write_text(json.dumps(annotation,indent=2),encoding='utf-8')
example_image=ROOT/'inputs/porto-heat/porto-heat-legend-example.png'
shutil.copyfile(ROOT/'inputs/porto-heat/legend-manual.png', example_image)
example_path=prepare(example_image,ROOT/'outputs/legend-example-five',annotation=annotation_path,
                     already_cropped=True,map_id='porto-heat-manual-example',replace=True)
example=load_record(example_path)
dryruns=[]
for name in ['porto-flood','richfield-inundation-100yr']:
    start=time.monotonic()
    result=infer(example,load_record(records[name]),ROOT/'outputs/legend-dry-run'/name,
                 number=5,seed=1337,dry_run=True,replace=True)
    verify(ROOT/'outputs/legend-dry-run'/name)
    dryruns.append({'layer':name,'status':result['status'],'example_count':5,
                    'model_requested':result['model_requested'],'model_called':False,
                    'predictions_produced':False,'elapsed_s':round(time.monotonic()-start,3)})
result={'preparation':rows,'dry_runs':dryruns,'paid_api_calls':0,'pretrained_inference_completed':False}
(ROOT/'outputs/offline-legend-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
