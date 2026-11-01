"""Reaggregate the observed Porto PDF colours at 100 m for the existing overlay."""
import base64
import json
import re
import numpy as np
from shapely.geometry import shape
from porto import (ROOT, OUT, INPUT, PAGES, E0, N1, CELL, NX, INV, RAMP,
                   figure, fit_ticks, map_domain, classify_blended, aggregate,
                   digest, write_json)


def main():
    size = 100
    nx = int(NX * CELL / size)
    rgb = figure(PAGES['heat'])
    aff = fit_ticks(rgb)
    yy, xx, _ = map_domain(rgb, aff)
    gx = np.floor((aff['mx'] * xx + aff['bx'] - E0) / size).astype(int)
    gy = np.floor((N1 - aff['my'] * yy - aff['by']) / size).astype(int)
    ids = gy * nx + gx
    steps, _ = classify_blended(rgb[yy, xx], .35)
    values, support = aggregate(ids, steps, support=3)
    features = []
    for k, value in values.items():
        y, x = divmod(k, nx)
        e, n = E0 + x * size, N1 - y * size
        corners = [(e, n), (e, n-size), (e+size, n-size), (e+size, n), (e, n)]
        geometry = {'type': 'Polygon', 'coordinates': [[list(INV.transform(a,b)) for a,b in corners]]}
        assert shape(geometry).is_valid
        features.append({'type': 'Feature', 'id': k, 'geometry': geometry,
                         'properties': {'hazard': 'heat', 'value': value,
                                        'class_index': min(int(value*5),4),
                                        'grid_size_m': size, **support[k]}})
    # Check aggregation against the actual pixels, independently of bincount sums.
    for k in list(values)[::max(1, len(values)//25)]:
        observed = steps[(ids == k) & (steps >= 0)]
        assert len(observed) >= 3
        assert abs(values[k] - np.mean((observed+.5)/10)) < 1e-12
    target = OUT/'porto-experimental-100m/heat.geojson'
    provenance = {'source_pdf_sha256': digest(INPUT/'porto-alegre-arvc.pdf'),
                  'method': 'Reclassified PDF pixels, mean palette midpoint in 100m cells',
                  'minimum_recognized_pixels': 3, 'minimum_alpha': .35,
                  'grid_size_m': size, 'grid_origin_utm': [E0,N1], 'grid_columns': nx,
                  'affine': aff, 'release_status': 'research_only_unbenchmarked_grid',
                  'note': 'No interpolation or subdivision of previous 250m values. Known colour-recovery coverage risks remain.'}
    write_json(target, {'type':'FeatureCollection', 'provenance':provenance, 'features':features})

    # Reuse precisely the previous crop and image registration.
    y,x = divmod(21547,NX)
    ec,nc = E0+(x+.5)*CELL,N1-(y+.5)*CELL
    left = int((ec-1500-aff['bx'])/aff['mx'])
    right = int(np.ceil((ec+1500-aff['bx'])/aff['mx']))
    top = int((nc+875-aff['by'])/aff['my'])
    bottom = int(np.ceil((nc-875-aff['by'])/aff['my']))
    w,h = right-left,bottom-top
    rects = []
    for k,v in values.items():
        y,x = divmod(k,nx)
        px = (E0+x*size-aff['bx'])/aff['mx']-left
        py = (N1-y*size-aff['by'])/aff['my']-top
        pw,ph = size/aff['mx'],-size/aff['my']
        if px+pw<=0 or py+ph<=0 or px>=w or py>=h:
            continue
        colour = RAMP[min(int(v*5),4)*2+1].astype(int)
        rects.append(f'<rect x="{px:.4f}" y="{py:.4f}" width="{pw:.4f}" height="{ph:.4f}" fill="rgb({colour[0]},{colour[1]},{colour[2]})" stroke="#555" stroke-width=".04"><title>100 m cell {k}; value {v:.3f}; {support[k]["recognized_pixels"]} recognized pixels</title></rect>')
    assert rects and abs(pw*aff['mx']-100)<1e-9 and abs(ph*aff['my']+100)<1e-9
    html = (ROOT/'overlay-new-original-preview.html').read_text(encoding='utf-8')
    html,count = re.subn(r'<g id="porto-overlay".*?</g>', '<g id="porto-overlay" opacity="0.55">'+''.join(rects)+'</g>', html, count=1, flags=re.S)
    assert count == 1
    html = html.replace('Our coloured 250 m cells sit directly over the original PDF.', '100 m cells, recalculated from the original PDF pixels: 2.5× finer across, 6.25× smaller in area. Same fragment and zoom.')
    html = html.replace('shared 250 metre grid','shared 100 metre grid')
    html = html.replace('Porto shows the experimental PDF recovery. Cell squares are aggregates, not precise risk boundaries; this method remains research-only.', 'Each 100 m cell averages at least 3 recognized PDF pixels. Unfilled areas have insufficient accepted colours. This finer grid has not been benchmarked; colour-recovery errors and unsupported coverage remain possible.')
    html = html.replace('Porto Alegre · original + our new recovery','Porto Alegre · original + 100 m recovery')
    assert '250 m' not in html and '250 metre' not in html
    preview = ROOT/'overlay-100m-preview.html'
    preview.write_text(html,encoding='utf-8')
    def embed(match):
        path = match.group(1)
        from pathlib import Path
        return 'href="data:image/png;base64,'+base64.b64encode(Path(path).read_bytes()).decode()+'"'
    standalone = re.sub(r'href="(C:/[^\"]+\.png)"',embed,html)
    (ROOT/'overlay-100m.html').write_text(standalone,encoding='utf-8')
    stats = {'heat_cells':len(features),'visible_cells':len(rects),'grid_size_m':size,
             'checks':'valid geometries; sampled direct pixel means; 100m dimensions; one overlay replaced',
             'geojson_sha256':digest(target)}
    write_json(OUT/'porto-experimental-100m/validation.json',stats)
    print(json.dumps(stats))


if __name__ == '__main__':
    main()
