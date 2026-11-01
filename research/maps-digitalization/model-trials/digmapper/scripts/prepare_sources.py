"""Source-only inputs and fixed overlay fragments. No reference values are read."""
import sys
sys.dont_write_bytecode = True
from pathlib import Path
import hashlib, json, time
ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[1]
sys.path.insert(0, str(PROJECT))
import numpy as np
import pymupdf
from PIL import Image
from porto import figure, fit_ticks, PAGES, E0, N1, CELL, NX
from richfield import LAYERS, georeference

def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
manifest = {'source_only': True, 'reference_values_read': False, 'manual_legend_crops': True,
            'layout_predictions_used': False, 'layers': [], 'source_pdfs': []}
for name in ('porto-alegre-arvc.pdf','Richfield_FloodRiskPrioritization.pdf'):
    p = PROJECT/'inputs'/name
    manifest['source_pdfs'].append({'path':str(p), 'sha256':digest(p)})
for hazard in ('heat','flood','landslide','drought','arbovirus','storm'):
    start=time.monotonic()
    im = Image.fromarray(figure(PAGES[hazard])); aff = fit_ticks(np.asarray(im))
    layer = 'porto-'+hazard
    folder=ROOT/'inputs'/layer; folder.mkdir(exist_ok=True)
    im.save(folder/'source.png')
    bbox=[round(v * (im.width/1213 if i%2==0 else im.height/1758))
          for i,v in enumerate([105,1040,375,1445])]
    im.crop(bbox).save(folder/'legend-manual.png')
    if hazard == 'heat':
        y,x=divmod(21547,NX); ec,nc=E0+(x+.5)*CELL,N1-(y+.5)*CELL
        crop=[int((ec-1500-aff['bx'])/aff['mx']),int((nc+875-aff['by'])/aff['my']),
              int(np.ceil((ec+1500-aff['bx'])/aff['mx'])),int(np.ceil((nc-875-aff['by'])/aff['my']))]
        im.crop(crop).save(ROOT/'outputs/porto-heat-source-fragment.png')
        manifest['porto_overlay_crop_source_pixels']=crop
    manifest['layers'].append({'id':layer,'dataset':'porto','layer':hazard,'page':PAGES[hazard],
        'source_image':str((folder/'source.png').relative_to(ROOT)), 'size':list(im.size),
        'source_image_sha256':digest(folder/'source.png'),'legend_bbox_source_pixels':bbox,
        'legend_image':str((folder/'legend-manual.png').relative_to(ROOT)),
        'source_affine':aff,'preparation_seconds':round(time.monotonic()-start,3)})
    print(layer, im.size, flush=True)
with pymupdf.open(PROJECT/'inputs/Richfield_FloodRiskPrioritization.pdf') as doc:
    ordered=sorted(LAYERS, key=lambda x: x[0]!=17)
    for page_no,name,colours in ordered:
        start=time.monotonic(); page=doc[page_no-1]
        pix=page.get_pixmap(matrix=pymupdf.Matrix(2,2),alpha=False)
        im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        layer='richfield-'+name; folder=ROOT/'inputs'/layer; folder.mkdir(exist_ok=True)
        im.save(folder/'source.png')
        bbox=[2062,36,2412,600]
        im.crop(bbox).save(folder/'legend-manual.png')
        if page_no==17:
            clip=pymupdf.Rect(280,285,600,465)
            page.get_pixmap(matrix=pymupdf.Matrix(3,3),clip=clip,alpha=False).save(ROOT/'outputs/richfield-100yr-source-fragment.png')
            manifest['richfield_overlay_crop_pdf_points']=list(clip)
            manifest['richfield_overlay_pixels_per_pdf_point']=3
        manifest['layers'].append({'id':layer,'dataset':'richfield','layer':name,'page':page_no,
            'source_image':str((folder/'source.png').relative_to(ROOT)),'size':list(im.size),
            'source_image_sha256':digest(folder/'source.png'),'legend_bbox_source_pixels':bbox,
            'legend_image':str((folder/'legend-manual.png').relative_to(ROOT)),
            'render_pixels_per_pdf_point':2,'source_georeference':georeference(doc,page),
            'preparation_seconds':round(time.monotonic()-start,3)})
        print(layer,im.size,flush=True)
(ROOT/'inputs/manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
