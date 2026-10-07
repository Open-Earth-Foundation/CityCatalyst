// Pure helpers shared by MeedApiService and the catalog service.

export function hasChapters(chapters: unknown): boolean {
  if (Array.isArray(chapters)) return chapters.length > 0;
  if (chapters && typeof chapters === "object") {
    return Object.keys(chapters as Record<string, unknown>).length > 0;
  }
  return false;
}

export function isCompleteMEEDOutputPlan(report: {
  catalogEligible?: boolean | null;
  languages?: string[] | null;
  chapters?: unknown;
  requestedLanguages?: string[] | null;
  requiredSourcesOk?: boolean | null;
}): boolean {
  if (report.catalogEligible !== true) return false;
  if (!hasChapters(report.chapters)) return false;
  const languages = report.languages ?? [];
  if (languages.length === 0) return false;
  const requested = report.requestedLanguages;
  if (requested && requested.length > 0) {
    const present = new Set(languages);
    if (!requested.every((language) => present.has(language))) return false;
  }
  if (report.requiredSourcesOk === false) return false;
  return true;
}
