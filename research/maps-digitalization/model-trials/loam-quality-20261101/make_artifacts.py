"""Source-aligned, non-generative focused overlays and honest comparison charts."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import json,io,base64,html
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];OLD=HERE.parent/'loam'
sys.path.insert(0,str(ROOT))
import numpy as np
from PIL import Image,ImageDraw,ImageFont
import porto,richfield
def uri(im):
    b=io.BytesIO();im.save(b,format='PNG');return 'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()
def paint(labels,colors):
    out=np.zeros((*labels.shape,4),np.uint8)
    for k,c in enumerate(colors):out[labels==k]=[*c,255]
    return Image.fromarray(out)
def overlay(source,model):
    a=model.copy();a.putalpha(a.getchannel('A').point(lambda x:round(x*.65)))
    im=source.convert('RGBA');im.alpha_composite(a);return im.convert('RGB')
def chart(metrics):
    import os
    os.environ['MPLCONFIGDIR']=str(HERE/'cache'/'matplotlib')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    rows=list(metrics['porto'].items());fig,axes=plt.subplots(1,2,figsize=(14,6.8),gridspec_kw={'width_ratios':[1.25,1]})
    for i,(name,r) in enumerate(rows):
        for delta,method,alpha in [(-.17,'previous',.45),(.17,'mode0',1.)]:
            s=r['methods'][method]['test'];values=[100*s[k]/s['eligible'] for k in ['correct','incorrect_present','missing']];left=0
            for j,(v,c) in enumerate(zip(values,['#14836b','#cf7537','#c6cbd1'])):
                axes[0].barh(i+delta,v,height=.29,left=left,color=c,alpha=alpha,label=['Correct present','Incorrect present','Missing'][j] if i==0 and method=='mode0' else None);left+=v
    axes[0].set_yticks(range(len(rows)),[n.removeprefix('porto-') for n,r in rows]);axes[0].invert_yaxis();axes[0].set_xlim(0,100);axes[0].set_xlabel('Percent of reference-eligible 10m test centers');axes[0].set_title('Porto | top pale: previous; bottom: mode0');axes[0].legend(loc='lower right',fontsize=8)
    rows=list(metrics['richfield'].items())
    for i,(name,r) in enumerate(rows):
        for delta,method,color in [(-.16,'previous72','#8b97a6'),(.16,'mode0','#2867ac')]:
            v=100*r['methods'][method]['grid10m']['micro']['iou'];axes[1].barh(i+delta,v,height=.28,color=color,label=('Previous 72 DPI' if method=='previous72' else 'Mode0 144 DPI') if i==0 else None)
    axes[1].set_yticks(range(len(rows)),[n.removeprefix('richfield-inundation-').removeprefix('richfield-') for n,r in rows]);axes[1].invert_yaxis();axes[1].set_xlim(0,100);axes[1].set_xlabel('Class-micro IoU at common 10m centers (%)');axes[1].set_title('Richfield | direct PDF source fidelity');axes[1].legend(loc='lower right',fontsize=8)
    fig.suptitle('LOAM original checkpoint: mode0, full 1024px tiles, CUDA FP32',fontsize=15)
    fig.text(.02,.015,'Retrospective Porto PNG derivatives; correlated 10m samples add no native detail. Richfield main comparison also changes render resolution.',fontsize=9)
    fig.tight_layout(rect=(0,.045,1,.95));fig.savefig(HERE/'evidence'/'quality-comparison.png',dpi=160);plt.close(fig)
def main():
    manifest=json.loads((HERE/'input-manifest.json').read_text());dest=HERE/'evidence';parts=[];alignment={}
    for m in manifest:
        if m.get('control'):continue
        name=m['name'];path=HERE/'predictions'/name/'labels.png'
        if not path.exists():continue
        source=Image.open(HERE/'inputs'/(name+'.tif')).convert('RGB');lab=np.asarray(Image.open(path));old=np.asarray(Image.open(OLD/'predictions'/name/'labels.png'))
        if m['family']=='porto':
            colors=porto.RAMP.astype(int).tolist();aff=m['affine'];row,col=divmod(21547,porto.NX)
            ec=porto.E0+(col+.5)*porto.CELL;nc=porto.N1-(row+.5)*porto.CELL
            rect=[int((ec-1500-aff['bx'])/aff['mx']),int((nc+875-aff['by'])/aff['my']),int(np.ceil((ec+1500-aff['bx'])/aff['mx'])),int(np.ceil((nc-875-aff['by'])/aff['my']))]
            note='Same fixed 3km x 1.75km physical fragment used by prior overlay; native source pixels. Unknown predictions are transparent.'
            display_scale=5
        else:
            colors=list(next(c for pn,n,c in richfield.LAYERS if n==m['layer']).values());rect=[560,570,1200,930];display_scale=1
            old=np.asarray(Image.fromarray(old).resize(source.size,Image.Resampling.NEAREST))
            note='Fixed Wood Lake fragment: PDF page points (280,285)-(600,465), rendered at144DPI. Previous72DPI mask enlarged nearest-neighbor2x for alignment only.'
        new_model=paint(lab,colors);old_model=paint(old,colors)
        s=source.crop(rect);n=new_model.crop(rect);o=old_model.crop(rect)
        assert s.size==n.size==o.size
        for suffix,im in [('original',s),('new-transparent',n),('previous-transparent',o),('new-overlay',overlay(s,n)),('previous-overlay',overlay(s,o))]:im.save(dest/f'{name}-focus-{suffix}.png')
        size=(s.width*display_scale,s.height*display_scale)
        views=[s,overlay(s,o),overlay(s,n)];panel=Image.new('RGB',(size[0]*3,size[1]+30),'white');draw=ImageDraw.Draw(panel)
        for i,(v,t) in enumerate(zip(views,['Original source','Previous mode6 / strips','New mode0 / full tiles'])):
            panel.paste(v.resize(size,Image.Resampling.NEAREST),(i*size[0],30));draw.text((i*size[0]+8,8),t,fill='black')
        panel.save(dest/f'{name}-focus-comparison.png')
        only=[]
        for suffix,model in [('previous',o),('new',n)]:
            base=Image.new('RGBA',model.size,(158,165,173,255));base.alpha_composite(model)
            im=base.convert('RGB');im.save(dest/f'{name}-focus-{suffix}-model-only.png');only.append(im)
        maskpanel=Image.new('RGB',(size[0]*3,size[1]+30),'white');dmask=ImageDraw.Draw(maskpanel)
        for i,(v,t) in enumerate(zip([s,*only],['Original source','Previous mask | gray = missing','New mode0 mask | gray = missing'])):
            maskpanel.paste(v.resize(size,Image.Resampling.NEAREST),(i*size[0],30));dmask.text((i*size[0]+8,8),t,fill='black')
        maskpanel.save(dest/f'{name}-focus-mask-comparison.png')
        full=overlay(source,new_model);full.save(dest/f'{name}-full-new-overlay.png')
        ident=name.replace('-','_')
        parts.append(f'''<section><h2>{html.escape(name)}</h2><p>{html.escape(note)}</p><div class="controls"><button onclick="pick('{ident}',0)">Original</button><button onclick="pick('{ident}',1)">Previous</button><button onclick="pick('{ident}',2)">New mode0</button><label>Opacity <input type="range" min="0" max="1" step=".05" value=".65" oninput="opacity('{ident}',this.value)"></label></div><div class="map" style="max-width:{max(600,size[0])}px"><img src="{uri(s)}" alt="Original source fragment"><img id="{ident}_old" class="layer" style="opacity:0" src="{uri(o)}" alt="Previous aligned mask"><img id="{ident}_new" class="layer" style="opacity:.65" src="{uri(n)}" alt="New aligned mode0 mask"></div></section>''')
        parts[-1]=parts[-1].replace('</section>',f'<details><summary>Source / previous / new masks only (gray means missing)</summary><img style="width:100%;image-rendering:pixelated" src="{uri(maskpanel)}" alt="Aligned source and masks, gray means no prediction"></details></section>')
        alignment[name]={'source_crop_xyxy':rect,'source_size':source.size,'new_mask_size':lab.shape[::-1],'previous_display_mask_size':old.shape[::-1],'focus_size':s.size,'note':note,'source_only_crop':True,'numeric_reference_used_for_prediction':False}
    (dest/'alignment.json').write_text(json.dumps(alignment,indent=2),encoding='utf-8')
    if (HERE/'metrics.json').exists():
        chart(json.loads((HERE/'metrics.json').read_text()));parts.insert(0,f'<img class="chart" src="{uri(Image.open(dest/"quality-comparison.png"))}" alt="Measured Porto and Richfield quality comparison">')
    page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOAM mode0 comparison</title><style>body{font:16px/1.5 system-ui;background:#f7f8fa;color:#18232f;margin:24px}main{max-width:1200px;margin:auto}section{background:white;padding:20px;margin:24px 0;border:1px solid #d4d9df}h1{font-size:26px}h2{font-size:20px}p{max-width:900px}.map{position:relative;line-height:0;width:100%}.map img{width:100%;image-rendering:pixelated}.layer{position:absolute;inset:0}.controls{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}button{padding:8px;border:1px solid #506070;background:white;border-radius:4px;font:inherit}button:focus-visible,input:focus-visible{outline:3px solid #2874c9}.chart{width:100%}</style><main><h1>LOAM mode0: original and aligned masks</h1><p>Original checkpoint, canonical1024 tiles, CUDA float32. Transparent means no accepted prediction. Same-author Porto PNG comparisons are retrospective; Richfield scores measure source-document fidelity. Ten-metre sampling adds no native detail.</p>'''+''.join(parts)+'''</main><script>const state={};function pick(id,n){state[id]=n;document.getElementById(id+'_old').style.opacity=n===1?.65:0;document.getElementById(id+'_new').style.opacity=n===2?.65:0}function opacity(id,v){const n=state[id]??2;document.getElementById(id+'_old').style.opacity=n===1?v:0;document.getElementById(id+'_new').style.opacity=n===2?v:0}</script></html>'''
    (HERE/'overlay.html').write_text(page,encoding='utf-8');print('ARTIFACTS',len(alignment),'aligned layers',flush=True)
if __name__=='__main__':main()
