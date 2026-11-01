"""Aligned, non-generative source/model evidence and standalone HTML."""
import sys,json,base64,io,html
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
sys.path.insert(0,str(ROOT))
import numpy as np
from PIL import Image,ImageDraw
import porto

def data(im):
    b=io.BytesIO();im.save(b,format='PNG');return 'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()

def main():
    cfg=json.loads((HERE/'frozen-config.json').read_text());metrics=json.loads((HERE/'metrics.json').read_text())
    out=HERE/'visuals';out.mkdir(exist_ok=True)
    panels=[];manifest={};local_images={}
    for key in ['porto-heat','richfield-inundation-100yr']:
        layer=next(l for l in cfg['layers'] if l['id']==key)
        src=Image.open(HERE/'sources'/key/'map.png').convert('RGB')
        labels=np.array(Image.open(HERE/'predictions'/key/'labels.png'))
        if key=='porto-heat':
            a=layer['affine'];y,x=divmod(21547,porto.NX)
            ec=porto.E0+(x+.5)*porto.CELL;nc=porto.N1-(y+.5)*porto.CELL
            box=[int((ec-1500-a['bx'])/a['mx']),int((nc+875-a['by'])/a['my']),
                 int(np.ceil((ec+1500-a['bx'])/a['mx'])),int(np.ceil((nc-875-a['by'])/a['my']))]
            palette=np.vstack([np.zeros((1,3)),porto.RAMP]).astype(np.uint8)
            title='Porto Alegre · heat'
            note='Same source fragment as make_fine_overlay.py. Native model mask; transparent areas are unknown. No reference-based masking.'
        else:
            box=[560,570,1200,930]
            palette=np.array([[0,0,0],[0,229,180]],np.uint8)
            title='Richfield · 100-year inundation · Wood Lake'
            note='Same PDF-point crop as make_visuals.py, rendered at 2 pixels/point. Teal is the model prediction; original blue is the PDF shading.'
        crop=src.crop(box);l=labels[box[1]:box[3],box[0]:box[2]]
        rgba=np.dstack([palette[l],(l>0).astype(np.uint8)*255]);overlay=Image.fromarray(rgba)
        crop.save(out/(key+'-original.png'));overlay.save(out/(key+'-model.png'))
        local_images[data(crop)]=(out/(key+'-original.png')).as_posix()
        local_images[data(overlay)]=(out/(key+'-model.png')).as_posix()
        alpha=overlay.copy();alpha.putalpha(Image.fromarray(((l>0)*150).astype(np.uint8)))
        blend=Image.alpha_composite(crop.convert('RGBA'),alpha);blend.save(out/(key+'-overlay.png'))
        # Whole-map evidence retains all input pixels including map furniture.
        full=Image.fromarray(palette[labels]);full.thumbnail((850,1000));full.save(out/(key+'-full-model.png'))
        base=src.copy();base.thumbnail((850,1000));base.save(out/(key+'-full-original.png'))
        manifest[key]={'crop_pixels':box,'crop_size':list(crop.size),'source_pixel_coordinates_unchanged':True,'model_unknown_transparent':True}
        w,h=crop.size
        panels.append(f'''<section><h3>{title}</h3><p>{note}</p>
<div class="map" style="aspect-ratio:{w}/{h}"><img id="{key}-source" src="{data(crop)}" alt="Source map fragment"><img id="{key}-mask" src="{data(overlay)}" alt="Aligned Golden-Muscat mask" style="opacity:.58"></div>
<div class="controls"><label>Model opacity <input aria-label="{title} model opacity" type="range" min="0" max="100" value="58" oninput="document.getElementById('{key}-source').style.opacity=1;document.getElementById('{key}-mask').style.opacity=this.value/100"></label>
<button onclick="document.getElementById('{key}-source').style.opacity=1;document.getElementById('{key}-mask').style.opacity=0;this.parentElement.querySelector('input').value=0">Original only</button>
<button onclick="document.getElementById('{key}-source').style.opacity=1;document.getElementById('{key}-mask').style.opacity=1;this.parentElement.querySelector('input').value=100">Overlay</button>
<button onclick="document.getElementById('{key}-source').style.opacity=0;document.getElementById('{key}-mask').style.opacity=1;this.parentElement.querySelector('input').value=100">Model only</button></div></section>''')
    (out/'alignment.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    bars=[]
    for l in cfg['layers']:
        if l['dataset']!='porto':continue
        m=metrics['layers'][l['id']]['metrics']['all'];v=m['exact_all_pct']
        bars.append(f'<div class="barrow"><span>{l["hazard"]}</span><div class="track"><div style="width:{v:.3f}%"></div></div><b>{v:.1f}%</b></div>')
    score='<section><h3>Porto · exact classes across all eligible cells</h3><p>Missing predictions count as unsuccessful. These are comparisons with same-author derivatives, not independently validated hazard accuracy.</p>'+''.join(bars)+'</section>'
    doc='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Golden-Muscat source/model evidence</title><style>
:root{--foreground:#e7ecf3;--muted-foreground:#a9b4c5;--card:#19212d;--border:#465166;--primary:#50c9b4;--radius:12px;--font-sans:system-ui,sans-serif}
body{font-family:var(--font-sans);color:var(--foreground);margin:0}section{margin:0 0 20px;padding:16px;background:var(--card);border-radius:var(--radius)}h3{margin:0 0 10px;font-size:18px}p{font-size:13px;line-height:1.5;color:var(--muted-foreground)}.map{position:relative;width:100%;overflow:hidden;background:#e0e0e0}.map img{position:absolute;width:100%;height:100%;image-rendering:pixelated}.controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:12px;font-size:12px}input{vertical-align:middle;max-width:180px}button{background:transparent;color:var(--foreground);border:1px solid var(--border);border-radius:6px;padding:6px;cursor:pointer}.barrow{display:grid;grid-template-columns:78px 1fr 55px;gap:12px;align-items:center;font-size:12px;margin:10px 0}.track{height:13px;background:var(--border);border-radius:3px;overflow:hidden}.track>div{height:13px;background:var(--primary)}b{text-align:right}
</style></head><body>'''+''.join(panels)+score+'</body></html>'
    (HERE/'overlay.html').write_text(doc,encoding='utf-8')
    preview=doc
    for encoded,path in local_images.items():preview=preview.replace(encoded,path)
    (HERE/'overlay-preview.html').write_text(preview,encoding='utf-8')
    print('Saved',HERE/'overlay.html')

if __name__=='__main__':main()
