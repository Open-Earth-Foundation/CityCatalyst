/**
 * Example text for the mapped activity-data description column.
 * Other review examples stay blank.
 */
export function activityDescriptionSample(mapping: {
  sourceColumn: string;
  mappedField: string;
  sampleValue?: string | null;
}): string | null {
  const field = mapping.mappedField.toLowerCase();
  const source = mapping.sourceColumn.toLowerCase();
  const isActivityDescription =
    field.includes("description and methodology") ||
    source.includes("activity data - description") ||
    source.includes("activity data description");
  if (!isActivityDescription) return null;
  const value = mapping.sampleValue?.trim();
  return value && value !== "-" ? value : null;
}
