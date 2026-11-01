import json,datetime,hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent

def f(v,n=2):return 'undefined' if v is None else f'{v:.{n}f}'

def main():
    m=json.loads((HERE/'metrics.json').read_text());cfg=json.loads((HERE/'frozen-config.json').read_text())
    inspection=json.loads((HERE/'checkpoint-inspection.json').read_text())
    checks=json.loads((HERE/'adapter-verification.json').read_text())
    p=m['porto_pooled']['all'];s=m['scope']
    inundation=[v['foreground_union']['iou'] for k,v in m['layers'].items() if k.startswith('richfield-inundation-') and v['status']=='succeeded']
    prior=m['layers'].get('richfield-prioritization-score',{}).get('macro_class_iou')
    lines=[
      '# UIUC CriticalMAAS / Golden-Muscat pretrained trial',
      '',f'Generated {datetime.datetime.now(datetime.timezone.utc).isoformat()}.',
      '',f'**Execution completed: {s["succeeded"]}/11 layers succeeded, {s["failed"]} failed, {s["not attempted"]} not attempted.** Success means installation/inference/export/evaluation completed, not an accuracy acceptance decision.',
      '',f'Across the six Porto hazards, exact class agreement is **{f(p["exact_common_pct"])}% on common cells** and **{f(p["exact_all_pct"])}% across all eligible cells**, with **{f(p["missing_pct"])}% missing predictions**. The raw denominator is {p["correct"]} correct out of {p["eligible"]} eligible hazard-cells ({p["common"]} common).',
      '',f'**High-risk recall is {f(p["high_recall_pct"])}% ({p["high_true_positive_cells"]}/{p["high_reference_cells"]} eligible high-risk hazard-cells).** This configuration materially under-recovers Porto high-risk classes. Exact-class averages alone conceal this failure; the confusion matrix below separates lower-class assignments from missing outputs.',
      '',f'Richfield inundation source-fill IoU ranges from **{f(min(inundation),4)} to {f(max(inundation),4)}** across the four inundation layers. Prioritization has **{f(prior,4)} macro class IoU**. The different render styles produce substantially different results; per-class precision, recall and edge errors are retained below.',
      '', 'These maps/blocks were previously audited and are not a blind test. Porto references are same-author numeric PNG derivatives, not independently authenticated original TIFFs. Richfield scores measure correspondence to PDF fill geometry, not independently validated flood truth. No training, paid services, Docker image, GPU allocation, or external publication was used.',
      '', '## Model identity and availability',
      '', '- Pipeline: https://github.com/DARPA-CRITICALMAAS/uiuc-pipeline at `'+cfg['pipeline_revision']+'`.',
      '- Model: https://github.com/xiyuez2/Darpa_Unet_Release at `'+cfg['model_revision']+'`; the pipeline README explicitly associates this repository with Golden-Muscat.',
      '- Checkpoint: [`jaccard_index_value=0.9229.ckpt`]('+cfg['checkpoint_url']+'), 372,605,901 bytes. SHA-256 `'+cfg['checkpoint_sha256']+'` matches the Git LFS pointer.',
      f'- Strict parameter load succeeded: {inspection["parameters"]:,} parameters; checkpoint epoch {inspection["epoch"]}, step {inspection["global_step"]}; first convolution {inspection["first_kernel_shape"]}, output convolution {inspection["output_kernel_shape"]}.',
      '- This is the public release checkpoint identified above. It has not been established byte-identical to the separately named `golden_muscat-0.3.ckpt` expected by the newer pipeline wrapper.',
      '- Downloaded upstream files are preserved unmodified. `infer.py` imports their actual `UNet` class; it does not substitute a color classifier or another model.',
      '', '## Installation, execution and CPU adaptation',
      '', 'A dedicated Python 3.12 virtual environment lives in `.venv`; dependencies and caches are confined to this trial directory. `requirements-lock.txt`, `versions.json`, `logs/install*.log`, and `logs/checkpoint-download.log` retain installation evidence. The required checkpoint was downloaded directly; the 13.5 GB Docker image was not downloaded.',
      '', 'At inspection the RTX 4070 Ti had 12,282 MiB total, 10,560 MiB used, and 1,437 MiB free. No GPU was acquired or used. The CPU run uses float32, four PyTorch intra-op threads, one inter-op thread, batch one, and channels-last memory layout. Other processes were not killed or modified.',
      '', 'The unmodified pipeline is CUDA-specific, and the released `SegmentationModel.test_step` explicitly calls `.cuda()`. A real attempt is recorded in `adapter-verification.json`: '+str(checks['stock_test_step'])+'. The underlying PyTorch U-Net runs on CPU; the adapter calls this unmodified network directly and applies the pipeline decoding. Thus this is a **CPU-portability adaptation of the pretrained segmentation component**, not a successful stock full-pipeline CPU invocation.',
      '', f'The source-pixel check found maximum channels-last/contiguous foreground-probability difference {checks["channels_last_max_probability_difference"]:.9g}, with {checks["channels_last_binary_disagreements_0333"]} binary disagreements at 0.333 for the checked patch. Five edge/padding shapes agree with upstream discard stitching. Every production source pixel was verified covered exactly once after overlap discard.',
      '',f'Inference runtime, summed across completed layer runs: **{m["runtime"]["inference_seconds_total"]:.1f} seconds ({m["runtime"]["inference_seconds_total"]/60:.1f} minutes)**; {m["runtime"]["model_forward_calls"]:,} actual model forward calls. Evaluation: {m["runtime"]["evaluation_seconds"]:.1f} seconds. Dependency installation: **{m["runtime"]["dependency_installation_tool_reported_seconds"]:.2f} seconds**, summing the uv-reported resolution, preparation/download, and install phases (individual phases retained in metrics). Checkpoint transfer took approximately 9 seconds according to curl. Per-layer timestamps/runtimes are in `predictions/*/run.json`. These installation stages were not measured with a single combined stopwatch.',
      '', '## Frozen interface and aids',
      '', '- `frozen-config.json` SHA-256: `'+m['config_sha256']+'`. It was saved before real map inference/reference evaluation and is checked on every run. No thresholds or legend patches were selected using reference values.',
      '- Each 256 x 256 map tile and its resized 256 x 256 RGB legend sample are independently divided by 255 and normalized with ImageNet mean `[0.485, 0.456, 0.406]` and standard deviation `[0.229, 0.224, 0.225]`. U-Net concatenates them to six channels. Legend crops contain the actual source swatch pixels, including rendering/compositing artifacts.',
      '- The primary pipeline interface uses RGB map bands and tensor-bilinear legend resize. The separate old HDF5 helper writes OpenCV BGR and its test step thresholds an unnormalized foreground logit; that inconsistent standalone decoding is not used here. The selected interpretation is the pipeline softmax foreground probability and 0.333 confidence cutoff.',
      '- Patches overlap by 64 pixels. Inner 32-pixel margins are discarded. Right/bottom black padding is sized to `256 + N*192` so the entire image is covered; this fixes the wrapper padding mismatch rather than leaving edge strips unprocessed. Whole figures/pages are inferred, including furniture and legend regions; no attractive subregion was selected.',
      '- The highest foreground probability wins between legends; later legends win exact ties, as in the pipeline. If the winning probability is below 0.333 the output stays unknown (label 0). Raw per-legend binary masks and probabilities are saved before arbitration; overlapping-mask counts are retained. Probability archives use float16 for storage; decisions are made in float32 and authoritative label PNGs are lossless.',
      '- Porto uses the complete native embedded figure per hazard (roughly 1213 x 1758, with flood/drought size differences). Ten source legend samples map to bin midpoints 0.05, 0.15, ..., 0.95. Cell means require >=3 predicted source pixels, with no minimum fraction rule, interpolation, numeric-reference mask, or unknown-to-zero conversion.',
      '- Porto uses existing source tick fitting and municipality-domain assistance (`fit_ticks`/`map_domain`), grid origin `(462000, 6692000)`, EPSG:31982, 250 m cells, and the existing 3 km hash blocks. The municipal mask is applied only to grid aggregation, not to the saved full model predictions. Printed tick labels and document layout were already manually interpreted. Georeferencing is reused, not independently solved by Golden-Muscat.',
      '- Richfield is rendered at 144 dpi (2 pixels per PDF point), with manually identified legend interiors and the embedded GeoPDF transform. The scoring domain is the entire GeoPDF map frame. The model receives the full rendered page. Source legend and coordinate assistance are disclosed; automatic legend/layout extraction was not tested.',
      '- The upstream documentation states GPU requirement and a disabled/broken GeoPackage export. This trial saves full raw masks, georeferenced label GeoTIFFs, and Porto cell GeoJSONs using existing helpers. No claim is made about successful automatic GeoPackage vector export.',
      '', '## Porto results: common 250 m contract',
      '', 'Classes use literal thresholds 0.2/0.4/0.6/0.8. Eligibility requires >=15 valid reference pixels. Missing predictions are unsuccessful in exact-all. Bias and MAE cover common cells only. Counts are hazard-cells, so the same spatial cell in different hazards is counted separately.',
      '', '| Hazard | Eligible | Common | Correct | Missing | Exact common % | Exact all % | Bias | MAE |',
      '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for l in cfg['layers']:
        if l['dataset']!='porto':continue
        e=m['layers'][l['id']]
        if e['status']!='succeeded':lines.append(f'| {l["hazard"]} | {e["status"]} | | | | | | | |');continue
        a=e['metrics']['all']
        lines.append(f'| {l["hazard"]} | {a["eligible"]} | {a["common"]} | {a["correct"]} | {a["missing"]} | {f(a["exact_common_pct"])} | {f(a["exact_all_pct"])} | {f(a["bias"],4)} | {f(a["mae"],4)} |')
    lines+=['', '| Hazard | High TP / reference high | High recall % | High TP / predicted high common | High precision % | Zero-reference / predicted | Low-reference / predicted |',
      '|---|---:|---:|---:|---:|---:|---:|']
    for l in cfg['layers']:
        if l['dataset']!='porto' or m['layers'][l['id']]['status']!='succeeded':continue
        a=m['layers'][l['id']]['metrics']['all']
        lines.append(f'| {l["hazard"]} | {a["high_true_positive_cells"]}/{a["high_reference_cells"]} | {f(a["high_recall_pct"])} | {a["high_true_positive_cells"]}/{a["predicted_high_common_cells"]} | {f(a["high_precision_common_pct"])} | {a["predicted_zero_reference_cells"]}/{a["predicted_cells"]} ({f(a["predicted_zero_reference_pct"])}%) | {a["predicted_low_reference_cells"]}/{a["predicted_cells"]} ({f(a["predicted_low_reference_pct"])}%) |')
    lines+=['','The zero-reference/low-reference columns describe output coverage; reference absence does not independently prove a prediction false. High-risk recall uses all eligible reference-high cells, including missing predictions in its denominator. High-risk precision is restricted to comparable cells. Full per-layer development/validation/test splits, pooled counts and cell-level CSVs are in `metrics.json` and `evaluation/`; these splits are bookkeeping, not a new blind holdout.',
      '', '## Richfield source fidelity',
      '', 'The oracle is existing direct PDF vector extraction, inverse-projected through the GeoPDF transform and rasterized at the same 2 pixels/point. Both fill (`f`) and fill-and-stroke (`fs`) paths are included through the recovered vectors. The raster prediction sees labels, line strokes, and transparency; the oracle is pre-label/stroke fill geometry. This difference is not silently removed.',
      '', '| Layer/class | IoU | Precision | Recall | TP / FP / FN pixels | Symmetric edge mean / p95 (m) |',
      '|---|---:|---:|---:|---|---|']
    for l in cfg['layers']:
        if l['dataset']!='richfield':continue
        e=m['layers'][l['id']]
        if e['status']!='succeeded':lines.append(f'| {l["name"]} | {e["status"]} | | | | |');continue
        for label,a in e['classes'].items():
            ed=a['edge_errors']
            lines.append(f'| {l["name"]}: {label} | {f(a["iou"],4)} | {f(a["precision"],4)} | {f(a["recall"],4)} | {a["true_positive_pixels"]} / {a["false_positive_pixels"]} / {a["false_negative_pixels"]} | {f(ed.get("mean_symmetric_m"))} / {f(ed.get("p95_m"))} |')
    lines+=['','Edge errors are bidirectional distances between raster boundary pixel centers at approximately 3.81 m/pixel; means, medians, p95, maxima, directed means, and boundary sample counts are retained. These are raster source-fidelity errors and must not be confused with the much tighter vector serialization roundtrip. Prioritization also retains per-class results rather than substituting a foreground-union score.',
      '', '## Porto class confusion, pooled over hazards',
      '', 'Rows are reference classes; columns are predicted classes plus missing predictions. Counts are hazard-cells; the last column is included in exact-all failure counts.',
      '', '| Reference class | Very low | Low | Medium | High | Very high | Missing |',
      '|---|---:|---:|---:|---:|---:|---:|']
    for label,row in zip(['Very low','Low','Medium','High','Very high'],p['confusion_matrix_with_missing']):
        lines.append('| '+label+' | '+' | '.join(str(x) for x in row)+' |')
    lines+=[
      '', '## Coverage and runtime inventory',
      '', '| Layer | Page | Status | Inference seconds |', '|---|---:|---|---:|']
    for l in cfg['layers']:
        e=m['layers'][l['id']];lines.append(f'| {l["id"]} | {l["page"]} | {e["status"]} | {f(e["run"].get("seconds"),1)} |')
    lines+=['', '## Evidence and rerun',
      '', '- `overlay.html`: standalone aligned original/model controls for the existing Porto heat crop and Richfield Wood Lake crop, plus exact-all bars. `visuals/` contains the original, transparent model mask, composited overlay, and full-map overview PNGs; `alignment.json` records unchanged crop coordinates.',
      '- `sources/<layer>/`: complete input map/page and every actual source legend crop. `predictions/<layer>/`: full label image, raw binary mask/probability per legend, confidence, overlap counts, run timestamps, and label hashes.',
      '- `evaluation/<layer>/`: source-aligned GeoTIFFs, metric records, Porto 250 m cell GeoJSON/CSV, and Richfield vector-oracle label masks. `metrics.json` is the consolidated machine-readable result.',
      '- `adapter-verification.json`, `checkpoint-inspection.json`, `output-verification.json`, `versions.json`, `requirements-lock.txt`, `artifacts-sha256.json`, and `logs/` preserve model, compatibility, serialized pixel/coordinate checks, installation, and inference evidence.',
      '', 'From PowerShell 7, with profiles disabled:',
      '', '```powershell',
      "$trial = 'C:/Users/WBW/Documents/geo-map-recovery-20261028/model-trials/uiuc'",
      "$env:PYTHONDONTWRITEBYTECODE = '1'",
      '& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/infer.py"',
      '& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/evaluate.py"',
      '& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/verify_outputs.py"',
      '& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/visualize.py"',
      '& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/report.py"',
      '```',
      '', '`infer.py` resumes by skipping completed layers whose config hash matches. To force recomputation, rename a completed layer directory inside this exclusive trial directory, then invoke the same command (or use `--only porto-heat porto-flood`). Keep the frozen config and source crops unchanged. `rerun.ps1` runs the stages and captures fresh logs.',
      '', 'To reconstruct the environment: `uv venv --python 3.12 "$trial/.venv"`, then `uv pip install --python "$trial/.venv/Scripts/python.exe" -r "$trial/requirements-lock.txt"`, with `UV_CACHE_DIR`, `TMP`, and `TEMP` set inside this trial directory. The two pinned repositories and direct checkpoint URL above are the exact upstream inputs. `prepare.py` reconstructs the source inputs/config from read-only helpers, but regenerates the freeze timestamp; do this only for a new run, not when resuming saved predictions.',
      '', '## Limitations and decision',
      '', 'This execution establishes that the public pretrained Golden-Muscat network can be installed and run over both documents through a CPU portability adapter. It does not establish a turnkey stock pipeline, independent georeferencing, or independent hazard accuracy. Results apply to this checkpoint, RGB pipeline interface, source swatch selection, fixed cutoff, and rendering scales. Geological polygon segmentation is being transferred without fine-tuning to these risk-map styles. Low-confidence pixels remain unknown; legend ambiguity and basemap look-alikes can still produce false classifications.',
      '', 'Use the reported source-fidelity and literal-class results to assess suitability. Installation success and the checkpoint filename’s training-era Jaccard number are not evidence that recovered hazard values are correct on these documents. No release/production-readiness gate was supplied or asserted.',
      '']
    (HERE/'report.md').write_text('\n'.join(lines),encoding='utf-8')
    files=[]
    for p in HERE.rglob('*'):
        if not p.is_file() or any(x in p.parts for x in ['.venv','.uv-cache','.git','tmp']):continue
        if p.name=='artifacts-sha256.json':continue
        with p.open('rb') as f_:h=hashlib.file_digest(f_,'sha256').hexdigest()
        files.append({'path':p.relative_to(HERE).as_posix(),'bytes':p.stat().st_size,'sha256':h})
    (HERE/'artifacts-sha256.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
    print('Saved report.md and',len(files),'artifact hashes')

if __name__=='__main__':main()
