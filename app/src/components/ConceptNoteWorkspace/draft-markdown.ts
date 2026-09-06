export const MISSING_INFORMATION_LINK = "#cnb-missing-information";

const MISSING_INFORMATION_PATTERN_SOURCE = String.raw`\[(Information needed:\s*[^\]\r\n]+)\]`;

function missingInformationPattern(): RegExp {
  return new RegExp(MISSING_INFORMATION_PATTERN_SOURCE, "gi");
}

export function missingInformationRanges(markdown: string) {
  return Array.from(
    markdown.matchAll(missingInformationPattern()),
    (match) => ({
      start: match.index!,
      end: match.index! + match[0].length,
      message: match[1].trim(),
    }),
  );
}

interface MarkerMarkdownNode {
  type: string;
  value?: string;
  children?: MarkerMarkdownNode[];
  url?: string;
  title?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
}

function markerLink(message: string): MarkerMarkdownNode {
  return {
    type: "link",
    url: MISSING_INFORMATION_LINK,
    title: encodeURIComponent(message),
    children: [{ type: "text", value: "ⓘ" }],
  };
}

function isMarkerText(node: MarkerMarkdownNode): boolean {
  return (
    node.type === "text" ||
    node.type === "html" ||
    node.type === "inlineCode" ||
    (["emphasis", "strong", "delete", "link"].includes(node.type) &&
      (node.children ?? []).every(isMarkerText))
  );
}

/** GFM autolinks omit child positions. Restore only exact literal source spans;
 * never infer positions for review decorations or Markdown delimiters. */
function restoreLiteralPositions(
  node: MarkerMarkdownNode,
  source: string,
): void {
  let cursor = node.position?.start.offset;
  for (const child of node.children ?? []) {
    if (child.position?.end.offset !== undefined) {
      cursor = child.position.end.offset;
      continue;
    }
    const text =
      child.type === "text"
        ? child.value
        : child.type === "link" &&
            child.children?.every((part) => part.type === "text")
          ? child.children.map((part) => part.value ?? "").join("")
          : undefined;
    if (
      cursor !== undefined &&
      text !== undefined &&
      source.slice(cursor, cursor + text.length) === text
    ) {
      child.position = {
        start: { offset: cursor },
        end: { offset: cursor + text.length },
      };
      cursor += text.length;
    } else cursor = undefined;
  }
}

/** Markdown emphasis can divide a marker across text nodes. Collapse only complete
 * source-backed markers, retaining surrounding formatted nodes and source bytes. */
function collapseFormattedMarkers(
  node: MarkerMarkdownNode,
  source: string,
): void {
  const children = node.children!;
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return;
  restoreLiteralPositions(node, source);
  for (const range of missingInformationRanges(
    source.slice(start, end),
  ).reverse()) {
    const markerStart = start + range.start;
    const markerEnd = start + range.end;
    const first = children.findIndex(
      (child) =>
        child.type === "text" &&
        (child.position?.start.offset ?? Infinity) <= markerStart &&
        (child.position?.end.offset ?? -1) > markerStart,
    );
    const last = children.findIndex(
      (child) =>
        child.type === "text" &&
        (child.position?.start.offset ?? Infinity) < markerEnd &&
        (child.position?.end.offset ?? -1) >= markerEnd,
    );
    if (
      first < 0 ||
      last <= first ||
      !children.slice(first, last + 1).every(isMarkerText)
    )
      continue;
    const left = children[first];
    const right = children[last];
    const leftStart = left.position!.start.offset!;
    const rightEnd = right.position!.end.offset!;
    if (
      source.slice(leftStart, left.position!.end.offset) !== left.value ||
      source.slice(right.position!.start.offset, rightEnd) !== right.value
    )
      continue;
    children.splice(
      first,
      last - first + 1,
      {
        type: "text",
        value: source.slice(leftStart, markerStart),
        position: {
          start: { offset: leftStart },
          end: { offset: markerStart },
        },
      },
      markerLink(range.message),
      {
        type: "text",
        value: source.slice(markerEnd, rightEnd),
        position: { start: { offset: markerEnd }, end: { offset: rightEnd } },
      },
    );
  }
}

/** Render-only transform. Call after inline-review has resolved immutable offsets. */
export function remarkMissingInformation() {
  return (tree: MarkerMarkdownNode, file: { value: unknown }) => {
    const source = String(file.value);
    const visit = (node: MarkerMarkdownNode) => {
      if (
        !node.children ||
        node.type === "link" ||
        node.type === "linkReference"
      )
        return;
      collapseFormattedMarkers(node, source);
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text") {
          visit(child);
          return [child];
        }
        const text = child.value ?? "";
        const result: MarkerMarkdownNode[] = [];
        let cursor = 0;
        for (const range of missingInformationRanges(text)) {
          result.push(
            { type: "text", value: text.slice(cursor, range.start) },
            markerLink(range.message),
          );
          cursor = range.end;
        }
        return cursor
          ? [...result, { type: "text", value: text.slice(cursor) }]
          : [child];
      });
    };
    visit(tree);
  };
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
