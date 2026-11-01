"""Small aligned map fragments; all geometry and imagery come from the evidence files."""
import base64,io,json
import numpy as np
import pymupdf,shapely
from shapely.geometry import shape,box
from shapely.ops import transform,unary_union
from PIL import Image
from porto import ROOT,INPUT,OUT,figure,fit_ticks,PAGES,E0,N1,CELL,NX,RAMP
from richfield import georeference,UTM,parts

def data_image(im):
    b=io.BytesIO();im.save(b,format='PNG');return 'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()
def svgpath(g,xy):
    paths=[]
    for p in parts(g):
        for ring in [p.exterior,*p.interiors]:
            pts=[xy(x,y) for x,y in ring.coords]
            paths.append('M'+' L'.join(f'{x:.2f} {y:.2f}' for x,y in pts)+' Z')
    return ' '.join(paths)

doc=pymupdf.open(INPUT/'Richfield_FloodRiskPrioritization.pdf');page=doc[16];geo=georeference(doc,page)
clip=pymupdf.Rect(280,285,600,465);pix=page.get_pixmap(matrix=pymupdf.Matrix(3,3),clip=clip,alpha=False)
im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);(OUT/'visuals').mkdir(exist_ok=True);im.save(OUT/'visuals/richfield-source-fragment.png')
inverse=np.linalg.inv(np.array([geo['E'][:2],geo['N'][:2]]));offset=np.array([geo['E'][2],geo['N'][2]])
def to_page(x,y,z=None):
    a=inverse@np.array([np.asarray(x)-offset[0],np.asarray(y)-offset[1]]);return a[0],a[1]
rich={}
for key,path in [('old',INPUT/'richfield-flood-inundation-100yr.json'),('new',OUT/'richfield/inundation-100yr.geojson')]:
    data=json.loads(path.read_text(encoding='utf-8'))
    gs=[shapely.make_valid(transform(to_page,transform(UTM.transform,shape(f['geometry'])))) for f in data['features']]
    g=unary_union(gs).intersection(box(*clip));rich[key]=svgpath(g,lambda x,y:((x-clip.x0)*3,(y-clip.y0)*3))
rich_svg=f'''<svg viewBox="0 0 {im.width} {im.height}" role="img" aria-label="Richfield source PDF with aligned old or recovered polygon outlines"><image href="{data_image(im)}" width="{im.width}" height="{im.height}"/><path id="rich-old" d="{rich['old']}" fill="none" stroke="#ff6b00" stroke-width="2"/><path id="rich-new" d="{rich['new']}" fill="none" stroke="#00e5b4" stroke-width="2" style="display:none"/></svg>'''

# Same fragment as the earlier missing-cell walkthrough, with enough neighbouring context.
hazard='heat';rgb=figure(PAGES[hazard]);aff=fit_ticks(rgb);focus=21547;y,x=divmod(focus,NX)
ec=E0+(x+.5)*CELL;nc=N1-(y+.5)*CELL;radius=875
left=int((ec-1500-aff['bx'])/aff['mx']);right=int(np.ceil((ec+1500-aff['bx'])/aff['mx']))
top=int((nc+radius-aff['by'])/aff['my']);bottom=int(np.ceil((nc-radius-aff['by'])/aff['my']))
crop=Image.fromarray(rgb).crop((left,top,right,bottom));w,h=crop.size
crop.save(OUT/'visuals/porto-source-fragment.png')
old=json.loads((INPUT/'arvc-poa.json').read_text(encoding='utf-8'))
layers={'old':{int(k):v for k,v in old['hazards'][hazard+'_risk_2050'].items()}}
for name,folder in [('experimental','porto-experimental'),('native','porto-raster-source')]:
    data=json.loads((OUT/folder/(hazard+'.geojson')).read_text(encoding='utf-8'))
    layers[name]={f['id']:f['properties']['value'] for f in data['features']}
groups={}
for name,values in layers.items():
    rects=[]
    for k,v in values.items():
        gy,gx=divmod(k,NX);e=E0+gx*CELL;n=N1-gy*CELL
        px=(e-aff['bx'])/aff['mx']-left;py=(n-aff['by'])/aff['my']-top;pw=CELL/aff['mx'];ph=-CELL/aff['my']
        if px+pw<0 or py+ph<0 or px>w or py>h:continue
        cls=min(round(v*9)//2,4) if name=='old' else min(int(v*5),4);colour=RAMP[cls*2+1].astype(int)
        rects.append(f'<rect x="{px:.3f}" y="{py:.3f}" width="{pw:.3f}" height="{ph:.3f}" fill="rgb({colour[0]},{colour[1]},{colour[2]})" stroke="#555" stroke-width=".08"><title>Cell {k}: value {v:.3f}; class {cls+1}</title></rect>')
    groups[name]=''.join(rects)
porto_svg=f'''<svg viewBox="0 0 {w} {h}" role="img" aria-label="Porto Alegre heat map comparison on a shared 250 metre grid" style="image-rendering:pixelated"><rect width="{w}" height="{h}" fill="#d8dadd"/><image id="porto-source" href="{data_image(crop)}" width="{w}" height="{h}"/>'''+''.join(f'<g id="porto-{k}" style="display:none">{v}</g>' for k,v in groups.items())+'</svg>'

html='''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font:15px/1.5 var(--font-sans,system-ui);color:var(--foreground,#20252b)}h2{font-size:21px;margin:22px 0 8px}p{margin:8px 0;color:var(--muted-foreground,#52606d)}button{font:inherit;border:1px solid var(--border,#ccc);border-radius:7px;padding:7px 11px;background:var(--secondary,#eee);color:inherit;cursor:pointer}button[aria-pressed=true]{background:#125d78;color:white}button:focus-visible{outline:3px solid #ffa800}.buttons{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}svg{display:block;width:100%;max-height:520px;background:#ddd}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px 5px;text-align:left;border-bottom:1px solid var(--border,#ccc)}.note{padding:16px;background:var(--warning-surface,#fff4df);border-radius:8px}.small{font-size:13px}
</style></head><body>
<h2>Richfield: preserve the PDF’s geometry and coordinates</h2><p>100-year inundation, Wood Lake fragment · about 2.44 km across. Orange shows JVP’s shipped outlines; teal shows recovered PDF vectors. The blue flood shading is the original PDF in every view.</p>
<div class="buttons" id="rich-buttons"><button onclick="rich('source',this)" aria-pressed="false">Original PDF</button><button onclick="rich('old',this)" aria-pressed="true">JVP outlines</button><button onclick="rich('new',this)" aria-pressed="false">Recovered outlines</button></div>RICH_SVG
<p class="small">Placement uses the embedded GeoPDF coordinates. This is source reconstruction, not a validation of flood predictions.</p>
<h2>Porto Alegre: recovery improved, but extra coverage remains</h2><p>Heat map around cell 21547 · about 3 km across. Switch views to compare the same fragment. Blank output areas are gray; they do not mean low risk.</p>
<div class="buttons" id="porto-buttons"><button onclick="porto('source',this)" aria-pressed="true">Original PDF</button><button onclick="porto('old',this)" aria-pressed="false">JVP</button><button onclick="porto('experimental',this)" aria-pressed="false">Experimental recovery</button><button onclick="porto('native',this)" aria-pressed="false">Numerical source</button></div>PORTO_SVG
<p class="small">Output classes: <span style="color:#edb9a4">■</span> Very low · <span style="color:#fc9e7f">■</span> Low · <span style="color:#f4553e">■</span> Medium · <span style="color:#c21618">■</span> High · <span style="color:#66000d">■</span> Very high. Gray = no output. The PDF uses ten shades.</p>
<p id="porto-caption" class="small">Published figure, enlarged without smoothing. Source pixels are roughly 29 m; exported squares are 250 m aggregates.</p>
<h2>Held-out Porto blocks</h2><table><thead><tr><th>Metric</th><th>JVP</th><th>Trial</th></tr></thead><tbody><tr><td>Correct class and present / all eligible</td><td>63.2%</td><td>79.7%</td></tr><tr><td>Correct class / common cells</td><td>74.4%</td><td>80.4%</td></tr><tr><td>Missing eligible cells</td><td>15.5%</td><td>0.9%</td></tr><tr><td>Flood: emitted cells with empty reference</td><td>0.5%</td><td>9.8%</td></tr></tbody></table>
<p class="note">The trial is quarantined as research output. Its coverage gain comes with unsupported flood coverage. Prefer the numerical source route when available; its original TIFF provenance remains unverified.</p>
<p class="small">Six hazards averaged equally, on preselected spatial test blocks. Reference: same-author published raster derivatives. This retrospective evaluation has no spatial buffer.</p>
<script>
function active(id,b){document.querySelectorAll('#'+id+' button').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'))}
function rich(v,b){for(const k of ['old','new'])document.getElementById('rich-'+k).style.display=k===v?'':'none';active('rich-buttons',b)}
function porto(v,b){for(const k of ['old','experimental','native'])document.getElementById('porto-'+k).style.display=k===v?'':'none';document.getElementById('porto-source').style.display=v==='source'?'':'none';active('porto-buttons',b);document.getElementById('porto-caption').textContent=v==='experimental'?'Research only: jointly selected method failed coverage gates. This heat example does not represent the flood failure.':v==='native'?'Published indexed-PNG values aggregated to 250 m; this is the benchmark source itself, not an independently validated reconstruction.':'Same aligned fragment. Output cells summarize available source pixels; squares are not traced risk footprints.'}
console.log('Two aligned fragments; no map tiles or external services required.');
</script></body></html>'''.replace('RICH_SVG',rich_svg).replace('PORTO_SVG',porto_svg)
bench=json.loads((OUT/'porto-benchmark.json').read_text(encoding='utf-8'));avg=bench['test_macro_average']['experimental']
flood=bench['hazards']['flood']['comparisons']['test']['experimental']
for old,new in [('79.7%',f"{avg['exact_all_pct']:.1f}%"),('80.4%',f"{avg['exact_common_pct']:.1f}%"),('0.9%',f"{avg['missing_pct']:.1f}%"),('9.8%',f"{flood['predicted_zero_reference_pct']:.1f}%")]:html=html.replace(old,new)
html=html.replace('This retrospective evaluation has no spatial buffer.','This retrospective evaluation has no spatial buffer. A legend-filter bug was fixed after the initial test run; the settings were not reselected.')
(ROOT/'comparison.html').write_text(html,encoding='utf-8')
print('Saved comparison.html',len(html),'characters')
