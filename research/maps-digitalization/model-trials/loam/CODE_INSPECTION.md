# Upstream inspection and adapter boundaries

Pinned source: `upstream/` commit `8176ace4f1d5af56baa8d3bd8481c7ed8cccf048`, MIT license.

Read before execution: README, requirements, handler, model assembly/parts, metadata preprocessing and its workers, postprocessing worker, original input normalization and prediction functions. The official 124 MB weight file was fetched from the repository's root checkpoint link; no dataset download or training was performed.

- `LOAM/loam_model.py`: original seven-channel/two-class network, 31,061,202 parameters. Loaded without architecture edits and with strict key matching.
- `LOAM/loam_parts.py`: metadata fusion broadcasts its 64-number vectors along bottleneck width. This constrains width to 1024 under the original implementation. Shorter 256-high strips retain that width; they change context and GroupNorm spatial statistics.
- `metadata_preprocessing.py` lines 76–83: `multiprocessing_setting()` may increase `PROCESSES` beyond the requested count. Our wrapper disables that function and executes the same workers serially, deep-copying arguments to preserve isolated worker inputs.
- `metadata_preprocessing.py` lines 227 onward: provided source boundary JSON selects the existing `preprocessing_coworker` branch. The unused GDAL-dependent `area_json_generator` import is replaced by an explicit raising gate. No fallback segmentation was substituted.
- `postprocessing_workers/postprocessing_for_bitmap_worker.py`: official efficiency setting >=5 selects `[v7, v7, v7, v7, black, boundary, v2]`. Our model runner consumes precisely those channels. The first, second and black channels apply the same >0 to 255 conversion. Others retain uint8 values; each tile is divided by 255 only when its maximum exceeds 1, as in `BasicDataset.preprocess`.
- `loam_inference.py` lines 649–687: evaluation mode, float32 input, original metadata tensors, two-class argmax. The supplied numerical mask threshold is unused for a two-class network. We also save softmax probabilities only to arbitrate competing independently predicted masks; binary masks still use logit argmax.
- The stock square-only interpolation reverses image height/width; for rectangular strips it would transpose output dimensions. Our wrapper keeps the model's already correctly shaped logits instead of resampling them.
- No imported code is trained or executed against benchmark references. `evaluate.py` is a separate process, launched only after source-only predictions have been completed.

Not exercised: stock `loam_handler.py` end-to-end CLI, optional integrated legend description output, automatic map-frame segmentation, default mode-0 recoloring, GPU path, completed full-map canonical 1024-square inference, and upstream GDAL polygon output. One unscored canonical-square source-tile attempt was made after the primary run and stopped by the RSS guard at 2662 MiB, without a completed output. The actual scored method is official LOAM weights + official mode-6 preprocessing + disclosed CPU strip execution, not an unmodified complete pipeline reproduction.

`git -C upstream status --short` was empty after execution setup. Modifications are wrappers in the exclusive trial directory, not upstream source edits.
