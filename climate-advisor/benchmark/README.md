# Benchmark suites

`cnb/` owns Concept Note Builder fixtures, schemas, judges, stage execution and
scoring, reports, viewer, tests and saved runs. `utils/` contains the existing
OpenRouter usage recorder and usage models; it does not import any CNB module.
It measures OpenRouter responses only. PDF conversion cost is explicitly
unavailable unless the converter supplies billing evidence.

From `climate-advisor/`, run `uv run pytest benchmark/cnb/tests` or
`uv run python -m benchmark.cnb.scripts.evaluate --help`.

For alignment with David's CC-1124 GHGI benchmark, keep future suites beside
`cnb/` and agree artifact layout, code/source/model provenance, cost completeness
and reviewed-baseline identity. CNB's chapter-specific scores and the GHGI
answer-key contract remain suite-owned. Execution and viewer logic currently
depend on CNB stages and should only be shared when a real second consumer
establishes a common interface. This is an alignment proposal; it does not
assert an agreement with David or a completed GHGI implementation.

See [CNB commands](cnb/benchmark.md) and [live delivery](cnb/DELIVERY.md).
