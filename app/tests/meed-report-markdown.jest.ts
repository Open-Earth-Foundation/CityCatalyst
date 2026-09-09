import { describe, expect, it } from "@jest/globals";
import { markdownToBlocks } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/report/reportMarkdown";

describe("report markdown", () => {
  it("classifies headings, bullets and paragraphs", () => {
    expect(
      markdownToBlocks("## Why this action\n\nIt cuts emissions.\n\n- Cheap\n- Fast"),
    ).toEqual([
      { type: "heading", text: "Why this action" },
      { type: "paragraph", text: "It cuts emissions." },
      { type: "bullet", text: "Cheap" },
      { type: "bullet", text: "Fast" },
    ]);
  });

  it("joins wrapped lines into one paragraph", () => {
    expect(markdownToBlocks("A sentence\nsplit over lines.")).toEqual([
      { type: "paragraph", text: "A sentence split over lines." },
    ]);
  });

  it("keeps the visible text of inline markup", () => {
    const [block] = markdownToBlocks("**Bold**, _italic_, `code` and [a link](http://x)");
    expect(block.text).toBe("Bold, italic, code and a link");
  });

  it("treats numbered lists as bullets", () => {
    expect(markdownToBlocks("1. First\n2) Second")).toEqual([
      { type: "bullet", text: "First" },
      { type: "bullet", text: "Second" },
    ]);
  });

  it("produces nothing from empty or whitespace-only input", () => {
    expect(markdownToBlocks("")).toEqual([]);
    expect(markdownToBlocks("\n\n   \n")).toEqual([]);
  });
});
