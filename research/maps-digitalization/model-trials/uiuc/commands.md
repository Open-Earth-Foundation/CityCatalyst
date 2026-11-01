# Reproduction commands and execution evidence

All shell calls used PowerShell 7 with profiles disabled (`exec_command login:false`). Verified shell: PowerShell 7.6.9 at `C:/Program Files/PowerShell/7/pwsh.exe`. All Python entry points use `-X utf8`. No agents were spawned.

```powershell
$trial = 'C:/Users/WBW/Documents/geo-map-recovery-20261028/model-trials/uiuc'
$env:GIT_LFS_SKIP_SMUDGE = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:UV_CACHE_DIR = "$trial/.uv-cache"
$env:TMP = "$trial/tmp"
$env:TEMP = "$trial/tmp"
New-Item -ItemType Directory -Path "$trial/tmp" -Force | Out-Null
git clone --depth 1 https://github.com/xiyuez2/Darpa_Unet_Release.git "$trial/Darpa_Unet_Release"
git clone --depth 1 https://github.com/DARPA-CRITICALMAAS/uiuc-pipeline.git "$trial/uiuc-pipeline"
git -C "$trial/Darpa_Unet_Release" rev-parse HEAD
# 7f6f6450108e43df83a1db2a51b6c7b893c65f11
git -C "$trial/uiuc-pipeline" rev-parse HEAD
# 9d90bc78e86c5c33b539e47cb1c79c134573c287

uv venv --python 3.12 "$trial/.venv"
uv pip install --python "$trial/.venv/Scripts/python.exe" torch torchvision numpy pillow scipy pymupdf pyproj shapely rasterio opencv-python
uv pip install --python "$trial/.venv/Scripts/python.exe" pytorch-lightning adamp
uv pip freeze --python "$trial/.venv/Scripts/python.exe"

curl.exe -L --fail --max-time 600 --retry 2 -o "$trial/weights/jaccard_index_value=0.9229.ckpt" 'https://media.githubusercontent.com/media/xiyuez2/Darpa_Unet_Release/7f6f6450108e43df83a1db2a51b6c7b893c65f11/jaccard_index_value%3D0.9229.ckpt'
Get-FileHash -LiteralPath "$trial/weights/jaccard_index_value=0.9229.ckpt" -Algorithm SHA256

& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/prepare.py"
& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/infer.py"
& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/verify_adapter.py"
& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/evaluate.py"
& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/visualize.py"
& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/report.py"
```

The above records the executed installation choices. Use `requirements-lock.txt` to reproduce exact installed versions rather than resolving latest versions. If cloning after upstream advances, fetch and check out the exact commit IDs listed above. Git LFS smudging was disabled; only the explicitly named checkpoint was downloaded. Upstream clone working trees remain clean.

`logs/model-smoke.log` records strict checkpoint loading and real CPU forward passes. `logs/cpu-performance.log` records a small source-independent memory-layout/thread performance probe. The production configuration remains four threads to share the host. `adapter-verification.json` records a real failure from the released CUDA-hardcoded test wrapper and successful CPU core/stitch verification.

`logs/inference.log` records the production sequence. Initial `logs/evaluation-initial.log` scores only the completed heat layer to verify the reporting path; it does not represent final coverage. The final consolidated `metrics.json` and `logs/evaluation.log` supersede this interim inventory. Inference configuration was not changed after any reference evaluation.

The pre-existing read-only PDF interpreter was used only for initial source/legend inspection before the isolated environment was installed. No source files, shared environments, CityCatalyst files, or sibling model-trial files were modified. All generated files are under this directory.
