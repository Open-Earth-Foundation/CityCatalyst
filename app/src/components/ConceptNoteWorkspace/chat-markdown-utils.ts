/** Normalize model math delimiters without changing code examples or currency. */
export function prepareChatMarkdown(
  markdown: string,
  isStreaming = false,
): string {
  return markdown
    .split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g)
    .map((part, index) => {
      if (index % 2) return part;
      let result = "";
      let cursor = 0;
      const openings = /\\\[|\\\(|\$\$/g;
      let match: RegExpExecArray | null;
      while ((match = openings.exec(part))) {
        const opener = match[0];
        const closer =
          opener === "\\[" ? "\\]" : opener === "\\(" ? "\\)" : "$$";
        const end = part.indexOf(closer, openings.lastIndex);
        result += part.slice(cursor, match.index);
        // Wait for the closing delimiter instead of flashing incomplete TeX.
        if (end < 0)
          return result + (isStreaming ? "" : part.slice(match.index));
        const formula = part.slice(openings.lastIndex, end);
        result +=
          opener === "\\["
            ? `\n\n$$\n${formula.trim()}\n$$\n\n`
            : `$$${formula}$$`;
        cursor = end + closer.length;
        openings.lastIndex = cursor;
      }
      return result + part.slice(cursor);
    })
    .join("");
}
