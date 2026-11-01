# criticalmaas-uncharted-ta1

个人镜像 / Windows 改造版：基于公开上游 [`DARPA-CRITICALMAAS/uncharted-ta1`](https://github.com/DARPA-CRITICALMAAS/uncharted-ta1) 导入，并补充可重复的 Windows launcher 构建方式。

- 上游导入基线：`7a50dc0cecde38b6c5db9c8f7d01b3e628bcf8b9`（2025-05-07）
- 上游许可证：MIT（本仓库保留上游 LICENSE 与版权声明）
- 本仓库定位：**个人镜像 + Windows 打包/启动适配层**，尽量不改动上游核心算法

## 仓库包含什么

本仓库已导入上游公开源码与说明，包括：

- `tasks/`：共享任务库
- `pipelines/segmentation`
- `pipelines/metadata_extraction`
- `pipelines/point_extraction`
- `pipelines/geo_referencing`
- `pipelines/text_extraction`
- `cdr/`、`cdr_writer/`、`schema/`、`util/`、`data/`
- 上游已有 Linux/Docker workflows 与 README

另外新增了 Windows 相关薄包装层：

- `criticalmaas_launcher/`：统一 CLI / launcher
- `scripts/build-windows.ps1`：PowerShell 构建脚本
- `pyinstaller/criticalmaas_launcher.spec`：PyInstaller 配置
- `.github/workflows/build-windows.yml`：Windows CI
- `tests/test_launcher_cli.py`：最小 smoke test
- `requirements/windows-build.txt`：锁定的 Windows 构建依赖

## 重要说明：这不是“完整单文件推理 exe”

该项目真实依赖包括 PyTorch、Detectron2、Rasterio/GDAL、PyProj、Google Vision、可选 OpenAI/Azure 配置，以及多个外部模型权重。

因此本仓库**不会伪造**“一个单文件 exe 已经内含所有模型/所有依赖”的效果。当前可验证、可重复的 Windows 交付方式是：

1. 使用 `PyInstaller` 生成一个 **Windows launcher exe**；
2. launcher 负责调用上游真实入口（`pipelines.*.run_pipeline` / `run_server`）；
3. 实际推理仍依赖你准备好的 Python 运行环境、可选本地/云端模型权重和外部服务凭据。

## 上游真实入口

上游项目的实际 CLI / 服务入口如下：

- `pipelines/segmentation/run_pipeline.py`
- `pipelines/segmentation/run_server.py`
- `pipelines/metadata_extraction/run_pipeline.py`
- `pipelines/metadata_extraction/run_server.py`
- `pipelines/point_extraction/run_pipeline.py`
- `pipelines/point_extraction/run_server.py`
- `pipelines/geo_referencing/run_pipeline.py`
- `pipelines/geo_referencing/run_server.py`
- `pipelines/text_extraction/run_pipeline.py`
- `pipelines/text_extraction/run_server.py`

新增 launcher 会统一转发到这些入口，不破坏上游原始调用方式。

## Windows 前置条件

### 构建 launcher 所需

- Windows 10/11 x64
- PowerShell 5.1+（推荐 PowerShell 7）
- Python 3.10 x64
- 网络可访问 PyPI / GitHub 公开仓库

### 运行完整 pipeline 额外可能需要

按 pipeline 不同，可能还需要：

- Microsoft Visual C++ Redistributable
- CUDA + 匹配版本 GPU 驱动（GPU 模式）
- 适配的 `torch` / `torchvision`
- `detectron2`（segmentation / metadata / geo / point 的部分流程）
- `rasterio` / `pyproj` / GDAL 相关 wheels 或系统组件
- Google Vision 凭据（OCR 相关流程）
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`（若模型从 S3 拉取）
- `CDR_API_TOKEN`（若启用 legend item 拉取）
- OpenAI / Azure OpenAI 配置（metadata / geo 的某些 LLM 流程）

## 模型权重与外部资源

**不会把大模型权重提交进 Git。**

常见要求：

- **Segmentation**：模型目录通常应包含 `config.yaml`、`config.json`、`model_final.pth`
- **Point extraction**：需要 `--model_point_extractor` 指向 YOLO `.pt` 文件或目录；可选 `--model_segmenter`
- **Geo referencing**：需要 `--model`
- **Text extraction**：无单独大模型目录，但 OCR 相关流程通常需要 Google Vision 配置

如果模型参数使用 S3/兼容对象存储路径，上游代码会按原逻辑下载并缓存；对应的 AWS 凭据需要由运行环境提供。

## Windows 构建 launcher

### 1. 克隆仓库

```powershell
git clone https://github.com/cxp114/criticalmaas-uncharted-ta1.git
cd criticalmaas-uncharted-ta1
```

### 2. 生成 onedir 版 launcher

```powershell
pwsh -File .\scripts\build-windows.ps1 \
  -PythonExecutable "C:\Path\To\python.exe" \
  -Clean \
  -Runtime cpu \
  -Bundle onedir
```

### 2.1 生成 release 压缩包

```powershell
pwsh -File .\scripts\build-windows.ps1 \
  -PythonExecutable "C:\Path\To\python.exe" \
  -Clean \
  -Runtime cpu \
  -Bundle onedir \
  -Archive \
  -ReleaseLabel v0.1.0
```

常用参数：

- `-PythonExecutable`：构建用 Python，可带空格路径
- `-VenvPath`：默认 `.venv`
- `-DistPath`：默认 `dist/windows-launcher`
- `-BuildPath`：默认 `build/windows-launcher`
- `-Runtime cpu|gpu`：写入构建意图；GPU 仍需你自行准备兼容 CUDA/PyTorch/Detectron2 环境
- `-Bundle onedir|onefile`：生成目录版或单文件版 launcher
- `-Archive`：额外生成 zip 发布包
- `-ReleaseLabel`：用于 zip 文件名的版本/标签，例如 `v0.1.0`
- `-ArchivePath`：发布压缩包输出目录，默认 `dist/release`
- `-Clean`：清理旧的 `dist/` / `build/`

产物位置：

- `onedir`：`dist/windows-launcher/criticalmaas/criticalmaas.exe`
- `onefile`：`dist/windows-launcher/criticalmaas.exe`
- `release zip`：`dist/release/criticalmaas-windows-<label>-<bundle>.zip`

### 3. smoke test

```powershell
.\dist\windows-launcher\criticalmaas\criticalmaas.exe --version
.\dist\windows-launcher\criticalmaas\criticalmaas.exe --help
.\dist\windows-launcher\criticalmaas\criticalmaas.exe list
```

## Launcher 使用方式

launcher 只负责统一调度，不内嵌模型权重。

### 查看环境解析结果

```powershell
.\dist\windows-launcher\criticalmaas\criticalmaas.exe doctor segmentation
```

### 调用 pipeline 入口

```powershell
.\dist\windows-launcher\criticalmaas\criticalmaas.exe pipeline segmentation -- \
  --input C:\maps\input \
  --output C:\maps\output \
  --model C:\models\segmentation \
  --no_gpu
```

```powershell
.\dist\windows-launcher\criticalmaas\criticalmaas.exe pipeline point_extraction -- \
  --input C:\maps\input \
  --output C:\maps\output \
  --model_point_extractor C:\models\points\best.pt \
  --model_segmenter C:\models\segmentation \
  --no_gpu
```

### 调用 server 入口

```powershell
.\dist\windows-launcher\criticalmaas\criticalmaas.exe server text_extraction -- --rest
```

## 运行时 Python 环境准备

launcher 会优先寻找：

1. `--python <path>`
2. 环境变量 `CRITICALMAAS_PYTHON`
3. 仓库根目录下 `.venv\Scripts\python.exe`

如果这些都不存在，launcher 会给出明确错误。

### 推荐做法

先准备一个仓库本地 `.venv`，再让 launcher 调用它：

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
```

### 较容易在 Windows 上验证的入口

`text_extraction` 相对更适合作为 Windows 起点；其余几个 pipeline 大多会牵涉 Detectron2 / GDAL / Torch 兼容性。

示例（仍取决于你本地是否能成功装齐依赖）：

```powershell
.\.venv\Scripts\python -m pip install -e .\tasks
.\.venv\Scripts\python -m pip install -e .\pipelines\text_extraction
```

### Detectron2 / GDAL 相关限制

以下 pipeline **不保证**能通过纯 PyInstaller 单文件方式稳定打包并离线运行：

- `segmentation`
- `metadata_extraction`
- `point_extraction`
- `geo_referencing`

原因：

- `detectron2` 在 Windows 上通常需要预装匹配版本的 `torch`
- `rasterio` / `pyproj` / GDAL 属于本地二进制依赖
- GPU 运行需要额外 CUDA / cuDNN / 驱动匹配

因此本仓库采取的是**诚实可运行的 launcher 方案**，而不是留下无法工作的占位“全功能 exe”。


## Release 编译与发布

新增：`.github/workflows/release-windows.yml`

用途：

- `git push` 带 `v*` 标签时，在 `windows-latest` 上构建 release 版 launcher
- 生成 `dist/release/*.zip`
- 上传 workflow artifact
- 自动把 zip 作为 GitHub Release asset 发布

建议流程：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

手动触发 `workflow_dispatch` 时，可以自定义：

- `release_label`
- `bundle`（`onedir` / `onefile`）

默认发布形式建议使用 `onedir + zip`，比单文件更稳定，也更符合当前 launcher + repo payload 的交付方式。


## GitHub Actions Windows workflow

新增：`.github/workflows/build-windows.yml`

CI 会在 `windows-latest` 上：

1. 安装 Python 3.10
2. 安装 `requirements/windows-build.txt` 中锁定的构建依赖
3. 运行 `scripts/build-windows.ps1`
4. 对生成的 launcher 执行：
   - `--version`
   - `--help`
5. 上传 `dist/windows-launcher/criticalmaas` 产物

CI **不会**执行 GPU 推理，也**不会**下载大模型权重。

## 本地验证建议

### 已纳入自动 smoke test

- `criticalmaas.exe --version`
- `criticalmaas.exe --help`

### 建议人工验证（有依赖/模型时）

```powershell
.\dist\windows-launcher\criticalmaas\criticalmaas.exe doctor point_extraction
.\dist\windows-launcher\criticalmaas\criticalmaas.exe pipeline point_extraction -- --help
```

如需真实推理，请在准备好模型和依赖后执行对应上游参数组合。

## 常见错误

### 1. `No usable Python runtime was found`

说明 launcher 没找到运行时 Python。请：

- 创建 `.venv`
- 或显式传 `--python`
- 或设置 `CRITICALMAAS_PYTHON`

### 2. `Missing optional runtime dependencies`

说明 launcher 找到了 Python，但该解释器里缺少该 pipeline 的依赖（例如 `detectron2`、`torch`、`rasterio`、`google.cloud.vision`）。

### 3. Detectron2 安装失败

这是 Windows 上的已知高风险点。建议：

- 先安装与平台匹配的 `torch` / `torchvision`
- 准备 Visual C++ Build Tools / Redistributable
- 如仍不稳定，优先考虑 WSL2 / Linux / Docker 路径

### 4. GPU 模式不可用

请检查：

- CUDA 版本是否与 `torch` 匹配
- GPU 驱动是否匹配
- 依赖是否装在 launcher 实际调用的那个 Python 环境中

## 与上游的关系

- 上游项目：`DARPA-CRITICALMAAS/uncharted-ta1`
- 本仓库：`cxp114/criticalmaas-uncharted-ta1`
- 性质：个人镜像与 Windows 打包适配版
- 目标：在尽量不改动上游核心算法的前提下，补充 Windows 构建、启动、CI 与文档

## 许可证

本仓库保留上游 MIT LICENSE / 版权信息，并在此基础上维护镜像与包装层改动。

若你需要了解某条 pipeline 的算法/参数细节，请优先阅读：

- `pipelines/segmentation/README.md`
- `pipelines/metadata_extraction/README.md`
- `pipelines/point_extraction/README.md`
- `pipelines/geo_referencing/README.md`
- `pipelines/text_extraction/README.md`
