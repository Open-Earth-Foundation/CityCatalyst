interface MarkdownNode {
  type: string;
  value?: string;
  depth?: number;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hName?: string; hProperties?: Record<string, string | number> };
}

export function formattingAttributes(
  value: string,
): Record<string, string> | null {
  if (!value.startsWith("<span ") || !value.endsWith(">")) return null;
  const source = value.slice(6, -1);
  const matches = [
    ...source.matchAll(/data-cc-(font|bold|italic)="([a-z]+)"/g),
  ];
  if (!matches.length || matches.map((match) => match[0]).join(" ") !== source)
    return null;
  const properties: Record<string, string> = {};
  for (const match of matches) {
    const key = `data-cc-${match[1]}`;
    if (
      key in properties ||
      !(
        match[1] === "font" ? ["default", "serif", "mono"] : ["true", "false"]
      ).includes(match[2])
    )
      return null;
    properties[key] = match[2];
  }
  return properties;
}

/** Only our exact font markers become elements; arbitrary HTML remains inert. */
export function remarkDocumentFonts() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children) return;
      node.children.forEach(visit);
      for (let index = node.children.length - 1; index >= 0; index--) {
        const opening = node.children[index];
        const properties =
          opening.type === "html" && formattingAttributes(opening.value ?? "");
        if (!properties) continue;
        const end = node.children.findIndex(
          (child, at) =>
            at > index && child.type === "html" && child.value === "</span>",
        );
        if (end < 0) continue;
        const closing = node.children[end];
        node.children.splice(index, end - index + 1, {
          type: "documentFont",
          children: node.children.slice(index + 1, end),
          position:
            opening.position && closing.position
              ? { start: opening.position.start, end: closing.position.end }
              : undefined,
          data: { hName: "span", hProperties: properties },
        });
      }
    };
    visit(tree);
  };
}

/** Source offsets stay relative to the complete stored Markdown, including its title. */
export function remarkSelectionSource({ title }: { title: string }) {
  return (tree: MarkdownNode) => {
    const first = tree.children?.[0];
    if (
      first?.type === "heading" &&
      first.children
        ?.map((node) => node.value ?? "")
        .join("")
        .trim()
        .toLocaleLowerCase() === title.trim().toLocaleLowerCase()
    ) {
      tree.children!.shift();
    }
    const visit = (node: MarkdownNode) => {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (node.type === "text" && start !== undefined && end !== undefined) {
        node.type = "selectionText";
        node.children = [{ type: "text", value: node.value }];
        delete node.value;
        node.data = {
          hName: "span",
          hProperties: {
            "data-cc-source-start": start,
            "data-cc-source-end": end,
          },
        };
        return;
      }
      if (
        ["strong", "emphasis", "documentFont"].includes(node.type) &&
        start !== undefined &&
        end !== undefined
      ) {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            "data-cc-format-start": start,
            "data-cc-format-end": end,
          },
        };
      }
      // Gap controls and code are not editable prose selections.
      if (["link", "linkReference", "inlineCode", "code"].includes(node.type))
        return;
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
