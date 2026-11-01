"""Aligned, source-derived evidence images. No generative editing."""
import sys,json,base64,io,html,re
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT))
import porto,pymupdf
import numpy as np
from PIL import Image
PREVIEW_IMAGES=[]

def uri(im):
    b=io.BytesIO();im.save(b,format='PNG');return 'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()
def painted(labels,colours):
    out=np.zeros((*labels.shape,4),np.uint8)
    for k,c in enumerate(colours):out[labels==k]=[*c,255]
    return Image.fromarray(out)
def save_panel(name,source,model,title,note,section):
    d=HERE/'evidence';d.mkdir(exist_ok=True)
    source.save(d/f'{name}-original.png');model.save(d/f'{name}-model-transparent.png')
    only=Image.new('RGBA',model.size,(160,165,170,255));only.alpha_composite(model);only.convert('RGB').save(d/f'{name}-model.png')
    overlay=model.copy();overlay.putalpha(overlay.getchannel('A').point(lambda x:round(x*.65)))
    combined=source.convert('RGBA');combined.alpha_composite(overlay);combined.convert('RGB').save(d/f'{name}-overlay.png')
    PREVIEW_IMAGES.extend([d/f'{name}-original.png',d/f'{name}-model-transparent.png',d/f'{name}-model.png'])
    return f'''<section><h2>{html.escape(title)}</h2><p>{html.escape(note)}</p><div class="tools"><label>Model opacity <input aria-label="{html.escape(title)} model opacity" type="range" min="0" max="1" step="0.05" value="0.65" oninput="document.getElementById('{section}').style.opacity=this.value"></label><button onclick="document.getElementById('{section}').style.opacity=0">Original only</button><button onclick="document.getElementById('{section}').style.opacity=0.65">Overlay</button></div><div class="map"><img alt="Original source map" src="{uri(source)}"><img id="{section}" class="model" alt="Aligned LOAM predicted mask" src="{uri(model)}" style="opacity:.65"></div><details><summary>Model only (gray = unknown)</summary><img class="only" alt="LOAM model only" src="{uri(only)}"></details></section>'''

def main():
    parts=[];metadata={};d=HERE/'evidence';d.mkdir(exist_ok=True)
    chart=d/'porto-test-coverage.png'
    if chart.exists():
        chart_im=Image.open(chart)
        parts.append(f'<section><img class="only" alt="Porto correct-present, wrong-present and missing percentages on the existing test blocks" src="{uri(chart_im)}"></section>')
        PREVIEW_IMAGES.append(chart)
    heat=HERE/'predictions'/'porto-heat'/'labels.png'
    if heat.exists():
        rgb=porto.figure(100);aff=porto.fit_ticks(rgb);y,x=divmod(21547,porto.NX)
        ec=porto.E0+(x+.5)*porto.CELL;nc=porto.N1-(y+.5)*porto.CELL
        rect=(int((ec-1500-aff['bx'])/aff['mx']),int((nc+875-aff['by'])/aff['my']),int(np.ceil((ec+1500-aff['bx'])/aff['mx'])),int(np.ceil((nc-875-aff['by'])/aff['my'])))
        source=Image.fromarray(rgb).crop(rect);model=painted(np.asarray(Image.open(heat)),porto.RAMP.astype(int).tolist()).crop(rect)
        count=int((np.asarray(model)[:,:,3]>0).sum());total=source.width*source.height
        parts.append(save_panel('porto-heat-fragment',source,model,'Porto Alegre · heat',f'Same 3 km × 1.75 km fragment around cell 21547 as make_fine_overlay.py. LOAM predicts {count:,} of {total:,} pixels here. Both layers share native source pixels; unknown output is transparent. Model-only gray means unknown.','heat-model'))
        full=painted(np.asarray(Image.open(heat)),porto.RAMP.astype(int).tolist());full.save(d/'porto-heat-full-model-transparent.png')
        fullonly=Image.new('RGBA',full.size,(160,165,170,255));fullonly.alpha_composite(full);fullonly.convert('RGB').save(d/'porto-heat-full-model.png')
        Image.fromarray(rgb).save(d/'porto-heat-full-original.png')
        metadata['porto_heat']={'source_crop_xyxy':rect,'source_resolution':'native embedded figure','display_scale':'same for both layers','numeric_reference_used':False,'predicted_pixels_in_crop':count,'crop_pixels':total}
    rich=HERE/'predictions'/'richfield-inundation-100yr'/'labels.png'
    if rich.exists():
        with pymupdf.open(ROOT/'inputs'/'Richfield_FloodRiskPrioritization.pdf') as doc:
            pix=doc[16].get_pixmap(matrix=pymupdf.Matrix(3,3),clip=pymupdf.Rect(280,285,600,465),alpha=False)
            source=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        model=painted(np.asarray(Image.open(rich)),[[0,230,180]]).crop((280,285,600,465)).resize(source.size,Image.Resampling.NEAREST)
        rc=int((np.asarray(model)[:,:,3]>0).sum())
        parts.append(save_panel('richfield-wood-lake',source,model,'Richfield · 100-year inundation',f'The Wood Lake crop from make_visuals.py (page points 280,285–600,465). LOAM predicts {rc:,} displayed pixels here. Teal = model mask, enlarged from 72 DPI with nearest-neighbor sampling; original PDF rendered at 216 DPI. GeoPDF registration is unchanged.','rich-model'))
        metadata['richfield']={'source_crop_points':[280,285,600,465],'source_render_pixels_per_point':3,'model_native_pixels_per_point':1,'model_enlargement':'nearest neighbor 3x','numeric_reference_used':False,'predicted_display_pixels':rc}
    if not parts:parts=['<p>No complete focus-layer inference output is available. See report.md and logs.</p>']
    page='''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px/1.5 var(--font-sans,system-ui);color:var(--foreground,#20252b);margin:0}h2{font-size:20px;margin:20px 0 6px}p{color:var(--muted-foreground,#52606d);margin:6px 0 12px}.map{position:relative;width:100%;line-height:0}.map img,.only{width:100%;image-rendering:pixelated}.model{position:absolute;inset:0}.tools{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:12px 0}button{font:inherit;padding:5px 9px;border:1px solid var(--border,#aaa);border-radius:5px;background:var(--secondary,#eee);color:inherit}button:focus-visible,input:focus-visible{outline:3px solid var(--ring,#4099ee)}details{margin:12px 0}section{margin-bottom:24px}</style></head><body>'''+''.join(parts)+'''<p>Research trial of the official LOAM checkpoint, with disclosed CPU strip tiling and trade-off 6 preprocessing. These views show source reconstruction, not independent hazard validation. See metrics.json for full-map scores and coverage.</p></body></html>'''
    (HERE/'overlay.html').write_text(page,encoding='utf-8')
    images=iter(PREVIEW_IMAGES)
    preview=re.sub(r'src="data:image/png;base64,[^"]+"',lambda _:f'src="{next(images).as_posix()}"',page)
    (HERE/'overlay-preview.html').write_text(preview,encoding='utf-8')
    (HERE/'evidence'/'alignment.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    print('SAVED_OVERLAY',len(page),metadata)

if __name__=='__main__':main()
