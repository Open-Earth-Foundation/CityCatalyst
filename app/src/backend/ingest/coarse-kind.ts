export const COARSE_FILE_KINDS = [
  "pdf",
  "xlsx",
  "csv",
  "md",
  "zip",
  "unknown",
] as const;

export type CoarseFileKind = (typeof COARSE_FILE_KINDS)[number];

const EXTENSION_TO_KIND: Record<string, Exclude<CoarseFileKind, "unknown">> = {
  pdf: "pdf",
  xlsx: "xlsx",
  xls: "xlsx",
  csv: "csv",
  md: "md",
  markdown: "md",
  zip: "zip",
};

function extensionOf(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
}

/**
 * Stage 4a: Core MIME/extension kind. Plugins must not re-implement this.
 * Extension wins; magic bytes only fill in a missing or unknown extension.
 */
export function detectCoarseFileKind(
  fileName: string,
  buffer?: Buffer | null,
): CoarseFileKind {
  const ext = extensionOf(fileName);
  const fromExt = ext ? EXTENSION_TO_KIND[ext] : undefined;
  if (fromExt) {
    return fromExt;
  }
  if (buffer && buffer.length >= 4) {
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      return "pdf";
    }
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      return "zip";
    }
  }
  return "unknown";
}

export function coarseKindsFromExtensions(
  extensions: readonly string[],
): CoarseFileKind[] {
  const kinds = new Set<CoarseFileKind>();
  for (const ext of extensions) {
    const kind = detectCoarseFileKind(`file.${ext.replace(/^\./, "")}`);
    if (kind !== "unknown") {
      kinds.add(kind);
    }
  }
  return [...kinds];
}
