import { describe, expect, it } from "@jest/globals";
import {
  markdownToBlocks,
  parseInline,
  spansToText,
} from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/reportMarkdown";

/** Blocks as `type: flattened text`, for the cases where styling is not the point. */
const shape = (markdown: string) =>
  markdownToBlocks(markdown).map((block) =>
    block.type === "table"
      ? { type: block.type, header: block.header.map(spansToText) }
      : { type: block.type, text: spansToText(block.spans) },
  );

describe("report markdown", () => {
  it("classifies headings, bullets and paragraphs", () => {
    expect(
      shape("## Why this action\n\nIt cuts emissions.\n\n- Cheap\n- Fast"),
    ).toEqual([
      { type: "heading", text: "Why this action" },
      { type: "paragraph", text: "It cuts emissions." },
      { type: "bullet", text: "Cheap" },
      { type: "bullet", text: "Fast" },
    ]);
  });

  it("joins wrapped lines into one paragraph", () => {
    expect(shape("A sentence\nsplit over lines.")).toEqual([
      { type: "paragraph", text: "A sentence split over lines." },
    ]);
  });

  it("treats numbered lists as bullets and keeps their marker", () => {
    const blocks = markdownToBlocks("1. First\n2) Second");
    expect(blocks.map((b) => b.type)).toEqual(["bullet", "bullet"]);
    expect(blocks.map((b) => (b.type === "bullet" ? b.marker : null))).toEqual([
      "1.",
      "2.",
    ]);
  });

  it("produces nothing from empty or whitespace-only input", () => {
    expect(markdownToBlocks("")).toEqual([]);
    expect(markdownToBlocks("\n\n   \n")).toEqual([]);
  });
});

describe("inline runs", () => {
  it("keeps styling rather than flattening it", () => {
    expect(parseInline("**The ask:** Support delivery")).toEqual([
      { text: "The ask:", bold: true },
      { text: " Support delivery" },
    ]);
  });

  it("keeps a link's target, not just its text", () => {
    expect(parseInline("See [Programme page](https://x.cl/p)")).toEqual([
      { text: "See " },
      { text: "Programme page", href: "https://x.cl/p" },
    ]);
  });

  it("does not let an earlier rule swallow a later match", () => {
    // A greedy bold rule would eat everything up to the link's closing paren.
    expect(parseInline("**Bold** then [link](http://x)")).toEqual([
      { text: "Bold", bold: true },
      { text: " then " },
      { text: "link", href: "http://x" },
    ]);
  });

  it("carries outer styling into nested markup", () => {
    expect(parseInline("**bold with [a link](http://x)**")).toEqual([
      { text: "bold with ", bold: true },
      { text: "a link", bold: true, href: "http://x" },
    ]);
  });

  it("renders an image as its alt text without a stray bang", () => {
    expect(spansToText(parseInline("![Chart](http://x.png) follows"))).toBe(
      "Chart follows",
    );
  });

  it("leaves an underscore inside a word alone", () => {
    expect(spansToText(parseInline("action_id stays whole"))).toBe(
      "action_id stays whole",
    );
  });
});

// The chapter prompts emit GitHub-flavoured tables; the previous renderer had
// no table case, so this syntax was flowed into the PDF as paragraph text.
describe("tables", () => {
  const table = [
    "| What we checked | Reading | Detail |",
    "|---|---|---|",
    "| Climate benefit | Very high | Rated very high. |",
    "| City fit | Strong | Rated strong. |",
  ].join("\n");

  it("parses a header, a delimiter and rows", () => {
    const [block] = markdownToBlocks(table);
    expect(block.type).toBe("table");
    if (block.type !== "table") throw new Error("expected a table");
    expect(block.header.map(spansToText)).toEqual([
      "What we checked",
      "Reading",
      "Detail",
    ]);
    expect(block.rows).toHaveLength(2);
    expect(block.rows[1].map(spansToText)).toEqual([
      "City fit",
      "Strong",
      "Rated strong.",
    ]);
  });

  it("reads column alignment from the delimiter row", () => {
    const [block] = markdownToBlocks(
      "| Doc | Page |\n|:---|---:|\n| Plan | 88 |",
    );
    if (block.type !== "table") throw new Error("expected a table");
    expect(block.align).toEqual(["left", "right"]);
  });

  it("keeps links inside cells", () => {
    const [block] = markdownToBlocks(
      "| Opportunity | Link |\n|---|---|\n| Casa Solar | [Programme page](https://x.cl) |",
    );
    if (block.type !== "table") throw new Error("expected a table");
    expect(block.rows[0][1]).toEqual([
      { text: "Programme page", href: "https://x.cl" },
    ]);
  });

  it("squares ragged rows against the header", () => {
    const [block] = markdownToBlocks(
      "| A | B | C |\n|---|---|---|\n| only one |\n| 1 | 2 | 3 | 4 |",
    );
    if (block.type !== "table") throw new Error("expected a table");
    expect(block.rows[0].map(spansToText)).toEqual(["only one", "", ""]);
    expect(block.rows[1].map(spansToText)).toEqual(["1", "2", "3"]);
  });

  it("needs a delimiter row, so prose containing a pipe stays prose", () => {
    expect(shape("| this is not | a table\nand nor is this.")).toEqual([
      { type: "paragraph", text: "| this is not | a table and nor is this." },
    ]);
  });

  it("resumes normal parsing after the table ends", () => {
    expect(shape(`${table}\n\nAfter the table.`)).toEqual([
      { type: "table", header: ["What we checked", "Reading", "Detail"] },
      { type: "paragraph", text: "After the table." },
    ]);
  });
});
