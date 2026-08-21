/**
 * Bounded async concurrency helpers for Path B shape / Path C extract chunk loops.
 *
 * Env: `LLM_CHUNK_CONCURRENCY` — max in-flight LLM chunk calls (default 3, clamped 1–8).
 * Optional; omit to use the default.
 */

const DEFAULT_LLM_CHUNK_CONCURRENCY = 3;
const MIN_LLM_CHUNK_CONCURRENCY = 1;
const MAX_LLM_CHUNK_CONCURRENCY = 8;

/**
 * Reads and clamps LLM chunk concurrency from the environment.
 *
 * @param envValue - Raw env string (defaults to process.env.LLM_CHUNK_CONCURRENCY)
 * @returns Concurrency in [1, 8]
 */
export function getLlmChunkConcurrency(
  envValue: string | undefined = process.env.LLM_CHUNK_CONCURRENCY,
): number {
  const parsed = parseInt(envValue ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < MIN_LLM_CHUNK_CONCURRENCY) {
    return DEFAULT_LLM_CHUNK_CONCURRENCY;
  }
  return Math.min(MAX_LLM_CHUNK_CONCURRENCY, parsed);
}

/**
 * Maps `items` through an async `worker` with at most `concurrency` in-flight tasks.
 * Results are stored by original index (stable order). On first worker rejection, no new
 * workers start; late completions are ignored and the pool promise rejects (fail-fast).
 *
 * @param items - Inputs to process
 * @param concurrency - Max parallel workers (≥1)
 * @param worker - Async mapper; receives item and its index
 * @param onItemComplete - Optional hook after each successful item (completedCount is 1-based)
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onItemComplete?: (
    completedCount: number,
    total: number,
    index: number,
  ) => void | Promise<void>,
): Promise<R[]> {
  const total = items.length;
  if (total === 0) {
    return [];
  }

  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(total);
  let nextIndex = 0;
  let completedCount = 0;
  let rejected: unknown = null;
  let inFlight = 0;

  return new Promise<R[]>((resolve, reject) => {
    const launch = () => {
      while (inFlight < limit && nextIndex < total && rejected == null) {
        const index = nextIndex++;
        inFlight += 1;
        Promise.resolve()
          .then(() => worker(items[index], index))
          .then(async (value) => {
            if (rejected != null) {
              return;
            }
            results[index] = value;
            completedCount += 1;
            if (onItemComplete) {
              await onItemComplete(completedCount, total, index);
            }
          })
          .catch((err) => {
            if (rejected == null) {
              rejected = err;
            }
          })
          .finally(() => {
            inFlight -= 1;
            if (rejected != null) {
              if (inFlight === 0) {
                reject(rejected);
              }
              return;
            }
            if (completedCount === total) {
              resolve(results);
              return;
            }
            launch();
          });
      }
    };

    launch();
  });
}
