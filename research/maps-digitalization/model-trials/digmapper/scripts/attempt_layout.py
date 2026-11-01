"""Attempt the paper-linked local detector directly, without paid OCR stages."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import json, time, traceback
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'upstream/uncharted-ta1'))
layer=sys.argv[1]
start=time.monotonic()
source=ROOT/'inputs'/layer/'source.png'
im=Image.open(source).convert('RGB')
row={'layer':layer,'source':str(source),'size':list(im.size),'component':'LARA DetectronSegmenter',
     'full_digmapper':False,'device':'cpu','confidence_threshold':0.25,'predictions_produced':False}
try:
    from tasks.segmentation.detectron_segmenter import DetectronSegmenter
    from tasks.common.task import TaskInput
    model=DetectronSegmenter('segmenter',str(ROOT/'weights/layoutlmv3_20240925'),
                            str(ROOT/'outputs/layout-cache'),confidence_thres=0.25,gpu=False)
    task_input=TaskInput(task_index=0)
    task_input.raster_id=layer
    task_input.image=im
    result=model.run(task_input)
    row['status']='succeeded';row['predictions_produced']=True
    (ROOT/'outputs'/f'{layer}-layout.json').write_text(json.dumps(result.output,indent=2),encoding='utf-8')
except Exception as exc:
    row.update(status='failed',error=repr(exc),traceback=traceback.format_exc())
row['elapsed_s']=round(time.monotonic()-start,3)
(ROOT/'outputs'/f'{layer}-layout-attempt.json').write_text(json.dumps(row,indent=2),encoding='utf-8')
print(json.dumps(row,indent=2),flush=True)
raise SystemExit(0 if row['status']=='succeeded' else 1)
