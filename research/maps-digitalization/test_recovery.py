import unittest,json,tempfile
from pathlib import Path
import numpy as np
import pymupdf
from shapely.geometry import shape,Polygon
import richfield as r
import porto as p
from benchmark import metrics,split,reference

def path(rings,evenodd=True,**kw):
    items=[]
    for ring in rings:
        for a,b in zip(ring,ring[1:]+ring[:1]):items.append(('l',pymupdf.Point(*a),pymupdf.Point(*b)))
    return {'items':items,'even_odd':evenodd,**kw}

class RecoveryChecks(unittest.TestCase):
    def test_fill_rules_and_holes(self):
        outer=[(0,0),(10,0),(10,10),(0,10)];inner=[(2,2),(8,2),(8,8),(2,8)]
        self.assertAlmostEqual(r.fill_geometry(path([outer,inner])).area,64)
        self.assertAlmostEqual(r.fill_geometry(path([outer,inner],False)).area,100)
        self.assertAlmostEqual(r.fill_geometry(path([outer,inner[::-1]],False)).area,64)
        self.assertAlmostEqual(r.fill_geometry(path([outer+outer])).area,0)
        self.assertAlmostEqual(r.fill_geometry(path([outer+outer],False)).area,100)
    def test_clipping_fill_and_stroke_and_draw_order(self):
        clip=path([[(0,0),(8,0),(8,8),(0,8)]],False,type='clip',level=0)
        a=path([[(0,0),(10,0),(10,10),(0,10)]],type='fs',level=1,fill=(1,0,0),fill_opacity=1,layer='data',seqno=0)
        b=path([[(4,0),(10,0),(10,10),(4,10)]],type='f',level=1,fill=(0,0,1),fill_opacity=1,layer='data',seqno=1)
        class Page:
            def get_drawings(self,**kwargs):return [clip,a,b]
        cs,counts,overlap=r.source_shapes(Page(),{'a':(255,0,0),'b':(0,0,255)},lambda s:s=='data')
        self.assertEqual(counts,{'fs':1,'f':1});self.assertEqual(cs['a'].area,32);self.assertEqual(cs['b'].area,32);self.assertEqual(overlap,32)
        class NoClip:
            def get_drawings(self,**kwargs):return [a,b]
        unclipped,_,_=r.source_shapes(NoClip(),{'a':(255,0,0),'b':(0,0,255)},lambda s:s=='data')
        self.assertEqual(sum(g.area for g in unclipped.values()),100,'Omitted-clip negative control must recover the unclipped area')
    def test_curve_fails_closed(self):
        with self.assertRaises(ValueError):r.rings([('c',)])
    def test_support_missing_and_midpoints(self):
        ids=np.array([0,0,0,1,1,2]);steps=np.array([0,0,-1,9,-1,-1])
        vals,meta=p.aggregate(ids,steps,support=2)
        self.assertEqual(set(vals),{0});self.assertAlmostEqual(vals[0],.05);self.assertEqual(meta[0]['recognized_pixels'],2)
    def test_uint8_colour_input(self):
        labels,_=p.classify_nearest(p.RAMP.astype(np.uint8));self.assertEqual(labels.tolist(),list(range(10)))
        a,_=p.classify_blended(p.RAMP.astype(np.uint8),.35);b,_=p.classify_blended(p.RAMP,.35)
        np.testing.assert_equal(a,b);self.assertEqual(a.tolist(),list(range(10)))
    def test_missing_denominator_and_zero_reference(self):
        m=metrics({0:.4,1:.7},np.array([20,20,0]),{0:.4,2:.5})
        self.assertEqual(m['exact_all_pct'],50);self.assertEqual(m['exact_common_pct'],100);self.assertEqual(m['missing_pct'],50);self.assertEqual(m['predicted_zero_reference_cells'],1)
    def test_cell_geometry_and_input_validation(self):
        g=shape(p.polygon_for_id(21547));self.assertTrue(g.is_valid);self.assertTrue(g.exterior.is_ccw)
        with tempfile.TemporaryDirectory() as t:
            with self.assertRaises(ValueError):p.export_cells(Path(t)/'x.json','heat',{0:float('nan')},{},{})
    def test_spatial_split_shared_block(self):
        self.assertEqual(split(0),split(11+11*p.NX))
    def test_all_delivered_geometry(self):
        manifest=json.loads((p.OUT/'run-manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['status'],'complete');self.assertEqual(manifest['route'],'all')
        for file,h in manifest['pipeline_hashes'].items():self.assertEqual(p.digest(p.ROOT/file),h)
        for file,h in manifest['output_hashes'].items():self.assertEqual(p.digest(p.OUT/file.replace('\\','/')),h)
        paths=list(p.OUT.glob('*/*.geojson'));self.assertGreaterEqual(len(paths),23)
        for file in paths:
            data=json.loads(file.read_text(encoding='utf-8'))
            for f in data['features']:self.assertTrue(shape(f['geometry']).is_valid,file.name)
    def test_exported_and_missing_disjoint(self):
        for hazard in p.PAGES:
            exported=json.loads((p.OUT/'porto-experimental'/(hazard+'.geojson')).read_text(encoding='utf-8'))
            missing=json.loads((p.OUT/'porto-experimental'/(hazard+'-missing.json')).read_text(encoding='utf-8'))
            e={f['id'] for f in exported['features']};m={f['id'] for f in missing['cells']}
            self.assertFalse(e&m)
            rgb=p.figure(p.PAGES[hazard]);_,_,ids=p.map_domain(rgb,p.fit_ticks(rgb))
            self.assertEqual(e|m,set(map(int,ids)))
    def test_actual_geopdf_scale_and_corner_fit(self):
        with pymupdf.open(r.PDF) as doc:
            gs=[r.georeference(doc,doc[pn-1]) for pn,_,_ in r.LAYERS]
        for g in gs:
            self.assertLess(g['corner_residual_m'],.2)
            self.assertLess(max(abs(s-7.62) for s in g['scale_m_per_point']),.001)
            self.assertEqual(g,gs[0])

if __name__=='__main__':unittest.main(verbosity=2)
