import { unified } from "unified";
import remarkParse from "remark-parse";
import { formattingAttributes } from "./selection-markdown";

export interface ExportTextRun {
  text: string;
  font: "default" | "serif" | "mono";
  bold: boolean;
  italic: boolean;
}
interface InlineNode {
  type: string;
  value?: string;
  alt?: string;
  children?: InlineNode[];
}
const parser = unified().use(remarkParse);

/** Parse Markdown emphasis and strict stored spans into portable export runs. */
export function exportInlineRuns(
  markdown: string,
  spans: Record<string, string>[] = [],
  heading = false,
): ExportTextRun[] {
  const result: ExportTextRun[] = [];
  function visit(node: InlineNode, bold = heading, italic = false) {
    if (node.type === "html") {
      const attributes = formattingAttributes(node.value ?? "");
      if (attributes) spans.push(attributes);
      else if (node.value === "</span>") spans.pop();
      return;
    }
    if (["text", "inlineCode", "image"].includes(node.type)) {
      const overrides = Object.assign({}, ...spans) as Record<string, string>;
      const run: ExportTextRun = {
        text: node.value ?? node.alt ?? "",
        font:
          node.type === "inlineCode"
            ? "mono"
            : ((overrides["data-cc-font"] ??
                "default") as ExportTextRun["font"]),
        bold:
          overrides["data-cc-bold"] === undefined
            ? bold
            : overrides["data-cc-bold"] === "true",
        italic:
          overrides["data-cc-italic"] === undefined
            ? italic
            : overrides["data-cc-italic"] === "true",
      };
      const previous = result.at(-1);
      if (
        previous &&
        previous.font === run.font &&
        previous.bold === run.bold &&
        previous.italic === run.italic
      )
        previous.text += run.text;
      else if (run.text) result.push(run);
      return;
    }
    node.children?.forEach((child) =>
      visit(
        child,
        bold || node.type === "strong",
        italic || node.type === "emphasis",
      ),
    );
  }
  visit(parser.parse(markdown) as InlineNode);
  return result;
}

/** PDF standard families provide portable sans, serif and monospace faces. */
export function exportPdfFont(run: ExportTextRun): string {
  if (run.font === "serif")
    return run.bold
      ? run.italic
        ? "Times-BoldItalic"
        : "Times-Bold"
      : run.italic
        ? "Times-Italic"
        : "Times-Roman";
  const family = run.font === "mono" ? "Courier" : "Helvetica";
  return (
    family +
    (run.bold
      ? run.italic
        ? "-BoldOblique"
        : "-Bold"
      : run.italic
        ? "-Oblique"
        : "")
  );
}
