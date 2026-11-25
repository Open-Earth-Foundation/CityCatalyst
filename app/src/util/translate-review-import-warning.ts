import type { TFunction } from "i18next";

/**
 * Review used to print stored English `Row N: …` strings from
 * validationResults.warnings. Map those onto the same i18n keys as the
 * mapping-step issues list (CC-1153).
 */
export function translateReviewImportWarning(
  warning: string,
  t: TFunction,
): string {
  const match = warning.match(/^Row\s+(\d+):\s*(.*)$/i);
  if (!match) return warning;
  const rowNumber = match[1];
  const rest = match[2] ?? "";
  const prefix = `${t("import-row-number")} ${rowNumber}: `;

  const unknownNotation = rest.match(/Unknown notation key "([^"]+)"/i);
  if (unknownNotation) {
    return (
      prefix +
      t("import-row-issue-unknown-notation-key", {
        notationKey: unknownNotation[1],
      })
    );
  }
  if (/no emission values or notation key/i.test(rest)) {
    return prefix + t("import-row-issue-no-value-or-notation-key");
  }
  if (/Could not resolve a GPC reference/i.test(rest)) {
    return prefix + t("import-row-issue-gpc-reference-unresolved");
  }
  if (/No GPC reference/i.test(rest)) {
    return prefix + t("import-row-issue-missing-gpc-reference");
  }
  if (
    /not found in taxonomy/i.test(rest) ||
    /doesn't exist/i.test(rest) ||
    /does not exist/i.test(rest)
  ) {
    return prefix + t("import-row-issue-gpc-reference-unknown");
  }
  return prefix + rest;
}

export function rowImportWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) return [];
  return warnings.filter(
    (warning): warning is string =>
      typeof warning === "string" && /^Row\s+\d+:/i.test(warning),
  );
}
