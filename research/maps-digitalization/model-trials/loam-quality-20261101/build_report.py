"""Report only measured completed outputs; keep macro/micro and resolutions explicit."""
import sys,json,hashlib,datetime,subprocess,platform
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];OLD=HERE.parent/'loam'
def sha(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def fmt(v):return 'undefined' if v is None else f'{v:.2f}'
def main():
    m=json.loads((HERE/'metrics.json').read_text());run=json.loads((HERE/'run-status.json').read_text());valid=json.loads((HERE/'validation.json').read_text());config=json.loads((HERE/'frozen-config.json').read_text())
    manifests=json.loads((HERE/'input-manifest.json').read_text());primary=[x for x in manifests if not x.get('control')]
    a=m['porto_macro_test']['previous'];b=m['porto_macro_test']['mode0']
    rp=m['richfield']['richfield-prioritization-score']['methods'];r0=rp['previous72']['grid10m']['micro']['iou'];r1=rp['mode0']['grid10m']['micro']['iou']
    checkpoints=[json.loads(p.read_text()) for p in (HERE/'predictions').glob('*/complete.json')]
    gpu=max(c['peak_cuda_allocated_mib'] for p in checkpoints for c in p['classes']);reserved=max(c['peak_cuda_reserved_mib'] for p in checkpoints for c in p['classes'])
    stages=[s for x in run['layers'].values() for s in x['stages']]
    peak=max(x['peak_process_tree_mib'] for x in stages);free=min(x['minimum_free_host_mib'] for x in stages)
    lines=[
    '# LOAM mode0 quality rerun — 2026-11-01',
    '',
    '**Completed all 11 requested layers and all five 72 DPI controls.** The pinned official paper checkpoint ran in CUDA float32 with canonical 1024×1024 tiles. No shortened strips, mixed precision, mode downgrade, retraining, or reference-based prediction tuning was used.',
    '',
    f"**Porto six-hazard macro exact-and-present on the unchanged 10m test locations: {a['exact_all_pct']:.2f}% → {b['exact_all_pct']:.2f}% ({b['exact_all_pct']-a['exact_all_pct']:+.2f} percentage points). Macro missing: {a['missing_pct']:.2f}% → {b['missing_pct']:.2f}%.** Full per-hazard and pooled counts follow. Improvements and regressions are not a claim of decision-ready hazard reconstruction.",
    f"**The highest-accuracy supported mode did not deliver an overall quality upgrade on these maps.** Richfield prioritization common10m class-micro IoU changed from {100*r0:.2f}% to {100*r1:.2f}% ({100*(r1-r0):+.2f}pp). Inundation overlap became nonzero but remains low, with substantial source-background false positives. This conclusion preserves the negative result; no settings were retuned to the reference.",
    '',
    '![Measured comparison](evidence/quality-comparison.png)',
    '',
    '## Execution identity and actual interface',
    '',
    f"- Read-only upstream `../loam/upstream`, commit `{config['upstream_revision']}`; unchanged before/after SHA-256 checks for source and prior aids. No old trial files, repository files, or checkpoint were edited.",
    f"- Original paper checkpoint `../loam/checkpoint_epoch14.pth`, SHA-256 `{config['checkpoint_sha256']}`. Original LOAM architecture (31,061,202 parameters), mask values `[0,1]`, strict load reports all keys matched.",
    '- The pinned upstream README explicitly defines **0 as highest accuracy / lowest efficiency** and 6 as highest efficiency. `metadata_preprocessing.py` enables recoloring at modes ≤1 and step5 / text matching at mode0. Actual mode0 output channels were generated; this was not a flag-only rerun of old bitmaps.',
    '- Actual upstream bitmap worker mapping: `[v7, v4v, c0_x, c1_x, crop_blackregion, overall_boundary_candidate, rc_v0]`. The stock worker creates every 1024-square tile, applies OpenCV grayscale conversion, binarizes channels 0/1/4, and pads bottom/right with zeros. `BasicDataset.preprocess(scale=1)` performs normalization. The original network receives 32 color and 9 map metadata values; output uses the original same-size bilinear interpolation and two-class argmax.',
    '- All full figures/pages are tiled from origin (0,0), stride1024, batch1. No crop-dependent context reduction or overlap. CPU float32 softmax probabilities are saved losslessly. Overlapping accepted classes use highest foreground probability; exact ties select lower legend index; no accepted class is unknown255. This arbitration is unchanged from the prior trial.',
    '- Manual source-derived bounds and legend aids are retained: ten native Porto legend swatches and Richfield sidebar source symbols. Richfield144DPI uses whole 2448×1584 pages and geometrically scaled source legend coordinates. Automatic map-area segmentation/GDAL polygon-output integration is bypassed with explicit source bounds; its eagerly imported area generator is fail-closed. Source-only preprocessing and network inference never import the evaluation reference PNGs or recovered in-map vectors.',
    '- Original preprocessing algorithm and upstream source are unmodified. A serial Pool shim deep-copies each job’s arguments to preserve process isolation, and the upstream CPU-count override is disabled. All mode0 stages, including recoloring and dynamic thresholds, execute. Manual swatches contain little/no text; an empty text-match candidate list is an upstream data outcome, not a skipped mode0 stage.',
    '',
    '## Environment and resources',
    '',
    '- New isolated `.venv`: Python3.11.15, PyTorch2.5.1+cu124 / torchvision0.20.1+cu124, NumPy1.26.4 and upstream OpenCV4.6.0.66. Prior `.venv` is untouched. This is a compatibility adaptation from the original Python3.9/PyTorch1.13 environment, validated by strict load and completed inference; it is not a byte-identical paper environment.',
    '- NVIDIA RTX4070Ti, 12,282MiB total. Initial observation: 10,467MiB free GPU and 3,663,964KiB free physical host RAM. No host configuration changes, process killing, paid calls, contacts, training, commits, or PRs.',
    f'- Full FP32, TF32 disabled, CUDA/cuDNN defaults with benchmarking disabled; deterministic-algorithm enforcement was not enabled, and bitwise cross-device reproducibility is not claimed. Observed peak GPU allocation {gpu:.1f}MiB; reserved {reserved:.1f}MiB. The full canonical probe passed (see `evidence/canonical-cuda-probe.json`). No VRAM fallback was needed.',
    f'- Serial preprocessing was still memory-heavy: sampled own-process-tree peak {peak:.1f}MiB; lowest sampled free host RAM {free:.1f}MiB. Paging/other host load can affect timing; serial workers did not guarantee a4GiB resident cap. Every stage completed without suppressing an allocation failure. Metrics are quality measurements, not resource-efficiency rankings.',
    '- Atomic exclusive `../gpu.lock` acquired per inference process and removed in `finally`; validation confirms this run owns no remaining lock. Other owners are never removed. Sampled memory peaks are observations, not guarantees against shorter spikes.',
    '',
    '## Frozen scoring contract and limits',
    '',
    f"Configuration frozen at {config['frozen_utc']}, SHA-256 `{sha(HERE/'frozen-config.json')}`. No prediction settings changed after scoring. Extra72DPI controls were predeclared. Evaluation is a separate process.",
    '',
    f"The existing `benchmark_10m_all.py` (SHA-256 `{m['contract_script_sha256']}`) is imported unchanged for `reference_grid`, `sample`, `scores`, and `save_grid`. Porto remains EPSG:31982, originE462000/N6692000, shape4200×3800, 10m centers. Reference is the native reference pixel containing the center; valid means value!=255. Prediction sampling, municipal domain, literal risk thresholds .2/.4/.6/.8 and existing physical3km SHA256 test blocks are unchanged. **No250m averaging.** Every previous LOAM grid matches the saved TIFF pixel-for-pixel; all integer counts and confusion matrices match exactly, and new eligible counts match exactly. The initial evaluator stopped on last-bit MAE/bias float differences (~7e-18 for flood); these are retained in `prior_float_rounding_differences` and checked with rtol1e-13/atol1e-15. No contract or prediction changed; `logs/evaluate-first.log` preserves that failed exact-float assertion.",
    '',
    'Porto references are same-author indexed PNG derivatives; original TIFF provenance is not authenticated. Native source pixels are roughly30m, so repeated10m samples add no information or independent observations. This is retrospective, not blind evaluation. Missing predictions, incorrect-present predictions, and predictions unsupported by a reference value are separate. Unsupported reference does not establish a false positive. MAE/bias are on common valid locations only; exact-all counts missing as unsuccessful.',
    '',
    'Richfield evaluation calls `richfield.source_shapes` directly on the source PDF, including both f/fs fills, clipping, winding rules and draw order, with the embedded GeoPDF transform. It compares against pre-label/stroke source geometry, not independent flood truth. Native-resolution pixel-center metrics, continuous page-area metrics and common10m-center metrics remain separate. Source-background false positives are known absence of this PDF layer, not the Porto concept of an unsupported reference. No fitted alignment or reference-derived prediction masks.',
    '',
    '## Porto: same10m test centers',
    '',
    '| Hazard | Eligible | Previous exact-all % | Mode0 exact-all % | Δ pp | Previous missing % | Mode0 missing % | Incorrect present | Unsupported ref / predicted |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for name,r in m['porto'].items():
        x=r['methods']['previous']['test'];y=r['methods']['mode0']['test']
        lines.append(f"| {name[6:]} | {y['eligible']:,} | {x['exact_all_pct']:.2f} | {y['exact_all_pct']:.2f} | {y['exact_all_pct']-x['exact_all_pct']:+.2f} | {x['missing_pct']:.2f} | {y['missing_pct']:.2f} | {y['incorrect_present']:,} | {y['predicted_without_reference']:,} / {y['predicted']:,} |")
    lines+=['',f"Six-hazard **macro** exact-all {a['exact_all_pct']:.4f}% → {b['exact_all_pct']:.4f}%; missing {a['missing_pct']:.4f}% → {b['missing_pct']:.4f}%; common-only MAE {a['mae']:.6f} → {b['mae']:.6f}; high-risk recall {a['high_recall_pct']:.4f}% → {b['high_recall_pct']:.4f}%.",'']
    for method,t in m['porto_pooled_test'].items():
        lines.append(f"**Pooled {method}**: {t['correct']:,}/{t['eligible']:,} exact-and-present ({t['exact_all_pct']:.4f}%); {t['missing']:,} missing; {t['incorrect_present']:,} incorrect-present; {t['predicted_without_reference']:,}/{t['predicted']:,} predictions without reference support. These are pooled counts, not the macro average.")
        lines.append('')
    lines+=['','## Richfield: direct PDF geometry, same10m centers','','| Layer | Previous72DPI micro-IoU % | Mode0 144DPI micro-IoU % | Δ pp | Mode0 precision % | Mode0 recall % | Mode0 continuous-area micro-IoU % |','|---|---:|---:|---:|---:|---:|---:|']
    for name,r in m['richfield'].items():
        x=r['methods']['previous72']['grid10m']['micro'];y=r['methods']['mode0']['grid10m']['micro'];c=r['methods']['mode0']['continuous_page_geometry']['micro']
        lines.append(f"| {name[10:]} | {fmt(100*x['iou'])} | {fmt(100*y['iou'])} | {100*(y['iou']-x['iou']):+.2f} | {fmt(None if y['precision'] is None else 100*y['precision'])} | {fmt(None if y['recall'] is None else 100*y['recall'])} | {fmt(100*c['iou'])} |")
    lines+=['','Primary Richfield comparison changes both render resolution and mode/tile context. It cannot assign all improvement to mode0. Below, the72DPI control uses byte-identical previous source TIFF/legend/bounds files. Each row uses the same72DPI source pixel centers; there is no cross-resolution averaging.','','| Layer | Previous mode6/strips72DPI micro-IoU % | Mode0/full1024 at72DPI micro-IoU % | Δ pp | Primary mode0 at144DPI native-center micro-IoU % (different resolution) |','|---|---:|---:|---:|---:|']
    for name,r in m['richfield72_controls'].items():
        x=r['methods']['previous72']['source_pixel_centers']['micro'];y=r['methods']['mode0']['source_pixel_centers']['micro'];main=m['richfield'][name.removesuffix('-72dpi-control')]['methods']['mode0']['source_pixel_centers']['micro']
        lines.append(f"| {name[10:].removesuffix('-72dpi-control')} | {100*x['iou']:.2f} | {100*y['iou']:.2f} | {100*(y['iou']-x['iou']):+.2f} | {100*main['iou']:.2f} |")
    lines+=['','## Runtime and preserved artifacts','','| Layer | Preprocessing s | Inference stage s | Full tiles | Accepted raw pixels |','|---|---:|---:|---:|---:|']
    for meta in manifests:
        name=meta['name'];st=run['layers'][name];done=json.loads((HERE/'predictions'/name/'complete.json').read_text());pre=json.loads((HERE/'intermediate'/name/'success.json').read_text())['seconds'];inf=sum(x['seconds'] for x in st['stages'] if x['stage']=='inference')
        count=meta['size'][0]*meta['size'][1]-done['unknown_pixels']
        lines.append(f"| {name} | {pre:.2f} | {inf:.2f} | {done['tiles']} | {count:,} |")
    lines+=['','Preprocessing column uses the wrapper internal timer; inference column uses scheduler process wall time, including startup/postprocessing. Initial heat preprocessing and the one-tile canonical probe were outside the scheduler. `run-status.json` preserves per-stage sampled memory, exact commands and timestamps. No aborted or partial outputs are counted as completed.',
    '',
    '- `metrics.json`: all/test Porto confusion/counts, per-class Richfield pixel/grid/continuous scores, separate macro and pooled Porto results,72DPI controls.',
    '- `predictions/<layer>/`: full `labels.png`, per-class binary masks and float32 probability arrays, overlap counts, per-class bitmap hashes and completion records.',
    '- `evaluation/porto/<hazard>/{previous,mode0}-10m.tif`:12 georeferenced10m TIFFs. `evaluation/richfield/<layer>/{source,previous72,mode0}-10m.tif`:30 TIFFs including controls; EPSG:26915, unchanged GeoPDF source transform.',
    '- `inputs/`: full native Porto /144DPI Richfield sources, scaled legend samples and bounds; exact72DPI controls. `intermediate/` and `bitmaps/`: complete mode0 metadata and actual normalized-input source tiles.',
    '- [Interactive aligned overlays](overlay.html), focused and full PNGs in `evidence/`, and `evidence/alignment.json`. The focus crops were inherited source-only geographical/page locations, not selected to maximize scores. Previous masks are nearest-neighbor enlarged only for display.',
    f"- `validation.json`: {len(valid['layers'])} complete runs, {len(valid['tiffs'])} georeferenced10m TIFFs, unchanged frozen config, strict loads, full shapes, finite probabilities, exact accepted-winner arbitration, unchanged old source hashes, released own GPU lock. `artifact-hashes.json`, `read-only-input-hashes.json`, `requirements-lock.txt`, `logs/`, adapter diffs, `commands.ps1` preserve reproduction evidence.",
    '',
    '## Scope boundary',
    '',
    'This execution assignment reran LOAM. DIGMAPPER was not executed or counted as LOAM success; its separate existing trial remains outside this directory. No claim is made about new DIGMAPPER availability or accuracy by this LOAM run. The model was trained for geological polygon extraction; these flood/risk maps are a different domain. All quality statements above are measured on the specified existing sources and evaluation definitions.',
    '']
    (HERE/'report.md').write_text('\n'.join(lines),encoding='utf-8')
    source_files=[ROOT/'inputs'/'porto-alegre-arvc.pdf',ROOT/'inputs'/'Richfield_FloodRiskPrioritization.pdf',ROOT/'inputs'/'arvc-manifest.json',ROOT/'inputs'/'porto-boundary.json']+list((ROOT/'inputs').glob('arvc_off_risk_*_2050.png'))
    prov={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'python':sys.version,'platform':platform.platform(),'sources':{str(p):sha(p) for p in source_files},'input_artifacts':{str(p.relative_to(HERE)):sha(p) for p in (HERE/'inputs').iterdir() if p.is_file()},'report_sha256':sha(HERE/'report.md'),'mode0_primary_layers':11,'72dpi_controls':5,'new_digmapper_execution':False,'config_sha256':sha(HERE/'frozen-config.json')}
    (HERE/'provenance.json').write_text(json.dumps(prov,indent=2),encoding='utf-8')
    print('REPORT_SAVED',len(lines),'lines',flush=True)
if __name__=='__main__':main()
