/**
 * Helpers for import AI chunk progress (`mappingConfiguration.extractionProgress`).
 * Used by Path B (interpret/shape) and Path C (PDF extract) status polling.
 */

export type ImportChunkProgress = {
  current: number;
  total: number;
};

export type MappingConfigurationWithProgress = {
  extractionProgress?: {
    current: number;
    total?: number;
  };
} | null;

/**
 * Returns determinate chunk progress when total > 1; otherwise null (indeterminate UX).
 */
export function readImportChunkProgress(
  mappingConfiguration: MappingConfigurationWithProgress | undefined,
): ImportChunkProgress | null {
  const progress = mappingConfiguration?.extractionProgress;
  const total = progress?.total;
  if (progress == null || total == null || total <= 1) {
    return null;
  }
  return { current: progress.current, total };
}
