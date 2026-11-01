"""Read-only source readiness and synthetic-only tests of the unchanged scorer."""
import sys
sys.dont_write_bytecode=True
import ast,datetime,hashlib,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];PROJECT=ROOT.parents[1];OLD=PROJECT/'model-trials/digmapper'
sys.path.insert(0,str(PROJECT))
import numpy as np
import pymupdf
from PIL import Image
import porto
from richfield import georeference

def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
    return h.hexdigest()
def write(name,data):
    path=ROOT/name
    assert not path.exists(),str(path)
    path.write_text(json.dumps(data,indent=2,allow_nan=False),encoding='utf-8')

manifest=json.loads((OLD/'inputs/manifest.json').read_text(encoding='utf-8'))
priority=['porto-heat','porto-flood','richfield-inundation-100yr']
layers=sorted(manifest['layers'],key=lambda x:priority.index(x['id']) if x['id'] in priority else 3)
rows=[]
with pymupdf.open(PROJECT/'inputs/Richfield_FloodRiskPrioritization.pdf') as doc:
    for layer in layers:
        start=time.monotonic();source_path=OLD/layer['source_image']
        source=Image.open(source_path).convert('RGB');arr=np.asarray(source)
        assert digest(source_path)==layer['source_image_sha256']
        assert list(source.size)==layer['size']
        if layer['dataset']=='porto':
            current=porto.figure(layer['page']);affine=porto.fit_ticks(current)
            assert np.array_equal(arr,current)
            for key in ['mx','bx','my','by']:assert abs(affine[key]-layer['source_affine'][key])<1e-9
        else:
            page=doc[layer['page']-1];pix=page.get_pixmap(matrix=pymupdf.Matrix(2,2),alpha=False)
            current=np.frombuffer(pix.samples,np.uint8).reshape(pix.height,pix.width,3)
            assert np.array_equal(arr,current)
            affine=georeference(doc,page)
        rows.append(dict(id=layer['id'],dataset=layer['dataset'],page_1based=layer['page'],size=layer['size'],
                         source_image=str(source_path),source_image_sha256=digest(source_path),
                         source_equals_fresh_pdf_pixels=True,source_transform=affine,
                         legend_image=str(OLD/layer['legend_image']),legend_image_sha256=digest(OLD/layer['legend_image']),
                         manual_aids_available=True,manual_aids_used_for_inference=False,
                         elapsed_s=round(time.monotonic()-start,3)))
        print('source_ready',layer['id'],layer['size'],flush=True)
        del current,arr,source
write('evidence/input-readiness.json',dict(created_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    python=sys.version,executable=sys.executable,reference_values_decoded=False,source_preparation_is_inference=False,layers=rows))

saved=json.loads((PROJECT/'outputs/porto-all-10m/benchmark.json').read_text(encoding='utf-8'))
assert digest(PROJECT/'benchmark_10m_all.py')==saved['script_sha256']
blocks=np.array([[int.from_bytes(hashlib.sha256(f'{x}:{y}'.encode()).digest()[:4],'big')%5==0 for x in range(13)] for y in range(14)],bool)
write('configs/evaluation-contract.json',dict(
    scorer_file=str(PROJECT/'benchmark_10m_all.py'),scorer_sha256=saved['script_sha256'],
    existing_benchmark_sha256=digest(PROJECT/'outputs/porto-all-10m/benchmark.json'),
    grid_m=10,shape=[4200,3800],origin=[462000,6692000],crs='EPSG:31982',
    reference_sampling='Reference native PNG pixel covering each 10 m cell centre via unchanged reference_grid(); no averaging',
    valid_reference='reference != 255',prediction_encoding='0..9 risk-bin index; -1 unknown; midpoint (step+0.5)/10',
    class_boundaries=[.2,.4,.6,.8],test_blocks_m=3000,test_blocks=blocks.astype(int).tolist(),
    test_block_rule="sha256(f'{x}:{y}').digest()[:4] big-endian % 5 == 0; 300 grid cells per physical block",
    source_resolution='approximately 30 m, varies by map; 10 m samples add no new source information',
    reference_provenance='same-author numerical PNG derivatives; authenticated original TIFF provenance unavailable',
    blind_test=False,retrospective=True,reference_values_used_for_inference=False,
    missing='eligible reference cell, prediction unknown; unsuccessful in exact_all only after completed inference',
    incorrect='common reference/prediction cell with unequal five-bin class; common - correct',
    unsupported_reference='present prediction where reference == 255; not automatically incorrect',
    zero_low_reference_coverage='separate diagnostic if inference exists; not evaluated in blocked trial',
    richfield_reference='Source-fidelity to direct PDF fill geometry including f and fs; not independent hazard truth. The supplied common 10 m script covers Porto only.',
    model_decoder=None,overlap_arbitration=None,model_support_threshold=None,
    absent_model_note='No TOPAZ output schema available; no arbitrary decoder/support rule invented'))

# Isolated synthetic array only: never calls reference_grid or reads reference PNG values.
ref=np.array([[0,51,102,153,204,255,254,255]],np.uint8)
pred=np.array([[0,2,4,-1,6,9,9,-1]],np.int16)
scorer_text=(PROJECT/'benchmark_10m_all.py').read_text(encoding='utf-8')
scorer_ast=ast.parse(scorer_text)
scorer_node=next(node for node in scorer_ast.body if isinstance(node,ast.FunctionDef) and node.name=='scores')
scope={'np':np}
exec(compile(ast.Module(body=[scorer_node],type_ignores=[]),str(PROJECT/'benchmark_10m_all.py'),'exec'),scope)
result=scope['scores'](ref,pred,np.ones(ref.shape,bool))
expected={'eligible':6,'common':5,'correct':4,'missing':1,'predicted':6,'predicted_without_reference':1,'high_reference':3,'high_true_positive':2,'high_predicted_common':2}
for key,value in expected.items():assert result[key]==value,(key,result[key],value)
assert result['common']-result['correct']==1
assert result['confusion'][3][5]==1
assert sum(map(sum,result['confusion']))==6
assert 'SIZE=10; W=3800; H=4200' in scorer_text
write('evidence/scorer-contract-validation.json',dict(status='passed',scope='Synthetic scorer invariant only; not an inference or real-data score',
    fixture_reference=ref.tolist(),fixture_predictions=pred.tolist(),expected=expected,actual=result,
    physical_test_block_count=int(blocks.sum()),reference_grid_called=False,
    execution='Unmodified scores() function extracted by AST to avoid an unavailable rasterio import; no GeoTIFF export or full benchmark execution claimed'))
print('unchanged_scorer_synthetic_contract_passed',flush=True)
