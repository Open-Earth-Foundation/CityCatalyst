"""Document-specific, fail-closed Richfield GeoPDF vector recovery."""
import json,re
from collections import Counter
import numpy as np
import pymupdf,shapely
from shapely.geometry import Polygon,LineString,shape,mapping,box
from shapely.ops import unary_union,polygonize,transform
from pyproj import Transformer
from PIL import Image,ImageDraw
from scipy.ndimage import binary_erosion
from porto import INPUT,OUT,write_json,digest

PDF=INPUT/'Richfield_FloodRiskPrioritization.pdf'
LAYERS=[(15,'inundation-2yr',{'2yr':(190,232,255)}),(16,'inundation-10yr',{'10yr':(0,169,230)}),
 (17,'inundation-100yr',{'100yr':(0,92,230)}),(18,'inundation-mce100',{'mce100':(0,76,115)}),
 (31,'prioritization-score',{'0.0 - 2.4':(255,255,204),'2.5 - 4.4':(161,218,180),'4.5 - 6.4':(44,127,184),'6.5 - 10':(37,52,148)})]
LL=Transformer.from_crs(26915,4326,always_xy=True)
UTM=Transformer.from_crs(4326,26915,always_xy=True)

def rings(items):
    result=[];current=[]
    for it in items:
        if it[0]=='re':
            r=it[1];pts=[(r.x0,r.y0),(r.x1,r.y0),(r.x1,r.y1),(r.x0,r.y1)]
            result.append(pts if it[2]>0 else pts[::-1]);continue
        if it[0]!='l':raise ValueError('Unsupported curved path: require explicit curve tolerance before exporting')
        a,b=tuple(it[1]),tuple(it[2])
        if current and current[-1]!=a:result.append(current);current=[]
        if not current:current=[a]
        current.append(b)
    if current:result.append(current)
    return [r if r[0]==r[-1] else r+[r[0]] for r in result if len(set(r))>=3]

def parts(g):
    if g.is_empty:return []
    if g.geom_type=='Polygon':return [g]
    return [p for c in getattr(g,'geoms',[]) for p in parts(c)]

def boundary_distances(a,b):
    """Vertex-to-segment distances in both directions, indexed rather than quadratic."""
    def one(source,target):
        segments=[]
        for p in parts(target):
            for ring in [p.exterior,*p.interiors]:
                c=np.asarray(ring.coords);segments.append(np.stack([c[:-1],c[1:]],axis=1))
        tree=shapely.STRtree(shapely.linestrings(np.concatenate(segments)))
        points=shapely.points(shapely.get_coordinates(source.boundary))
        _,distance=tree.query_nearest(points,return_distance=True,all_matches=False)
        return distance
    d=np.r_[one(a,b),one(b,a)]*7.62
    return {'median_m':float(np.median(d)),'p95_m':float(np.percentile(d,95)),'p99_9_m':float(np.percentile(d,99.9)),'max_m':float(d.max()),
      'vertices_over_0_1m':int((d>.1).sum()),'vertices_checked':len(d)}

def fill_geometry(d):
    rr=rings(d['items'])
    polygons=[Polygon(r) for r in rr]
    if d['even_odd'] and all(p.is_valid for p in polygons):
        gs=polygons
        while len(gs)>1:gs=[gs[i].symmetric_difference(gs[i+1]) if i+1<len(gs) else gs[i] for i in range(0,len(gs),2)]
        return gs[0] if gs else Polygon()
    # Crossing parity also handles self-intersecting or multiply-wound even-odd rings.
    faces=polygonize(unary_union([LineString(r) for r in rr]));kept=[]
    if not rr:return Polygon()
    aa=np.concatenate([np.asarray(r[:-1]) for r in rr]);bb=np.concatenate([np.asarray(r[1:]) for r in rr])
    ax,ay=aa.T;bx,by=bb.T
    for face in faces:
        p=face.representative_point();px,py=p.x,p.y
        cross=(bx-ax)*(py-ay)-(px-ax)*(by-ay)
        w=int(np.sum((ay<=py)&(py<by)&(cross>0)))-int(np.sum((by<=py)&(py<ay)&(cross<0)))
        if (w%2!=0 if d['even_odd'] else w!=0):kept.append(face)
    return unary_union(kept)

def georeference(doc,page):
    if page.mediabox.x0!=0 or page.mediabox.y0!=0 or page.cropbox!=page.mediabox:raise ValueError('Unsupported PDF page origin/crop')
    vp=doc.xref_get_key(page.xref,'VP')[1]
    if 'UTM_Zone_15N' not in vp or 'GCS_North_American_1983' not in vp or page.rotation:raise ValueError('Unsupported GeoPDF CRS or rotation')
    def nums(k):return np.array([float(v) for v in re.search('/'+k+r'\[([^\]]+)\]',vp).group(1).split()])
    bbox=nums('BBox');gp=nums('GPTS').reshape(-1,2);lp=nums('LPTS').reshape(-1,2)
    x=bbox[0]+lp[:,0]*(bbox[2]-bbox[0]);y=page.mediabox.height-(bbox[1]+lp[:,1]*(bbox[3]-bbox[1]))
    e,n=Transformer.from_crs(4269,26915,always_xy=True).transform(gp[:,1],gp[:,0]);A=np.c_[x,y,np.ones(len(x))]
    ce=np.linalg.lstsq(A,e,rcond=None)[0];cn=np.linalg.lstsq(A,n,rcond=None)[0]
    residual=float(np.hypot(A@ce-e,A@cn-n).max())
    if residual>1:raise ValueError('GeoPDF corner fit exceeds 1 metre')
    return {'E':ce.tolist(),'N':cn.tolist(),'corner_residual_m':residual,'scale_m_per_point':[float(np.hypot(ce[i],cn[i])) for i in (0,1)],'page_frame':[float(min(x)),float(min(y)),float(max(x)),float(max(y))]}

def project(g,geo):
    e,n=np.array(geo['E']),np.array(geo['N'])
    return transform(lambda x,y,z=None:(e[0]*np.asarray(x)+e[1]*np.asarray(y)+e[2],n[0]*np.asarray(x)+n[1]*np.asarray(y)+n[2]),g)

def source_shapes(page,colours,layer_predicate):
    stack=[];cache={};found=[];counts=Counter()
    for d in page.get_drawings(extended=True):
        stack=[s for s in stack if s['level']<d['level']]
        if d['type']=='clip':stack.append(d);continue
        if d.get('fill') is None or d['type'] not in ('f','fs') or not layer_predicate(d['layer']):continue
        c=tuple(round(v*255) for v in d['fill'])
        if c not in colours.values():raise ValueError('Unrecognised data-layer fill')
        if d['fill_opacity']!=1:raise ValueError('Unexpected transparent data fill')
        g=fill_geometry(d)
        for clip in stack:
            if id(clip) not in cache:cache[id(clip)]=fill_geometry(clip)
            g=g.intersection(cache[id(clip)])
        if not g.is_empty:
            key=next(k for k,v in colours.items() if v==c)
            found.append((key,g,d['seqno']));counts[d['type']]+=1
    if not found:raise ValueError('Expected map data layer absent')
    # Draw order matters only between different classes. Same-class pieces are unioned.
    classes={k:unary_union([g for c,g,_ in found if c==k]) for k in colours}
    overlap=sum(g.area for g in classes.values())-unary_union(list(classes.values())).area
    if overlap>1e-7:
        covered=Polygon();ordered={k:[] for k in colours}
        for k,g,_ in reversed(found):
            ordered[k].append(g.difference(covered));covered=covered.union(g)
        classes={k:unary_union(gs) for k,gs in ordered.items()}
    return classes,dict(counts),float(overlap)

def mask_geometry(g,w,h,scale):
    # Pixel-centre sampling avoids Pillow's inclusive, integer-rounded polygon edges.
    shapely.prepare(g);mask=np.zeros((h,w),bool);xs=(np.arange(w)+.5)/scale
    for start in range(0,h,64):
        ys=(np.arange(start,min(start+64,h))+.5)/scale
        mask[start:start+len(ys)]=shapely.contains_xy(g,xs[None,:],ys[:,None])
    return mask

def render_check(page,classes,colours,geo):
    # MuPDF rasterizes original path commands and clip rules independently of Shapely.
    # Isolate data fills: the published page uses blend groups and white label halos.
    def commands(d):
        result=[];last=None
        for it in d['items']:
            if it[0]=='re':
                r=it[1];result.append(f'{r.x0} {page.rect.height-r.y1} {r.width} {r.height} re');last=None
            elif it[0]=='l':
                a,b=it[1],it[2]
                if last!=tuple(a):result.append(f'{a.x} {page.rect.height-a.y} m')
                result.append(f'{b.x} {page.rect.height-b.y} l');last=tuple(b)
            else:raise ValueError('Unsupported isolated-render command')
        return '\n'.join(result)
    ops=[];stack=[]
    for d in page.get_drawings(extended=True):
        stack=[c for c in stack if c['level']<d['level']]
        if d['type']=='clip':stack.append(d);continue
        if d.get('fill') is None or not (d['layer'].startswith('Inundation_') or d['layer']=='Prioritization Scores'):continue
        c=tuple(round(v*255) for v in d['fill'])
        if c not in colours.values():continue
        ops.append('q')
        for clip in stack:ops.extend([commands(clip),'W* n' if clip['even_odd'] else 'W n'])
        ops.extend([' '.join(str(v/255) for v in c)+' rg',commands(d),'f*' if d['even_odd'] else 'f','Q'])
    isolated=pymupdf.open();ip=isolated.new_page(width=page.rect.width,height=page.rect.height)
    xref=isolated.get_new_xref();isolated.update_object(xref,'<<>>');isolated.update_stream(xref,'\n'.join(ops).encode('ascii'));ip.set_contents(xref)
    scale=3;pix=ip.get_pixmap(matrix=pymupdf.Matrix(scale,scale),alpha=False)
    rgb=np.frombuffer(pix.samples,np.uint8).reshape(pix.height,pix.width,3).astype(int)
    frame=mask_geometry(box(*geo['page_frame']),pix.width,pix.height,scale)
    result={}
    for k,g in classes.items():
        predicted=mask_geometry(g,pix.width,pix.height,scale)
        visible=(np.max(abs(rgb-np.array(colours[k])),axis=2)<=2)&frame
        # Buffer the vector, since subpixel holes can vanish in a binary raster mask.
        interior=mask_geometry(g.buffer(-2/scale),pix.width,pix.height,scale);visible_interior=binary_erosion(visible,iterations=2)
        result[k]={'rendered_colour_interior_pixels':int(visible_interior.sum()),
          'rendered_colour_interior_covered_pct':100*float((visible_interior&predicted).sum())/max(int(visible_interior.sum()),1),
          'source_interior_visible_as_exact_colour_pct':100*float((interior&visible).sum())/max(int(interior.sum()),1)}
        # Use half-coverage antialias threshold for full-mask fidelity, without erosion.
        colour=np.array(colours[k],float);direction=255-colour
        alpha=np.sum((255-rgb)*direction,axis=2)/np.sum(direction**2)
        full=(alpha>=.5)&frame
        if len(colours)>1:
            distance=np.sum((rgb-colour)**2,axis=2)
            for other in colours.values():
                if other!=colours[k]:full &= distance<=np.sum((rgb-np.array(other))**2,axis=2)
        union=int((full|predicted).sum());mismatch=int((full^predicted).sum())
        result[k].update(full_mask_iou=float((full&predicted).sum()/max(union,1)),
          full_mask_mismatch_m2=float(mismatch*np.linalg.det(np.array([geo['E'][:2],geo['N'][:2]]))*(-1)/scale**2),
          narrow_polygon_count=sum(p.buffer(-2/scale).is_empty for p in parts(g)),
          narrow_polygon_area_fraction=sum(p.area for p in parts(g) if p.buffer(-2/scale).is_empty)/g.area)
        if min(result[k]['rendered_colour_interior_covered_pct'],result[k]['source_interior_visible_as_exact_colour_pct'])<99.5:raise ValueError('Independent vector rasterization agreement below 99.5%: '+str(result[k]))
    isolated.close()
    return result

def shoreline_check(doc):
    geo=georeference(doc,doc[7]);lakes=[]
    for d in doc[7].get_drawings():
        if d.get('fill') and tuple(round(v*255) for v in d['fill'])==(151,219,242):
            lakes.extend(p for p in parts(fill_geometry(d).intersection(box(*geo['page_frame']))) if p.area>=20)
    raw=json.loads((INPUT/'osm-water-richfield.json').read_text(encoding='utf-8'))
    osm=[shapely.make_valid(Polygon([UTM.transform(q['lon'],q['lat']) for q in el['geometry']])) for el in raw['elements'] if el['type']=='way' and len(el.get('geometry',[]))>=4]
    errors=[];per=[];unmatched=[]
    for p in lakes:
        g=project(p,geo);matches=[q for q in osm if q.intersection(g).area/g.area>.3 and .5<q.area/g.area<2]
        if not matches:unmatched.append({'area_m2':g.area,'centroid_utm':list(g.centroid.coords[0])});continue
        q=max(matches,key=lambda q:q.intersection(g).area)
        points=[g.exterior.interpolate(t) for t in np.arange(0,g.exterior.length,5)]
        dist=np.array([v.distance(q.boundary) for v in points]);errors.extend(dist)
        per.append({'samples':len(dist),'median_m':float(np.median(dist)),'p90_m':float(np.percentile(dist,90))})
    return {'method':'GeoPDF only for fit; OSM matching checks shorelines, not surveyed ground truth. No roads checked.',
      'candidate_lakes':len(lakes),'matched_lakes':len(per),'unmatched':unmatched,'selection_note':'Overlap and area-ratio matching conditions on agreement; only OSM ways and exterior shorelines are checked.',
      'median_m':float(np.median(errors)),'p90_m':float(np.percentile(errors,90)),'per_lake':per}

def run():
    out=OUT/'richfield';out.mkdir(parents=True,exist_ok=True);report={'source_sha256':digest(PDF),'layers':{}}
    with pymupdf.open(PDF) as doc:
        for pn,name,colours in LAYERS:
            page=doc[pn-1];geo=georeference(doc,page)
            classes,counts,overlap=source_shapes(page,colours,lambda s:s.startswith('Inundation_') or s=='Prioritization Scores')
            features=[];areas={};old_metrics={};rounding_error=[]
            old=json.loads((INPUT/('richfield-flood-'+name+'.json')).read_text(encoding='utf-8'))
            for k,g in classes.items():
                utm=project(g,geo);areas[k]=utm.area/10000
                ll=transform(LL.transform,utm)
                # Projection/rounding can collapse tiny rings; record area change and cap loss.
                precision=9
                # Source rings already identify shells/holes; structure repair avoids costly global noding.
                rounded=shapely.set_precision(unary_union(parts(shapely.make_valid(ll,method='structure',keep_collapsed=False))),1e-9)
                rounded=shapely.orient_polygons(rounded)
                rounded=transform(lambda x,y,z=None:(np.round(x,precision),np.round(y,precision)),rounded)
                geom=mapping(rounded);check=shape(json.loads(json.dumps(geom)))
                if not check.is_valid or check.is_empty or check.geom_type not in ('Polygon','MultiPolygon'):raise ValueError('Invalid serialized polygon')
                rounding_error.append(abs(transform(UTM.transform,check).area-utm.area))
                if rounding_error[-1]/utm.area>1e-4:raise ValueError('Projection/precision area change exceeds 0.01%')
                features.append({'type':'Feature','properties':{'class':k,'source_page':pn,'coordinate_decimals':precision},'geometry':geom})
                oldparts=[shapely.make_valid(transform(UTM.transform,shape(f['geometry']))) for f in old['features'] if len(colours)==1 or f['properties']['class']==k]
                op=unary_union(oldparts);inter=utm.intersection(op).area
                old_metrics[k]={'jvp_vs_source_iou':inter/utm.union(op).area,'source_area_recovered_by_jvp':inter/utm.area}
            target=out/(name+'.geojson')
            write_json(target,{'type':'FeatureCollection','provenance':{'method':'Source PDF vector fills with actual clip paths, draw order, embedded GeoPDF coordinates; pre-label/stroke geometry; no fitted OSM registration or imposed nesting','pdf_sha256':digest(PDF),'page':pn,'geo':geo},'features':features})
            inverse=np.linalg.inv(np.array([geo['E'][:2],geo['N'][:2]]));offset=np.array([geo['E'][2],geo['N'][2]])
            def pagecoords(x,y,z=None):
                xy=inverse@np.array([np.asarray(x)-offset[0],np.asarray(y)-offset[1]])
                return xy[0],xy[1]
            serialized=json.loads(target.read_text(encoding='utf-8'))
            recovered={f['properties']['class']:transform(pagecoords,transform(UTM.transform,shape(f['geometry']))) for f in serialized['features']}
            boundary_error={k:boundary_distances(classes[k],g) for k,g in recovered.items()}
            changed_area={k:float(classes[k].symmetric_difference(shapely.make_valid(g)).area/classes[k].area) for k,g in recovered.items()}
            # Tiny zero-width spikes can collapse on projection; bound their area and vertex share.
            if max(v['p99_9_m'] for v in boundary_error.values())>.1 or max(changed_area.values())>1e-4:raise ValueError('Serialized roundtrip exceeds boundary/area gates: '+str(boundary_error))
            from shapely.affinity import translate
            negative_shift={k:boundary_distances(classes[k],translate(g,xoff=.5)) for k,g in recovered.items()}
            if min(v['p99_9_m'] for v in negative_shift.values())<=.1:raise ValueError('Shifted negative control was not detected')
            report['layers'][name]={'page':pn,'source_paths':counts,'cross_class_overlap_page_pt2':overlap,'source_area_ha':areas,'rounding_area_change_m2':rounding_error,'geo':geo,'invalid_features_after_serialization':0,'render_check':render_check(page,recovered,colours,geo),'old_vs_document_geometry':old_metrics}
            report['layers'][name].update(serialized_boundary_vertex_to_segment_m=boundary_error,serialized_symmetric_difference_area_fraction=changed_area,negative_control_shift_half_point_vertex_to_segment_m=negative_shift)
            print(name,json.dumps(report['layers'][name]['render_check']),flush=True)
        report['shoreline_check']=shoreline_check(doc)
        if georeference(doc,doc[7])!=georeference(doc,doc[14]):raise ValueError('Shoreline page georeference differs')
    report['limitation']='Source fidelity, not hazard accuracy: serialized GeoJSON inverse-projected and compared to MuPDF rasterization of isolated path/clip commands obtained from the same PyMuPDF extraction. Independent of Shapely fill interpretation, NOT independent of PyMuPDF extraction. Source interiors exclude a 2/3 PDF-point boundary band; MuPDF interiors exclude 2 raster pixels. Full-mask metrics supplement this blind band. Roundtrip gates: p99.9 vertex-to-boundary error <=0.1m and symmetric-difference area <=0.01%; maxima and outlier counts retained because tiny degenerate spikes can collapse. Shifted negative controls must fail the boundary gate. Narrow shapes can have no interior samples. Labels, strokes and blend styling omitted. No road control or survey validation.'
    write_json(out/'validation.json',report)
    return report

if __name__=='__main__':run()
