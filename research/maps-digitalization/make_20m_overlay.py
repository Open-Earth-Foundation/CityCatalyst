"""Fine display grids sampled from source-PDF colours, without invented detail."""
import argparse
import json
import re
from pathlib import Path
import numpy as np
from porto import ROOT, OUT, INPUT, PAGES, E0, N1, CELL, NX, RAMP, figure, fit_ticks, map_domain, classify_blended, digest, write_json


def main(size=20):
    rgb=figure(PAGES['heat'])
    aff=fit_ticks(rgb)
    yy,xx,_=map_domain(rgb,aff)
    labels,_=classify_blended(rgb[yy,xx],.35)
    source=np.full(rgb.shape[:2],-1,dtype=np.int8)
    source[yy,xx]=labels
    nx=int(NX*CELL/size)
    ny=int(np.ceil((N1-(aff['my']*yy+aff['by']).min()+abs(aff['my'])/2)/size))
    x_float=(E0+(np.arange(nx)+.5)*size-aff['bx'])/aff['mx']
    y_float=(N1-(np.arange(ny)+.5)*size-aff['by'])/aff['my']
    sx=np.floor(x_float+.5).astype(int)
    sy=np.floor(y_float+.5).astype(int)
    good_x=(sx>=0)&(sx<source.shape[1])
    good_y=(sy>=0)&(sy<source.shape[0])
    grid=np.full((ny,nx),-1,dtype=np.int8)
    grid[np.ix_(good_y,good_x)]=source[np.ix_(sy[good_y],sx[good_x])]
    # Nearest pixel resampling preserves rejected pixels as no-data, including grey lines.
    assert np.max(abs(sx-x_float))<=.5 and np.max(abs(sy-y_float))<=.5
    assert set(np.unique(grid))<=set(range(-1,10))
    assert np.array_equal(grid[np.ix_(good_y,good_x)],source[np.ix_(sy[good_y],sx[good_x])])
    folder=OUT/f'porto-experimental-{size}m'
    folder.mkdir(exist_ok=True)
    np.savez_compressed(folder/'heat-grid.npz',steps=grid,cell_size_m=size,easting_left=E0,northing_top=N1)
    with np.load(folder/'heat-grid.npz') as stored:
        assert np.array_equal(stored['steps'],grid) and stored['cell_size_m']==size

    y,x=divmod(21547,NX)
    ec,nc=E0+(x+.5)*CELL,N1-(y+.5)*CELL
    left=int((ec-1500-aff['bx'])/aff['mx'])
    right=int(np.ceil((ec+1500-aff['bx'])/aff['mx']))
    top=int((nc+875-aff['by'])/aff['my'])
    bottom=int(np.ceil((nc-875-aff['by'])/aff['my']))
    w,h=right-left,bottom-top
    gy,gx=np.where(grid>=0)
    px=(E0+gx*size-aff['bx'])/aff['mx']-left
    py=(N1-gy*size-aff['by'])/aff['my']-top
    pw,ph=size/aff['mx'],-size/aff['my']
    visible=(px+pw>0)&(py+ph>0)&(px<w)&(py<h)
    paths={k:[] for k in range(5)}
    for x,y,row,col in zip(px[visible],py[visible],gy[visible],gx[visible]):
        step=int(grid[row,col])
        paths[step//2].append(f'M{x:.4f},{y:.4f}h{pw:.4f}v{ph:.4f}h{-pw:.4f}z')
    rects=[]
    for cls,commands in paths.items():
        colour=RAMP[cls*2+1].astype(int)
        rects.append(f'<path d="{"".join(commands)}" fill="rgb({colour[0]},{colour[1]},{colour[2]})" stroke="#555" stroke-width="{.015*size/20:.4f}"><title>{size} m display cells; class {cls+1}; nearest source pixels</title></path>')
    visible_count=int(visible.sum())
    assert visible_count and sum(len(v) for v in paths.values())==visible_count
    assert abs(pw*aff['mx']-size)<1e-9 and abs(ph*aff['my']+size)<1e-9
    old=(ROOT/'overlay-100m.html').read_text(encoding='utf-8')
    original_svg=next(s for s in re.findall(r'<svg\b.*?</svg>',old,re.S) if 'id="porto-overlay"' in s)
    svg,n=re.subn(r'<g id="porto-overlay".*?</g>','<g id="porto-overlay" opacity="0.55">'+''.join(rects)+'</g>',original_svg,count=1,flags=re.S)
    assert n==1
    svg=svg.replace('100 metre',f'{size} metre')
    assert re.search(r'<image\b[^>]+>',svg).group()==re.search(r'<image\b[^>]+>',original_svg).group()
    html=old.replace(original_svg,svg).replace('original + 100 m recovery','original + 20 m recovery')
    html=html.replace('100 m cells, recalculated from the original PDF pixels: 2.5× finer across, 6.25× smaller in area. Same fragment and zoom.', '20 m display cells sampled from the nearest accepted original PDF pixel. Same fragment and zoom; source pixels are approximately 30 m, so neighbouring cells can repeat a value.')
    html=html.replace('Each 100 m cell averages at least 3 recognized PDF pixels. Unfilled areas have insufficient accepted colours. This finer grid has not been benchmarked; colour-recovery errors and unsupported coverage remain possible.', '20 m is the display grid, not the source resolution. No smoothing or inferred values were added; rejected source colours remain empty. This version has not been benchmarked.')
    assert '100 m' not in html
    html=html.replace('20 m',f'{size} m')
    (ROOT/f'overlay-{size}m.html').write_text(html,encoding='utf-8')
    visual_dir=Path(r'C:\Users\WBW\.codex\visualizations\2026\10\27\01a17f58-31f5-7522-bee7-a8abf98fa7d7')
    fragment=(visual_dir/'porto-100m-overlay.html').read_text(encoding='utf-8')
    fragment,n=re.subn(r'<svg\b.*?</svg>',lambda _:svg,fragment,count=1,flags=re.S)
    fragment=fragment.replace('100 m recovery',f'{size} m display grid').replace('porto-fine-repeat',f'porto-{size}m-repeat')
    assert n==1 and len(fragment.encode('utf-8'))<1000000
    (visual_dir/f'porto-{size}m-overlay.html').write_text(fragment,encoding='utf-8')
    info={'grid_size_m':size,'grid_shape':list(grid.shape),'accepted_cells':int((grid>=0).sum()),'visible_cells':visible_count,
          'source_pixel_size_m':[aff['mx'],abs(aff['my'])],'method':f'Nearest accepted source pixel at each {size}m cell centre; no smoothing; no-data preserved',
          'crs':'EPSG:31982','origin':[E0,N1],'encoding':'steps -1=no-data, 0..9 => midpoint value=(step+0.5)/10',
          'release_status':f'research_only_unbenchmarked_{size}m_resampling','source_sha256':digest(INPUT/'porto-alegre-arvc.pdf'),
          'grid_sha256':digest(folder/'heat-grid.npz'),'affine':aff,
          'checks':[f'{size}m dimensions','nearest-source values and no-data preserved','compressed data readback identical','original image and crop unchanged']}
    write_json(folder/'validation.json',info)
    print(json.dumps(info,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--size',type=int,choices=[10,20],default=20)
    main(parser.parse_args().size)
