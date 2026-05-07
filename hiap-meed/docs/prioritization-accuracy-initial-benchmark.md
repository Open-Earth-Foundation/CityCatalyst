# Prioritization Accuracy - Initial Benchmark

This document defines the planned mechanism for validating whether HIAP-MEED mitigation rankings align with domain judgment and real-world planning practice.

## Purpose

For the Month 8 milestone, we perform an initial validation of mitigation prioritization quality. The goal is to test whether the model's action ranking is directionally consistent with:

- independent climate planning experts, and
- established Chilean climate planning instruments.

This is not intended as a final production-grade evaluation framework yet. It is the first benchmark to guide further model development.

## Benchmark Sources

Two complementary references are used.

### 1) Expert benchmark

Independent climate planning professionals rank the same mitigation action set using the same city context that the model receives.

### 2) Practice benchmark

Model rankings are compared against priorities reflected in Chilean planning instruments, including:

- Planes de Accion Regional de Cambio Climatico (PARCC)
- Planes de Accion Comunal de Cambio Climatico (PACCC)

## Alignment Metrics

We evaluate alignment with two ranking metrics.

### Precision@K

`Precision@K` measures overlap between:

- the model's top `K` actions, and
- the benchmark's top `K` actions (expert or practice).

Formula:

`Precision@K = |TopK_model intersection TopK_benchmark| / K`

Simple example (`K=3`):

- Model top 3: `[A1, A2, A3]`
- Expert top 3: `[A2, A4, A3]`
- Overlap: `{A2, A3}` -> 2 actions
- `Precision@3 = 2 / 3 = 0.67`

Interpretation:

- `1.00` means perfect top-K overlap.
- `0.00` means no overlap in top-K actions.

### Spearman rank correlation

Spearman correlation measures how similar the relative ordering is across the full ranked list. It is high when actions considered important by one ranking are also near the top in the other ranking.

Range:

- `+1.0`: identical ordering
- `0.0`: no monotonic relationship
- `-1.0`: reverse ordering

Simple example (4 actions):

- Actions: `A1, A2, A3, A4`
- Model ranks: `A1=1, A2=2, A3=3, A4=4`
- Expert ranks: `A1=2, A2=1, A3=4, A4=3`

Rank differences (`d = model_rank - expert_rank`):

- `A1: -1`, `A2: +1`, `A3: -1`, `A4: +1`
- Squared differences: `1, 1, 1, 1` -> sum = `4`

Using `n=4`:

`rho = 1 - (6 * sum(d^2)) / (n * (n^2 - 1))`

`rho = 1 - (6 * 4) / (4 * (16 - 1)) = 1 - 24/60 = 0.60`

Interpretation:

- `0.60` indicates moderate positive agreement in ordering.

## Planned Evaluation Procedure

1. Use the same city context and candidate action set for model and benchmark generation.
2. Build expert benchmark rankings from independent professionals.
3. Extract practice benchmark priorities from PARCC/PACCC sources and convert them into comparable ranked action lists.
4. Compute `Precision@K` (for selected K values such as `3`, `5`, `10`).
5. Compute Spearman rank correlation for full-list ordering consistency.
6. Report results separately for:
   - model vs expert benchmark
   - model vs practice benchmark

## Expected Output for Development Tracking

For each evaluation run, store:

- dataset/context identifier
- benchmark type (`expert` or `practice`)
- K values used
- `Precision@K` per K
- Spearman correlation
- notes about data assumptions or mapping decisions

## Why this matters

This benchmark provides an initial, measurable signal for whether model recommendations are consistent with expert knowledge and established planning approaches. The results should inform iterative improvements to scoring logic, weighting, and input modeling.
