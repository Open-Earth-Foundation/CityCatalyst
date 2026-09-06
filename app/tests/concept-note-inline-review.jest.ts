/** @jest-environment jsdom */
import { afterEach, beforeAll, expect, it, jest } from "@jest/globals";
import { act, createElement, type ComponentProps } from "react";
import type { Root } from "react-dom/client";
import {
  chapterId,
  cleanup,
  draftChapter,
  historyEntry,
  mount,
  prepareDom,
  proposal,
  t,
} from "./cnb-edit-ui-helpers";
import {
  locateEdits,
  proposalMatchesDraft,
  snapshotChanges,
  type DocumentReview,
} from "@/components/ConceptNoteWorkspace/inline-review";

prepareDom();
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));
let Inline: typeof import("@/components/ConceptNoteWorkspace/edit-diff").InlineDocumentDiff;
let Toolbar: typeof import("@/components/ConceptNoteWorkspace/document-review").DocumentReviewToolbar;
let reviewChanges: typeof import("@/components/ConceptNoteWorkspace/document-review").documentReviewChanges;
let root: Root;
beforeAll(async () => {
  ({ InlineDocumentDiff: Inline } =
    await import("@/components/ConceptNoteWorkspace/edit-diff"));
  ({ DocumentReviewToolbar: Toolbar, documentReviewChanges: reviewChanges } =
    await import("@/components/ConceptNoteWorkspace/document-review"));
});
afterEach(async () => cleanup(root));

const edit = (before: string, after: string, start = 0, id = "change-one") => ({
  ...proposal.changes[0],
  before,
  after,
  start,
  change_id: id,
});
async function render(
  markdown: string,
  changes = [edit("old", "new")],
  activeChangeId = changes[0]?.change_id,
) {
  const result = await mount(
    createElement(Inline, {
      markdown,
      changes,
      activeChangeId,
      lng: "en",
      components: {},
    }),
    true,
  );
  root = result.root;
  return result.container;
}

it("redlines every exact repeated anchor in place with surrounding text intact", async () => {
  const text = "Opening old and repeated old. Ending.";
  const container = await render(text, [
    edit("old", "new", 8),
    edit("old", "clear", 25, "second"),
  ]);
  expect(
    container.querySelectorAll('[data-testid="concept-note-inline-change"]'),
  ).toHaveLength(2);
  expect(container.querySelector("p")?.textContent).toBe(
    "Opening old new and repeated old clear. Ending.",
  );
  expect(container.querySelectorAll("del")).toHaveLength(2);
  expect(
    container
      .querySelector('[data-active-change="true"]')
      ?.getAttribute("data-change-id"),
  ).toBe("change-one");
});
it("routes an inline X or tick to the exact rendered change ids", async () => {
  const onAcceptChange = jest.fn();
  const onRejectChange = jest.fn();
  const result = await mount(
    createElement(Inline, {
      markdown: "old",
      changes: [edit("old", "new")],
      activeChangeId: "change-one",
      decisions: { "change-one": "accepted" },
      lng: "en",
      components: {},
      onAcceptChange,
      onRejectChange,
    }),
    true,
  );
  root = result.root;
  const accept = result.container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-inline-accept"]',
  )!;
  expect(accept.getAttribute("aria-pressed")).toBe("true");
  await act(async () => accept.click());
  await act(async () =>
    result.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-inline-reject"]',
      )!
      .click(),
  );
  expect(onAcceptChange).toHaveBeenCalledWith(["change-one"]);
  expect(onRejectChange).toHaveBeenCalledWith(["change-one"]);
});
it("uses Python Unicode offsets while retaining headings and information markers", async () => {
  const text = "# Summary\n\n🌳 [Information needed: Budget] old plan.";
  const start = Array.from(text.slice(0, text.indexOf("old"))).length;
  const container = await render(text, [edit("old", "new", start)]);
  expect(container.querySelector("h1")?.textContent).toBe("Summary");
  expect(container.querySelector("del")?.textContent).toBe("old");
  expect(container.textContent).toContain("🌳");
  expect(container.textContent).not.toContain("[Information needed:");
  expect(
    container.querySelector('[aria-label="Information needed: Budget"]'),
  ).not.toBeNull();
  expect(locateEdits(text, [edit("old", "new", start)])?.[0].offset).toBe(
    text.indexOf("old"),
  );
});

it("compacts repeated markers around a same-paragraph edit without changing input or anchors", async () => {
  const marker = "[Information needed: Confirm the budget.]";
  const text = `${marker} 🌳 old plan. ${marker}\n\n${marker}`;
  const change = Object.freeze(
    edit("old", "new", Array.from(text.slice(0, text.indexOf("old"))).length),
  );
  const changes = [change];
  const original = JSON.stringify(changes);
  const container = await render(text, changes);
  expect(
    container.querySelectorAll(
      '[data-testid="concept-note-missing-information"]',
    ),
  ).toHaveLength(3);
  expect(container.textContent).not.toContain("[Information needed:");
  expect(container.querySelector("del")?.textContent).toBe("old");
  expect(container.querySelector("ins")?.textContent).toBe("new");
  expect(JSON.stringify(changes)).toBe(original);
  expect(text.match(/\[Information needed:/g)).toHaveLength(3);
});

it.each([
  ["Budget", "Funding", "Information needed: Funding"],
  ["", "approved ", "Information needed: approved Budget"],
])(
  "renders complete old/new markers for a partial marker edit (%s)",
  async (before, after, label) => {
    const text = "Opening.\n\n[Information needed: Budget]\n\nEnding.";
    const container = await render(text, [
      edit(before, after, text.indexOf("Budget")),
    ]);
    expect(
      container.querySelector('del [aria-label="Information needed: Budget"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(`ins [aria-label="${label}"]`),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("[Information needed:");
    expect(container.textContent).toContain("Opening.");
    expect(container.textContent).toContain("Ending.");
  },
);

it("keeps markers compact in multiline block replacements and whole-marker additions", async () => {
  const text = "Before.\n\nOld paragraph. [Information needed: Cost]\n\nAfter.";
  const old = "Old paragraph. [Information needed: Cost]";
  const container = await render(text, [
    edit(
      old,
      "New paragraph.\n\n[Information needed: Evidence]",
      text.indexOf(old),
    ),
  ]);
  expect(
    container.querySelector('del [aria-label="Information needed: Cost"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('ins [aria-label="Information needed: Evidence"]'),
  ).not.toBeNull();
  expect(container.textContent).not.toContain("[Information needed:");
});

it("preserves formatted marker messages and ordinary Markdown links safely", async () => {
  const text =
    "[Information needed: Confirm the **budget** and `baseline` from https://example.com.]\n\nold [source](https://example.com).";
  const container = await render(text, [
    edit("old", "new", text.indexOf("old")),
  ]);
  expect(
    container
      .querySelector('[data-testid="concept-note-missing-information"]')
      ?.getAttribute("aria-label"),
  ).toBe(
    "Information needed: Confirm the **budget** and `baseline` from https://example.com.",
  );
  expect(container.textContent).not.toContain("[Information needed:");
  expect(
    container.querySelector('a[href="https://example.com"]')?.textContent,
  ).toBe("source");
});

it("compacts a formatted marker after an edit in the same paragraph", async () => {
  const text =
    "old plan [Information needed: Confirm the **budget**.] and [Information needed: Check `scope`.]";
  const container = await render(text, [edit("old", "new")]);
  expect(
    container.querySelectorAll(
      '[data-testid="concept-note-missing-information"]',
    ),
  ).toHaveLength(2);
  expect(
    container.querySelector(
      '[aria-label="Information needed: Confirm the **budget**."]',
    ),
  ).not.toBeNull();
  expect(container.querySelector("del")?.textContent).toBe("old");
  expect(container.textContent).not.toContain("[Information needed:");
});

it("keeps code examples literal and treats marker message HTML as text", async () => {
  const text =
    "`[Information needed: literal example]`\n\n[Information needed: <img src=x onerror=alert(1)>]\n\nold";
  const container = await render(text, [
    edit("old", "new", text.lastIndexOf("old")),
  ]);
  expect(container.querySelector("code")?.textContent).toBe(
    "[Information needed: literal example]",
  );
  expect(container.querySelector("img, script")).toBeNull();
  expect(
    container
      .querySelector('[data-testid="concept-note-missing-information"]')
      ?.getAttribute("aria-label"),
  ).toBe("Information needed: <img src=x onerror=alert(1)>");
});

it("keeps a deleted marker inspectable only on the previous side", async () => {
  const text = "Opening [Information needed: Budget] ending.";
  const container = await render(text, [
    edit("[Information needed: Budget]", "", text.indexOf("[")),
  ]);
  expect(
    container.querySelectorAll(
      'del [data-testid="concept-note-missing-information"]',
    ),
  ).toHaveLength(1);
  expect(
    container.querySelector(
      'ins [data-testid="concept-note-missing-information"]',
    ),
  ).toBeNull();
  expect(container.querySelector("ins")?.textContent).toBe("Opening  ending.");
});

it("shows inline added marker messages without interpreting other replacement markup", async () => {
  const container = await render("old", [
    edit("old", '[Information needed: <script>alert("x")</script>]'),
  ]);
  expect(
    container
      .querySelector('ins [data-testid="concept-note-missing-information"]')
      ?.getAttribute("aria-label"),
  ).toBe('Information needed: <script>alert("x")</script>');
  expect(container.querySelector("script")).toBeNull();
});
it("preserves list, emphasis, and table structure for text-node edits", async () => {
  const text =
    "- **old** park\n\n| Name | Value |\n| --- | --- |\n| old | 20 |";
  const changes = [
    edit("old", "new", text.indexOf("old")),
    edit("old", "fresh", text.lastIndexOf("old"), "table"),
  ];
  const container = await render(text, changes);
  expect(container.querySelector("li strong del")?.textContent).toBe("old");
  expect(container.querySelector("td ins")?.textContent).toBe("fresh");
});
it("redlines a complete enclosing Markdown block for syntax or cross-node changes", async () => {
  const text =
    "Unchanged opening.\n\nA **bold old** [plan](https://example.com).\n\nUnchanged ending.";
  const before = "**bold old** [plan](https://example.com)";
  const container = await render(text, [
    edit(before, "**clear new** plan", text.indexOf(before)),
  ]);
  expect(container.querySelector("del strong")?.textContent).toBe("bold old");
  expect(container.querySelector("ins strong")?.textContent).toBe("clear new");
  expect(container.textContent?.match(/Unchanged opening/g)).toHaveLength(1);
  expect(container.textContent?.match(/Unchanged ending/g)).toHaveLength(1);
});
it("offers X and tick decisions for a block-level replacement", async () => {
  const text = "Before.\n\nA **bold old** plan.\n\nAfter.";
  const before = "**bold old** plan";
  const onAcceptChange = jest.fn();
  const onRejectChange = jest.fn();
  const result = await mount(
    createElement(Inline, {
      markdown: text,
      changes: [edit(before, "**clear new** plan", text.indexOf(before))],
      lng: "en",
      components: {},
      onAcceptChange,
      onRejectChange,
    }),
    true,
  );
  root = result.root;
  await act(async () =>
    result.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-inline-accept"]',
      )!
      .click(),
  );
  expect(onAcceptChange).toHaveBeenCalledWith(["change-one"]);
  expect(
    result.container.querySelector(
      '[data-testid="concept-note-inline-reject"]',
    ),
  ).not.toBeNull();
});
it("preserves cross-paragraph changes, insertions, deletions, and escaped markup safely", async () => {
  const text = "Before.\n\nFirst old.\n\nSecond old.\n\nAfter.";
  const before = "old.\n\nSecond old";
  const container = await render(text, [
    edit(before, "new", text.indexOf(before)),
  ]);
  expect(container.querySelector("del")?.textContent).toContain("Second old");
  expect(container.querySelector("ins")?.textContent).toContain("First new.");
  expect(container.textContent).toContain("After.");
});
it("fails closed for stale, overlapping, out-of-range and missing chapter anchors", async () => {
  expect(locateEdits("old", [edit("wrong", "new")])).toBeNull();
  expect(
    locateEdits("old old", [
      edit("old", "new"),
      edit("old", "new", 0, "second"),
    ]),
  ).toBeNull();
  expect(locateEdits("old", [edit("", "new", 9)])).toBeNull();
  expect(locateEdits("old", [edit("old", "new", -1)])).toBeNull();
  expect(proposalMatchesDraft({ ...proposal, base_revisions: {} }, [])).toBe(
    false,
  );
  expect(
    proposalMatchesDraft(proposal, [
      draftChapter({ body_markdown: proposal.changes[0].before }),
    ]),
  ).toBe(true);
  const container = await render("old", [edit("wrong", "new")]);
  expect(container.querySelector("del, ins")).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "could not be placed safely",
  );
});
it("never executes raw HTML in additions and displays exact text-node replacement", async () => {
  const container = await render("old", [
    edit("old", '<script>alert("x")</script>'),
  ]);
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("ins")?.textContent).toBe(
    '<script>alert("x")</script>',
  );
});
it("creates separate minimal history hunks and reconstructs the intended snapshot", () => {
  const before =
    "First old paragraph.\n\nKeep this unchanged.\n\nFinal old paragraph.";
  const after = before.replaceAll("old", "new");
  const changes = snapshotChanges(draftChapter(), before, after);
  expect(changes).toHaveLength(2);
  expect(
    changes.every(
      (change) => change.before === "old" && change.after === "new",
    ),
  ).toBe(true);
  const located = locateEdits(before, changes)!;
  let result = before;
  for (const change of [...located].reverse())
    result =
      result.slice(0, change.offset) + change.after + result.slice(change.end);
  expect(result).toBe(after);
  expect(snapshotChanges(draftChapter(), before, before)).toEqual([]);
});
it("handles insertion/deletion and bounded large snapshot comparisons without losing bytes", async () => {
  for (const [before, after] of [
    ["", "New text"],
    ["Old text", ""],
    ["A 🌳 park", "A 🌳 green park"],
    ["unchanged ".repeat(600) + "old", "unchanged ".repeat(600) + "new"],
  ]) {
    const changes = snapshotChanges(draftChapter(), before, after);
    let result = before;
    for (const change of [...locateEdits(before, changes)!].reverse())
      result =
        result.slice(0, change.offset) +
        change.after +
        result.slice(change.end);
    expect(result).toBe(after);
  }
  const container = await render("", [edit("", "New text")]);
  expect(container.querySelector("ins")?.textContent).toBe("New text");
});

function historyReview(): DocumentReview {
  return {
    kind: "history",
    entry: historyEntry,
    operation: "undo",
    expected: { [chapterId]: 2 },
    before: { [chapterId]: historyEntry.chapters[0].after },
  };
}
async function toolbar(
  review = historyReview(),
  chapter = draftChapter({
    revision_number: 2,
    body_markdown: historyEntry.chapters[0].after,
  }),
) {
  const restore = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const apply = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const onCancel = jest.fn();
  const onNavigate = jest.fn();
  const edits = {
    proposals: [proposal],
    busy: null,
    apply,
    reject: jest.fn(),
    restore,
  } as unknown as ComponentProps<typeof Toolbar>["edits"];
  const changes = reviewChanges(review, edits.proposals, [chapter]);
  const result = await mount(
    createElement(Toolbar, {
      review,
      chapters: [chapter],
      edits,
      changes,
      lng: "en",
      onNavigate,
      onCancel,
      onOpenSources: jest.fn(),
    }),
    true,
  );
  root = result.root;
  return { ...result, restore, apply, onCancel, onNavigate, changes };
}
it("confirms history only from the document toolbar with the frozen expected vector", async () => {
  const result = await toolbar();
  await act(async () =>
    result.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-history-confirm"]',
      )!
      .click(),
  );
  expect(result.restore).toHaveBeenCalledWith(historyEntry, "undo", {
    [chapterId]: 2,
  });
  expect(result.onCancel).toHaveBeenCalledTimes(1);
  expect(result.container.querySelector("del, ins")).toBeNull();
});
it("blocks stale and no-op historical reviews and permits cancellation", async () => {
  const result = await toolbar(
    historyReview(),
    draftChapter({ revision_number: 99, body_markdown: "New current text" }),
  );
  expect(
    result.container.querySelector<HTMLButtonElement>(
      '[data-testid="concept-note-history-confirm"]',
    )!.disabled,
  ).toBe(true);
  await act(async () =>
    result.container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-history-cancel"]',
      )!
      .click(),
  );
  expect(result.onCancel).toHaveBeenCalledTimes(1);
  expect(result.restore).not.toHaveBeenCalled();
});
it("keeps the proposal toolbar separate from inline differences and blocks stale apply", async () => {
  const result = await toolbar({
    kind: "proposal",
    proposalId: proposal.proposal_id,
  });
  expect(
    result.container.querySelector<HTMLButtonElement>(
      '[data-testid="concept-note-edit-apply-all"]',
    )!.disabled,
  ).toBe(true);
  expect(result.container.querySelector("del, ins")).toBeNull();
});
it("sorts history review hunks by document chapter order", () => {
  const review = historyReview();
  if (review.kind !== "history") throw new Error("test fixture");
  const second = { ...historyEntry.chapters[0], chapter_id: "second" };
  review.entry = {
    ...historyEntry,
    chapters: [second, ...historyEntry.chapters],
  };
  review.before.second = second.after;
  review.expected.second = 2;
  const changes = reviewChanges(
    review,
    [],
    [
      draftChapter({ position: 0 }),
      draftChapter({ chapter_id: "second", position: 1 }),
    ],
  );
  expect(changes[0].chapter_id).toBe(chapterId);
});
