import type { EditScope } from "@/util/concept-note-edit-types";

export interface DraftTextSelection {
  scope: Extract<EditScope, { kind: "selection" }>;
  range: Range;
  bold: boolean;
  italic: boolean;
  font: "default" | "serif" | "mono";
}

/** Map parser-backed text, never search for its first occurrence in a chapter. */
export function textSourceBoundaries(
  raw: string,
  rendered: string,
): Array<number | null> | null {
  const boundaries: Array<number | null> = [0];
  let visible = "";
  let offset = 0;
  while (offset < raw.length) {
    const rest = raw.slice(offset);
    const escaped = /^\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/.exec(rest);
    const entity = /^&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.exec(rest);
    const token =
      escaped?.[0] ??
      entity?.[0] ??
      (rest.startsWith("\r\n")
        ? "\r\n"
        : String.fromCodePoint(rest.codePointAt(0)!));
    let value = escaped ? escaped[1] : token === "\r\n" ? "\n" : token;
    if (entity) {
      // The token grammar contains no tags/attributes, so parsing cannot execute HTML.
      value =
        new DOMParser().parseFromString(token, "text/html").body.textContent ??
        token;
    }
    visible += value;
    for (let index = 1; index < value.length; index++) boundaries.push(null);
    offset += token.length;
    boundaries.push(offset);
  }
  return visible === rendered ? boundaries : null;
}

export function captureDraftSelection(
  preview: HTMLElement,
  markdown: string,
  chapterId: string,
  revision: number,
  selection: Selection | null,
): DraftTextSelection | null {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1)
    return null;
  const range = selection.getRangeAt(0);
  if (
    !preview.contains(range.startContainer) ||
    !preview.contains(range.endContainer)
  )
    return null;
  if (
    [range.startContainer, range.endContainer].some((node) =>
      (node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement
      )?.closest("button, a, code, pre, [data-review-decoration]"),
    )
  )
    return null;
  if (
    range
      .cloneContents()
      .querySelector("button, a, code, pre, [data-review-decoration]")
  )
    return null;
  type SourcePart =
    | { invalid: true }
    | { invalid: false; span: HTMLElement; start: number; end: number };
  const parts = [
    ...preview.querySelectorAll<HTMLElement>("[data-cc-source-start]"),
  ].flatMap<SourcePart>((span) => {
    if (!range.intersectsNode(span)) return [];
    const intersection = document.createRange();
    intersection.selectNodeContents(span);
    if (span.contains(range.startContainer))
      intersection.setStart(range.startContainer, range.startOffset);
    if (span.contains(range.endContainer))
      intersection.setEnd(range.endContainer, range.endOffset);
    if (!intersection.toString()) return [];
    const before = document.createRange();
    before.selectNodeContents(span);
    before.setEnd(intersection.startContainer, intersection.startOffset);
    const from = before.toString().length;
    const to = from + intersection.toString().length;
    const start = Number(span.dataset.ccSourceStart);
    const end = Number(span.dataset.ccSourceEnd);
    const boundaries = textSourceBoundaries(
      markdown.slice(start, end),
      span.textContent ?? "",
    );
    if (!boundaries || boundaries[from] == null || boundaries[to] == null)
      return [{ invalid: true as const }];
    return [
      {
        invalid: false as const,
        span,
        start: start + boundaries[from]!,
        end: start + boundaries[to]!,
      },
    ];
  });
  if (!parts.length || parts.some((part) => part.invalid)) return null;
  const valid = parts.filter((part) => !part.invalid);
  let start = valid[0].start;
  let end = valid[valid.length - 1].end;
  for (const element of [
    ...preview.querySelectorAll<HTMLElement>("[data-cc-format-start]"),
  ].reverse()) {
    const leaves = [
      ...element.querySelectorAll<HTMLElement>("[data-cc-source-start]"),
    ];
    if (
      leaves.length &&
      start <= Number(leaves[0].dataset.ccSourceStart) &&
      end >= Number(leaves.at(-1)!.dataset.ccSourceEnd)
    ) {
      start = Math.min(start, Number(element.dataset.ccFormatStart));
      end = Math.max(end, Number(element.dataset.ccFormatEnd));
    }
  }
  if (!markdown.slice(start, end).trim() || start >= end) return null;
  const fonts = valid.map(
    ({ span }) =>
      span.closest<HTMLElement>("[data-cc-font]")?.dataset.ccFont ?? "default",
  );
  const font = fonts.every((value) => value === fonts[0])
    ? fonts[0]
    : "default";
  const hasStyle = (span: HTMLElement, attribute: string, tag: string) => {
    const computed = window.getComputedStyle(span);
    const effective =
      attribute === "data-cc-bold" ? computed.fontWeight : computed.fontStyle;
    if (effective && effective !== "inherit")
      return attribute === "data-cc-bold"
        ? effective === "bold" || Number(effective) >= 600
        : effective === "italic" || effective.startsWith("oblique");
    const explicit = span
      .closest<HTMLElement>(`[${attribute}]`)
      ?.getAttribute(attribute);
    return explicit ? explicit === "true" : Boolean(span.closest(tag));
  };
  return {
    scope: {
      kind: "selection",
      chapter_id: chapterId,
      base_revision: revision,
      start: Array.from(markdown.slice(0, start)).length,
      end: Array.from(markdown.slice(0, end)).length,
      selected_markdown: markdown.slice(start, end),
    },
    range: range.cloneRange(),
    bold: valid.every(({ span }) => hasStyle(span, "data-cc-bold", "strong")),
    italic: valid.every(({ span }) => hasStyle(span, "data-cc-italic", "em")),
    font: font === "serif" || font === "mono" ? font : "default",
  };
}
