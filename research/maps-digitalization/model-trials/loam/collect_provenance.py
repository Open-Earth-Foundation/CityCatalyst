"""Hash the exact read-only inputs, source code, references and local adapters."""
import sys,json,hashlib,platform,subprocess,datetime
from pathlib import Path
import importlib.metadata as md
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for a in iter(lambda:f.read(1024*1024),b''):h.update(a)
    return h.hexdigest()
def main():
    files=[HERE/'checkpoint_epoch14.pth',HERE/'frozen-settings.json',HERE/'input-manifest.json',ROOT/'inputs/porto-alegre-arvc.pdf',ROOT/'inputs/Richfield_FloodRiskPrioritization.pdf']
    result={'python':sys.version,'platform':platform.platform(),'collected_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'upstream_commit':subprocess.check_output(['git','-C',str(HERE/'upstream'),'rev-parse','HEAD'],text=True).strip(),
      'upstream_status':subprocess.check_output(['git','-C',str(HERE/'upstream'),'status','--porcelain'],text=True),
      'versions':{x:md.version(x) for x in ['torch','torchvision','numpy','opencv-python-headless','scipy','pillow','pymupdf','shapely','pyproj','rasterio']},
      'sha256':{str(p.resolve()):digest(p) for p in files},
      'readonly_helpers_sha256':{p.name:digest(p) for p in [ROOT/'porto.py',ROOT/'richfield.py',ROOT/'benchmark.py',ROOT/'make_fine_overlay.py',ROOT/'make_visuals.py']},
      'fixed_municipal_domain_sha256':digest(ROOT/'inputs/porto-boundary.json'),
      'evaluation_reference_sha256':{str(p.relative_to(ROOT)).replace('\\','/'):digest(p) for p in [ROOT/'inputs/arvc-manifest.json',*(ROOT/'inputs').glob('arvc_off_risk_*_2050.png'),*(ROOT/'outputs/richfield').glob('*.geojson'),ROOT/'outputs/richfield/validation.json']},
      'adapters_sha256':{p.name:digest(p) for p in HERE.glob('*.py')}}
    (HERE/'provenance.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print('PROVENANCE_SAVED',len(result['evaluation_reference_sha256']),'reference files; upstream clean:',result['upstream_status']=='')
if __name__=='__main__':main()
