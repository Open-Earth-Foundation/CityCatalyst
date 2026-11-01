"""Source-only preparation. Never imports benchmark or reads numeric references."""
import sys, json, hashlib, datetime
from pathlib import Path
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))
import numpy as np
import pymupdf
from PIL import Image
import porto, richfield

def save(path, obj):
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding='utf-8')

def main():
    src = HERE/'sources'; src.mkdir(exist_ok=True)
    layers = []
    for name in ['heat','flood','landslide','drought','arbovirus','storm']:
        rgb = porto.figure(porto.PAGES[name]); h,w = rgb.shape[:2]
        key = 'porto-'+name; folder=src/key; folder.mkdir(exist_ok=True)
        Image.fromarray(rgb).save(folder/'map.png')
        # Document-profile coordinates for swatch interiors, verified visually.
        # Proportional positions accommodate the differently sized flood figure.
        legends=[]
        for i in range(10):
            cx=round(w*0.113); cy=round(h*(0.619+0.0105*i))
            box=[cx-4,cy-4,cx+5,cy+5]
            patch=rgb[box[1]:box[3],box[0]:box[2]]
            Image.fromarray(patch).save(folder/f'legend-{i+1:02d}.png')
            legends.append({'index':i+1,'label':f'{i/10:.1f}-{(i+1)/10:.1f}',
                'value_midpoint':(i+.5)/10,'box_pixels':box,'median_rgb':np.median(patch,axis=(0,1)).tolist()})
        layers.append({'id':key,'dataset':'porto','hazard':name,'page':porto.PAGES[name],
            'map_size':[w,h],'affine':porto.fit_ticks(rgb),'legends':legends})
    with pymupdf.open(richfield.PDF) as doc:
        order=sorted(richfield.LAYERS,key=lambda x:0 if x[1]=='inundation-100yr' else 1)
        for pn,name,colours in order:
            key='richfield-'+name; folder=src/key; folder.mkdir(exist_ok=True)
            page=doc[pn-1]; pix=page.get_pixmap(matrix=pymupdf.Matrix(2,2),alpha=False)
            rgb=np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,3)
            Image.fromarray(rgb).save(folder/'map.png')
            legends=[]
            for i,(label,colour) in enumerate(colours.items()):
                # Interior of the printed legend, not geometry/reference data.
                box_pt=[1044,63,1056,69] if len(colours)==1 else [1042,68+17*i,1058,74+17*i]
                box=[round(v*2) for v in box_pt]
                patch=rgb[box[1]:box[3],box[0]:box[2]]
                Image.fromarray(patch).save(folder/f'legend-{i+1:02d}.png')
                legends.append({'index':i+1,'label':label,'box_pixels':box,'box_pdf_points':box_pt,
                    'median_rgb':np.median(patch,axis=(0,1)).tolist(),'pdf_fill_rgb':list(colour)})
            layers.append({'id':key,'dataset':'richfield','name':name,'page':pn,
                'map_size':[pix.width,pix.height],'render_scale':2,'geo':richfield.georeference(doc,page),'legends':legends})
    config={
      'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'model':'UIUC Golden-Muscat public Darpa_Unet_Release UNet(6,2)',
      'model_revision':'7f6f6450108e43df83a1db2a51b6c7b893c65f11',
      'pipeline_revision':'9d90bc78e86c5c33b539e47cb1c79c134573c287',
      'checkpoint_sha256':'453a711c315ff456965d8bb383c07dd5b0038a3d50615b8dfe5bc55f48160973',
      'checkpoint_url':'https://media.githubusercontent.com/media/xiyuez2/Darpa_Unet_Release/7f6f6450108e43df83a1db2a51b6c7b893c65f11/jaccard_index_value%3D0.9229.ckpt',
      'device':'cpu','precision':'float32','cpu_threads':4,'batch_size':1,
      'channel_order':'RGB, matching UIUC pipeline image input; standalone H5 tool stores OpenCV BGR',
      'normalization':{'mean':[.485,.456,.406],'std':[.229,.224,.225],'scale':255},
      'patch_size':256,'patch_overlap':64,'stitch':'discard 32-pixel overlap margins; retain image borders',
      'padding':'black right/bottom to 256 + N*192, fixing pipeline uncovered-edge padding',
      'legend_resize':'torch bilinear 256x256 align_corners=False, antialias=False as pipeline tensor Resize',
      'decoding':'softmax foreground probability, highest confidence legend wins; later legend wins ties',
      'minimum_confidence':.333,'unknown_label':0,'minimum_predicted_pixels_per_250m_cell':3,
      'raw_binary_masks':'foreground probability >= 0.333 before cross-legend arbitration',
      'porto_values':'mean of accepted pixel legend bin midpoints; no interpolation or reference gating',
      'porto_aggregation_domain':'existing source-georeferenced municipality boundary, porto.map_domain',
      'porto_grid':{'crs':'EPSG:31982','origin':[462000,6692000],'cell_m':250,'columns':152},
      'richfield_scoring':'entire GeoPDF map frame at 2 pixels per PDF point; label/stroke holes penalized against fill geometry',
      'reference_used_in_inference':False,'training':False,'blind_test':False,
      'source_pdf_sha256':{f:hashlib.file_digest(open(ROOT/'inputs'/f,'rb'),'sha256').hexdigest() for f in ['porto-alegre-arvc.pdf','Richfield_FloodRiskPrioritization.pdf']},
      'layers':layers}
    save(HERE/'frozen-config.json',config)
    sha=hashlib.sha256((HERE/'frozen-config.json').read_bytes()).hexdigest()
    (HERE/'frozen-config.sha256').write_text(sha+'\n',encoding='utf-8')
    print(json.dumps({'frozen_sha256':sha,'layers':[(l['id'],l['map_size'],[x['median_rgb'] for x in l['legends']]) for l in layers]},indent=2))

if __name__=='__main__':main()
