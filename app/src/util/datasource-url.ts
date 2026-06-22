/** Resolves a public link for a catalogue data source (dataset, methodology, or publisher). */
export function resolveDataSourceLinkUrl(source: {
  url?: string | null;
  methodologyUrl?: string | null;
  publisher?: { url?: string | null } | null;
}): string | undefined {
  const candidates = [
    source.url,
    source.methodologyUrl,
    source.publisher?.url,
  ];

  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (!trimmed || trimmed === "#") {
      continue;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }

  return undefined;
}
