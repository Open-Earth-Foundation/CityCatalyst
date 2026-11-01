"""Run original LOAM metadata stages serially; explicit unused GDAL gate."""
import sys, os, types, multiprocessing, time, json, copy
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
os.environ['MPLCONFIGDIR']=str(HERE/'cache'/'matplotlib')
os.environ['OMP_NUM_THREADS']='1'
os.environ['OPENBLAS_NUM_THREADS']='1'
os.environ['MKL_NUM_THREADS']='1'
sys.path.insert(0,str(HERE/'upstream'))

class Result:
    def __init__(self,fn,args):self.fn,self.args=fn,args
    def get(self,*a,**k):return [self.fn(*copy.deepcopy(arg)) for arg in self.args]
class SerialPool:
    def __init__(self,*a,**k):pass
    def __enter__(self):return self
    def __exit__(self,*a):pass
    def starmap_async(self,fn,args,*a,**k):return Result(fn,args)

def unavailable(*args,**kwargs):
    raise RuntimeError('Automatic map-area segmentation is disabled; source-derived bounds are mandatory.')

def main():
    import argparse
    p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('--trade-off',type=int,default=6);a=p.parse_args()
    multiprocessing.Pool=SerialPool
    # This module is imported eagerly upstream but used only for automatic map bounds.
    gate=types.ModuleType('area_json_generator');gate.json_generator=unavailable
    sys.modules['area_json_generator']=gate
    import cv2
    cv2.setNumThreads(1)
    import metadata_preprocessing as mp
    mp.multiprocessing_setting=lambda:None
    dst=HERE/'intermediate'/a.name;dst.mkdir(parents=True,exist_ok=True)
    t=time.perf_counter()
    mp.metadata_preprocessing(str(HERE/'inputs'/f'{a.name}.tif'),str(HERE/'inputs'/f'{a.name}.json'),str(HERE/'inputs'/f'{a.name}-bound.json'),str(dst).replace('\\','/')+'/',False,1,a.trade_off)
    (dst/'success.json').write_text(json.dumps({'seconds':time.perf_counter()-t,'trade_off':a.trade_off,'workers':1}),encoding='utf-8')
    print('PREPROCESS_SUCCESS',time.perf_counter()-t,flush=True)

if __name__=='__main__':main()
