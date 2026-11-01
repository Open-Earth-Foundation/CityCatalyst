"""Source-only preparation. No reference raster values or recovered hazard vectors are read."""
import sys, json, hashlib
from pathlib import Path
sys.dont_write_bytecode = True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT))
import porto, richfield
import numpy as np
import pymupdf
from PIL import Image

def write(p,v):
    p.write_text(json.dumps(v,indent=2,ensure_ascii=False),encoding='utf-8')

def main():
    scale=2
    out=HERE/'inputs';out.mkdir(exist_ok=True)
    items=[]
    for hazard in ['heat','flood','landslide','drought','arbovirus','storm']:
        name='porto-'+hazard;rgb=porto.figure(porto.PAGES[hazard]);h,w=rgb.shape[:2]
        aff=porto.fit_ticks(rgb)
        shapes=[];swatches=[]
        # Manually identified legend column, same layout on the six published figures.
        lx0,lx1=int(120*w/1213),int(155*w/1213)
        ly0,ly1=int(1045*h/1758),int(1290*h/1758)
        region=rgb[ly0:ly1,lx0:lx1]
        for k,c in enumerate(porto.RAMP):
            y,x=np.where(np.max(abs(region.astype(float)-c),axis=2)<=5)
            if len(x)<10:raise ValueError((name,k,'legend absent'))
            cx=int(np.median(x))+lx0;cy=int(np.median(y))+ly0
            rect=[cx-5,cy-5,cx+6,cy+6]
            shapes.append({'label':f'bin{k:02}_poly','points':[[rect[0],rect[1]],[rect[2],rect[3]]],'shape_type':'rectangle'})
            Image.fromarray(rgb[rect[1]:rect[3],rect[0]:rect[2]]).save(out/f'{name}-legend-{k:02}.png')
            swatches.append({'index':k,'bbox':rect,'midpoint':(k+.5)/10,'rgb':np.median(rgb[rect[1]:rect[3],rect[0]:rect[2]].reshape(-1,3),axis=0).tolist()})
        dark=rgb.max(2)<100
        xs=np.flatnonzero(dark.sum(0)>h*.55);ys=np.flatnonzero(dark.sum(1)>w*.65)
        # Top border is gray and fails the dark horizontal-line test; follow the
        # source's vertical frame line instead. Restrict to the printed map band.
        left=int(xs.min());bottom=int(ys.max())
        line=(rgb[:,left:left+2].min(axis=(1,2))<220)
        line[:int(.07*h)]=False;line[bottom+1:]=False
        idx=np.flatnonzero(line)
        runs=np.split(idx,np.where(np.diff(idx)>1)[0]+1)
        run=max(runs,key=len)
        frame=[left,int(run.min()),int(xs.max()),bottom]
        assert (frame[2]-frame[0])*(frame[3]-frame[1])>w*h*.5,frame
        Image.fromarray(rgb).save(out/f'{name}.tif')
        write(out/f'{name}.json',{'shapes':shapes,'imageHeight':h,'imageWidth':w})
        x0,y0,x1,y1=frame
        write(out/f'{name}-bound.json',{'segments':[{'class_label':'map','poly_bounds':[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]}]})
        items.append({'name':name,'family':'porto','hazard':hazard,'page':porto.PAGES[hazard],'size':[w,h],'affine':aff,'frame':frame,'legends':swatches})
    with pymupdf.open(richfield.PDF) as doc:
        for pn,layer,colours in sorted(richfield.LAYERS,key=lambda x:x[0]!=17):
            page=doc[pn-1];pix=page.get_pixmap(matrix=pymupdf.Matrix(scale,scale),alpha=False)
            rgb=np.frombuffer(pix.samples,np.uint8).reshape(pix.height,pix.width,3)
            name='richfield-'+layer;geo=richfield.georeference(doc,page)
            # Only sidebar legend rectangles/shapes, never in-map hazard geometry.
            candidates=[]
            for d in page.get_drawings():
                r=d['rect']
                if d.get('fill') and r.x0>1030 and r.y1<400:
                    c=tuple(round(v*255) for v in d['fill'])
                    if c in colours.values():candidates.append((c,list(r)))
            shapes=[];swatches=[]
            for k,(label,c) in enumerate(colours.items()):
                boxes=[r for col,r in candidates if col==c]
                if not boxes:raise ValueError((name,label,'source legend absent',candidates))
                r=max(boxes,key=lambda r:(r[2]-r[0])*(r[3]-r[1]))
                r=[v*scale for v in r]
                rect=[int(np.floor(r[0])),int(np.floor(r[1])),int(np.ceil(r[2])),int(np.ceil(r[3]))]
                shapes.append({'label':f'bin{k:02}_poly','points':[[rect[0],rect[1]],[rect[2],rect[3]]],'shape_type':'rectangle'})
                Image.fromarray(rgb[rect[1]:rect[3],rect[0]:rect[2]]).save(out/f'{name}-legend-{k:02}.png')
                swatches.append({'index':k,'label':label,'bbox':rect,'source_fill_rgb':list(c)})
            Image.fromarray(rgb).save(out/f'{name}.tif')
            write(out/f'{name}.json',{'shapes':shapes,'imageHeight':pix.height,'imageWidth':pix.width})
            x0,y0,x1,y1=[v*scale for v in geo['page_frame']]
            write(out/f'{name}-bound.json',{'segments':[{'class_label':'map','poly_bounds':[[int(x0),int(y0)],[int(x1),int(y0)],[int(x1),int(y1)],[int(x0),int(y1)]]}]})
            items.append({'name':name,'family':'richfield','layer':layer,'page':pn,'size':[pix.width,pix.height],'render_pixels_per_point':scale,'geo':geo,'legends':swatches})
    # Secondary control: reuse exact previous 72 DPI source/legend/bounds read-only.
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
    write(HERE/'input-manifest.json',items)
    print(json.dumps([{'name':x['name'],'size':x['size'],'legends':len(x['legends'])} for x in items]))

if __name__=='__main__':main()
