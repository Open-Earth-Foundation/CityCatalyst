"""Meaningful adapter checks, using source pixels and no evaluation references."""
import sys,json,argparse,importlib.util
from pathlib import Path
from types import SimpleNamespace
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'Darpa_Unet_Release'))
import torch,numpy as np
from PIL import Image
from models.models import UNet,SegmentationModel
from infer import starts

torch.set_num_threads(2);torch.set_num_interop_threads(1)
with torch.serialization.safe_globals([argparse.Namespace]):
    c=torch.load(HERE/'weights/jaccard_index_value=0.9229.ckpt',map_location='cpu',weights_only=True)
wrapped=SegmentationModel(args=SimpleNamespace(model='Unet'))
wrapped.load_state_dict(c['state_dict'],strict=True);wrapped.eval();del c
rgb=np.array(Image.open(HERE/'sources/porto-heat/map.png'))
legend=np.array(Image.open(HERE/'sources/porto-heat/legend-05.png'))
mean=torch.tensor([.485,.456,.406])[None,:,None,None];std=torch.tensor([.229,.224,.225])[None,:,None,None]
tile=torch.from_numpy(rgb[500:756,500:756].copy()).permute(2,0,1).float()[None]
lg=torch.from_numpy(legend.copy()).permute(2,0,1).float()[None]
lg=torch.nn.functional.interpolate(lg,size=(256,256),mode='bilinear',align_corners=False,antialias=False)
tile=(tile/255-mean)/std;lg=(lg/255-mean)/std
report={}
try:
    wrapped.test_step({'map_img':tile,'legend_img':lg,'GT':tile},0)
    report['stock_test_step']='Unexpectedly succeeded'
except Exception as e:
    report['stock_test_step']={'error_type':type(e).__name__,'error':str(e),'reason':'Upstream test_step hard-codes .cuda()'}
with torch.inference_mode():
    a=torch.softmax(wrapped.model(tile,lg),dim=1)[0,1].numpy()
    wrapped.model.to(memory_format=torch.channels_last)
    b=torch.softmax(wrapped.model(tile.contiguous(memory_format=torch.channels_last),lg.contiguous(memory_format=torch.channels_last)),dim=1)[0,1].numpy()
report['channels_last_max_probability_difference']=float(np.abs(a-b).max())
report['channels_last_binary_disagreements_0333']=int(((a>=.333)!=(b>=.333)).sum())
assert np.allclose(a,b,atol=1e-5,rtol=1e-5)
spec=importlib.util.spec_from_file_location('upstream_patching',HERE/'uiuc-pipeline/src/patching.py')
patching=importlib.util.module_from_spec(spec);spec.loader.exec_module(patching)
cases=[]
for h,w in [(256,256),(257,513),(1758,1213),(1668,1155),(1584,2448)]:
    ys=starts(h);xs=starts(w);hh=ys[-1]+256;ww=xs[-1]+256
    original=np.arange(hh*ww,dtype=np.float32).reshape(hh,ww)
    patches=np.zeros((1,len(ys),len(xs),1,256,256),np.float32)
    for ri,y in enumerate(ys):
        for ci,x in enumerate(xs):patches[0,ri,ci,0]=original[y:y+256,x:x+256]
    actual=patching.unpatch_img(patches,[1,hh,ww],overlap=64,mode='discard')[0]
    assert np.array_equal(original[:h,:w],actual[:h,:w])
    cases.append({'source':[h,w],'padded':[hh,ww],'source_pixels_preserved':h*w})
report['upstream_stitch_agreement_cases']=cases
report['passed']=True
(HERE/'adapter-verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
