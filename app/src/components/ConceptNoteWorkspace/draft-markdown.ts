export const MISSING_INFORMATION_LINK = "#cnb-missing-information";

const MISSING_INFORMATION_PATTERN_SOURCE = String.raw`\[(Information needed:\s*[^\]\r\n]+)\]`;

function missingInformationPattern(): RegExp {
  return new RegExp(MISSING_INFORMATION_PATTERN_SOURCE, "gi");
}

export function stripMissingInformationMarkers(markdown: string): string {
  return markdown
    .replace(
      new RegExp(`[ \\t]*${MISSING_INFORMATION_PATTERN_SOURCE}[ \\t]*`, "gi"),
      (marker, _message: string, offset: number, source: string) => {
        const before = source[offset - 1];
        const after = source[offset + marker.length];
        return before && after && before !== "\n" && after !== "\n" ? " " : "";
      },
    )
    .replace(/[ \t]+(?=\r?$)/gm, "")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countMissingInformationMarkers(markdown: string): number {
  return Array.from(markdown.matchAll(missingInformationPattern())).length;
}

export function replaceMissingInformationMarkers(markdown: string): string {
  return markdown.replace(
    missingInformationPattern(),
    (_marker, message: string) => {
      const encodedMessage = encodeURIComponent(message.trim());
      return `[ⓘ](${MISSING_INFORMATION_LINK} "${encodedMessage}")`;
    },
  );
}

export function decodeMissingInformationMessage(
  encodedMessage?: string,
): string | null {
  if (!encodedMessage) {
    return null;
  }

  try {
    return decodeURIComponent(encodedMessage);
  } catch {
    return null;
  }
}
