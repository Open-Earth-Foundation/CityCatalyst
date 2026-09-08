# CC-554: one-to-one MLflow comparison

Two newly created synthetic verification runs. Both execute the same deterministic provider stream and inventory result through the baseline and candidate handlers. No real LLM, inventory, or application database calls were made. Both MLflow runs are FINISHED.

**Request:** Show the Demo City inventory total and its two largest emission categories.

| | [Before: baseline trace](https://mlflow-dev.openearth.dev/#/experiments/4/traces?selectedEvaluationId=tr-2c5bf244bbeef58e6fa628b53a2c3829) | [After: candidate trace](https://mlflow-dev.openearth.dev/#/experiments/4/traces?selectedEvaluationId=tr-01be5d5afc5261cbdf8c3fc19573a36e) |
| --- | --- | --- |
| Model calls | 2 | 2 |
| Stored raw chunk events | 130 | 0 |
| Full system-prompt copies | 2, in model inputs | 1, on the request root; child references |
| Dedicated TOOL spans | 0 | 1: read_inventory |
| Root response | Empty | Complete assembled answer |
| Trace JSON bytes | 77,513 | 12,760 |

[Before run / artifacts](https://mlflow-dev.openearth.dev/#/experiments/4/runs/5f86204e35ff47fcab248fc5c100e630) · [After run / artifacts](https://mlflow-dev.openearth.dev/#/experiments/4/runs/417bff48357b4176947805986cd35c69)

The final model response matches exactly in both traces (SHA-256: `317cfef40307f83b80540bf5d2d9dacfef92312e152eda0893e08d39472d0d2b`). The new root response also matches. This example reduces trace JSON by 83.5%; this is a controlled example, not a production-wide savings estimate.

The [revamped storage example](CC-554-ca-revamped-trace-example.json) is a
reviewer-friendly JSON projection of the new root, model, tool, and run-artifact
records read back from the candidate trace.

## What to click in the new trace

1. Select **Climate Advisor Conversation** and open **Outputs** for the assembled answer. Attributes include `streamed=true` and `stream_status=ok`.
2. Open the root **Inputs > system_prompts** for the prompt snapshot.
3. Select either model span: its system message points to that snapshot and root span ID.
4. Select **read_inventory** to inspect the city input and complete structured inventory result.

## Identical answer

## Demo City inventory — verification example

The fictional 2025 inventory totals **1,200 tCO₂e**.

| Category | Emissions | Share of total |
|---|---:|---:|
| Stationary energy | 720 tCO₂e | 60% |
| Transport | 360 tCO₂e | 30% |

Together, these two categories account for **90%** of the total. The remaining categories account for 120 tCO₂e (10%).

These are deterministic synthetic values for checking MLflow display; they are not a real city inventory.

Verified by authenticated API readback and by opening both trace detail drawers
in the MLflow 3.12 browser UI. Existing live traces were not changed.
