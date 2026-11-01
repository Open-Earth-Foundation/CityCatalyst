"""Build new wrappers from inspected, read-only prior source aids; freeze protocol."""
import sys
sys.dont_write_bytecode=True
import json, hashlib, datetime, difflib
from pathlib import Path
HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'loam'
ROOT=HERE.parents[1]
if (HERE/'frozen-config.json').exists():
    raise SystemExit('Protocol already frozen: reuse existing setup; do not overwrite it.')
def sha(p):
    return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def save(name,data):
    (HERE/name).write_text(json.dumps(data,indent=2),encoding='utf-8')

src=(OLD/'prepare_inputs.py').read_text(encoding='utf-8')
new=src.replace('def main():','def main():\n    scale=2')
new=new.replace('matrix=pymupdf.Matrix(1,1)','matrix=pymupdf.Matrix(scale,scale)')
new=new.replace("r=max(boxes,key=lambda r:(r[2]-r[0])*(r[3]-r[1]))", "r=max(boxes,key=lambda r:(r[2]-r[0])*(r[3]-r[1]))\n                r=[v*scale for v in r]")
new=new.replace("x0,y0,x1,y1=geo['page_frame']", "x0,y0,x1,y1=[v*scale for v in geo['page_frame']]")
new=new.replace("'render_pixels_per_point':1", "'render_pixels_per_point':scale")
new=new.replace("    write(HERE/'input-manifest.json',items)", """    # Secondary control: reuse exact previous 72 DPI source/legend/bounds read-only.
    import shutil
    old=HERE.parent/'loam'
    prior=json.loads((old/'input-manifest.json').read_text(encoding='utf-8'))
    for m in prior:
        if m['family']!='richfield':continue
        m=dict(m);m['name']=m['name']+'-72dpi-control';m['control']=True
        original=m['name'].removesuffix('-72dpi-control')
        for suffix in ['.tif','.json','-bound.json']:
            shutil.copyfile(old/'inputs'/(original+suffix),out/(m['name']+suffix))
        items.append(m)
    # Run priority complete maps first, then complete the remaining eight.
    priority=['porto-heat','porto-flood','richfield-inundation-100yr']
    items.sort(key=lambda m:priority.index(m['name']) if m['name'] in priority else 3)
    write(HERE/'input-manifest.json',items)""")
(HERE/'prepare_inputs.py').write_text(new,encoding='utf-8')
(HERE/'evidence'/'prepare-adaptation.diff').write_text(''.join(difflib.unified_diff(src.splitlines(True),new.splitlines(True),fromfile='previous/prepare_inputs.py',tofile='new/prepare_inputs.py')),encoding='utf-8')
src=(OLD/'preprocess.py').read_text(encoding='utf-8')
new=src.replace("HERE/'upstream'", "HERE.parent/'loam'/'upstream'").replace('default=6','default=0')
new=new.replace("return [self.fn(*copy.deepcopy(arg)) for arg in self.args]", "\n        results=[]\n        for arg in self.args:\n            results.append(self.fn(*copy.deepcopy(arg)))\n        return results")
(HERE/'preprocess.py').write_text(new,encoding='utf-8')
(HERE/'evidence'/'preprocess-adaptation.diff').write_text(''.join(difflib.unified_diff(src.splitlines(True),new.splitlines(True),fromfile='previous/preprocess.py',tofile='new/preprocess.py')),encoding='utf-8')
files=[ROOT/'benchmark_10m_all.py',ROOT/'porto.py',ROOT/'richfield.py',OLD/'checkpoint_epoch14.pth',OLD/'report.md',OLD/'input-manifest.json']
files+=list((OLD/'upstream').rglob('*.py'))
save('read-only-input-hashes.json',{str(p):sha(p) for p in files})
config={
 'frozen_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'upstream_revision':'8176ace4f1d5af56baa8d3bd8481c7ed8cccf048',
 'checkpoint_sha256':sha(OLD/'checkpoint_epoch14.pth'),
 'mode':0,'mode_evidence':'Pinned README: 0 highest accuracy, 6 highest efficiency; source enables recoloring at <=1 and step5/text matching at <=0.',
 'channels':['v7','v4v','c0_x','c1_x','blackregion','overall_boundary_candidate','rc_v0'],
 'preprocessing':'Unmodified upstream metadata_preprocessing; serial deep-copied Pool jobs, process-count override disabled only; source-derived manual bounds.',
 'network':'Unmodified original LOAM, 7 channels, 2 classes; strict original checkpoint load; eval; CUDA FP32; TF32 disabled; batch 1',
 'tiles_hw':[1024,1024],'stride_hw':[1024,1024],'padding':'zeros bottom/right, no shortened strips, no overlap, no resizing',
 'interface':'Use actual upstream bitmap worker at crop_size=1024 and BasicDataset.preprocess(scale=1); same-size bilinear decoder interpolation then two-class argmax.',
 'arbitration':'Highest float32 foreground softmax probability among accepted masks; strict > update in legend order, ties lower index; no accepted class=255 unknown',
 'porto_resolution':'Native embedded PDF figures, unchanged',
 'richfield_resolution_dpi':144,'richfield_control_dpi':72,'control':'Mode0 full-tile 72 DPI source inputs identical to previous mode6/strip trial; distinct from primary144DPI results.',
 'evaluation':'Import unchanged benchmark_10m_all.py sample/reference_grid/scores/save_grid; physical3km SHA256 blocks; reference!=255; literal .2/.4/.6/.8 classes; no averaging.',
 'richfield_reference':'Direct source PDF f/fs paths with clip/draw order, unchanged GeoPDF affine. Same-resolution source-center comparisons and 10m geospatial-center comparisons.',
 'reference_values_used_for_prediction_or_tuning':False,'retrospective_not_blind':True,
 'resource_policy':'No process multiplication; serial layers; own exclusive gpu.lock per inference process, removed in finally. No host configuration or other-process changes.',
 'predeclared_fallback':'If CUDA FP32 canonical tile OOM, diagnose memory; never silently shorten context/change mode. Any adaptation separately logged before scoring.'
}
save('frozen-config.json',config)
(HERE/'frozen-config.sha256').write_text(sha(HERE/'frozen-config.json')+'\n',encoding='utf-8')
print(json.dumps({'frozen_config_sha256':sha(HERE/'frozen-config.json'),'read_only_files':len(files)}))
