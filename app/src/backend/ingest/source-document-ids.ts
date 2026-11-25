/** Inventory values can accumulate several files onto one GPC ref. */

export interface SourceTaggedValue {
  sourceDocumentId?: string | null;
  sourceDocumentIds?: string[] | null;
}

export function contributorDocumentIds(value: SourceTaggedValue): string[] {
  const ids = [
    ...(Array.isArray(value.sourceDocumentIds) ? value.sourceDocumentIds : []),
    ...(value.sourceDocumentId ? [value.sourceDocumentId] : []),
  ];
  return [...new Set(ids.filter((id) => Boolean(id)))];
}

/** True when more than one file contributed to the stored GPC total. */
export function isAmbiguousImportedValue(value: SourceTaggedValue): boolean {
  return contributorDocumentIds(value).length > 1;
}

export function withIncomingSourceDocument(
  value: SourceTaggedValue,
  incoming?: string,
): { sourceDocumentId?: string; sourceDocumentIds: string[] } {
  const ids = contributorDocumentIds(value);
  if (incoming && !ids.includes(incoming)) ids.push(incoming);
  return {
    sourceDocumentIds: ids,
    sourceDocumentId: value.sourceDocumentId ?? incoming,
  };
}
