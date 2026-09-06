import type {
  EditChange,
  EditHistoryEntry,
  EditProposal,
} from "@/util/concept-note-edit-types";
import type { ConceptNoteDraftChapter } from "@/util/types";
import { missingInformationRanges } from "./draft-markdown";

export interface HistoryReview {
  entry: EditHistoryEntry;
  operation: "undo" | "restore";
  expected: Record<string, number>;
  before: Record<string, string>;
}

export type DocumentReview =
  | { kind: "proposal"; proposalId: string }
  | ({ kind: "history" } & HistoryReview);

export type InlineReviewDecision = "accepted" | "rejected";

export interface LocatedEdit extends EditChange {
  offset: number;
  end: number;
}

/** Python anchors count Unicode code points; Markdown positions count UTF-16 units. */
export function locateEdits(
  markdown: string,
  changes: EditChange[],
): LocatedEdit[] | null {
  const points = Array.from(markdown);
  const located = changes
    .map((change) => {
      const offset = points.slice(0, change.start).join("").length;
      return { ...change, offset, end: offset + change.before.length };
    })
    .sort((a, b) => a.offset - b.offset);
  if (
    located.some(
      (change, index) =>
        !Number.isInteger(change.start) ||
        change.start < 0 ||
        change.start > points.length ||
        markdown.slice(change.offset, change.end) !== change.before ||
        (index > 0 &&
          (located[index - 1].end > change.offset ||
            located[index - 1].offset === change.offset)),
    )
  )
    return null;
  return located;
}

export function proposalMatchesDraft(
  proposal: EditProposal,
  chapters: ConceptNoteDraftChapter[],
): boolean {
  return (
    proposal.changes.length > 0 &&
    Object.entries(proposal.base_revisions).every(([id, revision]) => {
      const chapter = chapters.find((item) => item.chapter_id === id);
      return (
        chapter?.revision_number === revision &&
        typeof chapter.body_markdown === "string"
      );
    }) &&
    proposal.changes.every(
      (change) =>
        chapters.some((chapter) => chapter.chapter_id === change.chapter_id) &&
        change.base_revision > 0 &&
        change.base_revision === proposal.base_revisions[change.chapter_id],
    ) &&
    chapters.every(
      (chapter) =>
        locateEdits(
          chapter.body_markdown ?? "",
          proposal.changes.filter(
            (change) => change.chapter_id === chapter.chapter_id,
          ),
        ) !== null,
    )
  );
}

/** Bounded token alignment separates independent history changes. Larger chapters
 * align at line boundaries to avoid quadratic work in the browser. */
export function snapshotChanges(
  chapter: Pick<
    ConceptNoteDraftChapter,
    "chapter_id" | "title" | "revision_number"
  >,
  before: string,
  after: string,
): EditChange[] {
  if (before === after) return [];
  let leftTokens = before.match(/\s+|[^\s]+/gu) ?? [];
  let rightTokens = after.match(/\s+|[^\s]+/gu) ?? [];
  if (leftTokens.length * rightTokens.length > 250_000) {
    leftTokens = before.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    rightTokens = after.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  }
  if (leftTokens.length * rightTokens.length > 250_000)
    return [snapshotChange(chapter, before, after, 0, 0)];
  const lengths = Array.from(
    { length: leftTokens.length + 1 },
    () => new Uint32Array(rightTokens.length + 1),
  );
  for (let i = leftTokens.length - 1; i >= 0; i--)
    for (let j = rightTokens.length - 1; j >= 0; j--)
      lengths[i][j] =
        leftTokens[i] === rightTokens[j]
          ? 1 + lengths[i + 1][j + 1]
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const changes: EditChange[] = [];
  let i = 0,
    j = 0,
    offset = 0,
    start = 0,
    removed = "",
    added = "";
  const flush = () => {
    if (removed || added)
      changes.push(
        snapshotChange(chapter, removed, added, start, changes.length),
      );
    removed = "";
    added = "";
  };
  while (i < leftTokens.length || j < rightTokens.length) {
    if (
      i < leftTokens.length &&
      j < rightTokens.length &&
      leftTokens[i] === rightTokens[j]
    ) {
      flush();
      offset += Array.from(leftTokens[i]).length;
      i++;
      j++;
      start = offset;
    } else if (
      j < rightTokens.length &&
      (i === leftTokens.length || lengths[i][j + 1] >= lengths[i + 1][j])
    )
      added += rightTokens[j++];
    else {
      removed += leftTokens[i];
      offset += Array.from(leftTokens[i++]).length;
    }
  }
  flush();
  return changes;
}

function snapshotChange(
  chapter: Pick<
    ConceptNoteDraftChapter,
    "chapter_id" | "title" | "revision_number"
  >,
  before: string,
  after: string,
  offset: number,
  index: number,
): EditChange {
  const left = Array.from(before);
  const right = Array.from(after);
  let start = 0;
  while (
    start < left.length &&
    start < right.length &&
    left[start] === right[start]
  )
    start++;
  let tail = 0;
  while (
    tail < left.length - start &&
    tail < right.length - start &&
    left[left.length - 1 - tail] === right[right.length - 1 - tail]
  )
    tail++;
  return {
    change_id: `snapshot-${chapter.chapter_id}-${index}`,
    chapter_id: chapter.chapter_id,
    chapter_title: chapter.title,
    base_revision: chapter.revision_number ?? 0,
    start: offset + start,
    before: left.slice(start, left.length - tail).join(""),
    after: right.slice(start, right.length - tail).join(""),
    kind: "wording",
    group_id: "history",
    source_refs: [],
    user_input_quote: null,
  };
}

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: Record<string, unknown>;
}

function marker(
  changes: LocatedEdit[],
  before: string,
  after: string,
  block: boolean,
): MarkdownNode {
  return {
    type: "paragraph",
    children: [],
    data: {
      hName: "cnb-edit",
      hProperties: {
        changeIds: changes.map((change) => change.change_id).join(" "),
        before,
        after,
        block: String(block),
      },
    },
  };
}

/** Operates on parsed Markdown, never raw HTML. Complex syntax is redlined as its
 * complete enclosing block, so links/lists/tables remain well-formed and safe. */
export function inlineReviewPlugin(markdown: string, changes: LocatedEdit[]) {
  return () => (tree: MarkdownNode) => {
    const textNodes: MarkdownNode[] = [];
    const visit = (node: MarkdownNode) => {
      if (node.type === "text") textNodes.push(node);
      node.children?.forEach(visit);
    };
    visit(tree);
    const informationMarkers = missingInformationRanges(markdown);
    const textTargets = new Map<LocatedEdit, MarkdownNode>();
    for (const change of changes) {
      // A partial edit must not split a marker into literal fragments. Render its
      // enclosing block instead, with the complete old/new tooltip messages.
      if (
        informationMarkers.some(
          (range) => change.offset < range.end && change.end > range.start,
        )
      )
        continue;
      const target = textNodes.find((node) => {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        return (
          start !== undefined &&
          end !== undefined &&
          start <= change.offset &&
          end >= change.end &&
          markdown.slice(start, end) === node.value &&
          !change.after.includes("\n")
        );
      });
      if (target) textTargets.set(change, target);
    }
    const blocks = tree.children ?? [];
    const fallback = changes.filter((change) => !textTargets.has(change));
    const ranges = fallback
      .map((change) => {
        let first = blocks.findIndex(
          (node) => (node.position?.end.offset ?? 0) >= change.offset,
        );
        if (first < 0) first = Math.max(0, blocks.length - 1);
        let last = first;
        while (
          last + 1 < blocks.length &&
          (blocks[last].position?.end.offset ?? 0) < change.end
        )
          last++;
        return { first, last };
      })
      .sort((a, b) => a.first - b.first);
    const merged: typeof ranges = [];
    for (const range of ranges) {
      const previous = merged[merged.length - 1];
      if (previous && previous.last >= range.first)
        previous.last = Math.max(previous.last, range.last);
      else merged.push({ ...range });
    }
    const blocked = new Set<LocatedEdit>();
    for (const range of [...merged].reverse()) {
      const start = Math.min(
        blocks[range.first]?.position?.start.offset ?? 0,
        ...fallback
          .filter(
            (change) =>
              change.offset <=
              (blocks[range.last]?.position?.end.offset ?? markdown.length),
          )
          .map((change) => change.offset)
          .filter(
            (offset) =>
              offset >= (blocks[range.first - 1]?.position?.end.offset ?? 0),
          ),
      );
      const end = Math.max(
        blocks[range.last]?.position?.end.offset ?? markdown.length,
        ...changes
          .filter(
            (change) =>
              change.offset >= start &&
              change.offset <=
                (blocks[range.last]?.position?.end.offset ?? markdown.length),
          )
          .map((change) => change.end),
      );
      const affected = changes.filter(
        (change) => change.offset >= start && change.end <= end,
      );
      const before = markdown.slice(start, end);
      let after = before;
      for (const change of [...affected].reverse()) {
        blocked.add(change);
        after =
          after.slice(0, change.offset - start) +
          change.after +
          after.slice(change.end - start);
      }
      blocks.splice(
        range.first,
        range.last - range.first + 1,
        marker(affected, before, after, true),
      );
    }
    const transform = (node: MarkdownNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        const edits = changes.filter(
          (change) => !blocked.has(change) && textTargets.get(change) === child,
        );
        if (!edits.length) {
          transform(child);
          return [child];
        }
        const result: MarkdownNode[] = [];
        let cursor = child.position!.start.offset!;
        for (const change of edits) {
          result.push(
            {
              type: "text",
              value: markdown.slice(cursor, change.offset),
              position: {
                start: { offset: cursor },
                end: { offset: change.offset },
              },
            },
            marker([change], change.before, change.after, false),
          );
          cursor = change.end;
        }
        result.push({
          type: "text",
          value: markdown.slice(cursor, child.position!.end.offset!),
          position: { start: { offset: cursor }, end: child.position!.end },
        });
        return result;
      });
    };
    transform(tree);
  };
}
