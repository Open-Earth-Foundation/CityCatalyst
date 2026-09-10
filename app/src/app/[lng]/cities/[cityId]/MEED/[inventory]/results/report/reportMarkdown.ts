/**
 * Flattens chapter Markdown into blocks a PDF can lay out.
 *
 * jsPDF draws text, not Markdown, so the body has to become a sequence of
 * typed blocks first. This is deliberately a small subset — headings, bullets,
 * paragraphs — rather than a Markdown engine: the chapters are prose with the
 * occasional list, and a partial renderer that silently mangles anything richer
 * would be worse than one whose limits are stated.
 *
 * Inline emphasis markers are stripped rather than honoured, because jsPDF
 * changes weight per `text()` call and mid-line switching would cost far more
 * than it returns here.
 */
export type MeedReportBlockType = "heading" | "bullet" | "paragraph";

export interface MeedReportBlock {
  type: MeedReportBlockType;
  text: string;
}

/** `**bold**`, `*italic*`, `` `code` `` and links → their visible text. */
function stripInline(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .trim();
}

export function markdownToBlocks(markdown: string): MeedReportBlock[] {
  const blocks: MeedReportBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", text: stripInline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();

    if (line.length === 0) {
      flush();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({ type: "heading", text: stripInline(heading[1]) });
      continue;
    }
    const bullet =
      line.match(/^[-*+]\s+(.*)$/) ?? line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet) {
      flush();
      blocks.push({ type: "bullet", text: stripInline(bullet[1]) });
      continue;
    }
    paragraph.push(line);
  }

  flush();
  return blocks.filter((b) => b.text.length > 0);
}
