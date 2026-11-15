import { chakra } from "@chakra-ui/react";
import type { Components } from "react-markdown";

/** A renderer for the strict remark allowlist, never arbitrary source HTML/styles. */
export const DocumentFontSpan: NonNullable<Components["span"]> = ({
  node,
  children,
  ...props
}) => {
  const properties = node?.properties ?? {};
  const font = properties["data-cc-font"];
  const bold = properties["data-cc-bold"];
  const italic = properties["data-cc-italic"];
  return (
    <chakra.span
      {...props}
      fontFamily={
        font === "serif"
          ? "Georgia, serif"
          : font === "mono"
            ? "monospace"
            : font === "default"
              ? "body"
              : undefined
      }
      fontWeight={
        bold === "true" ? "bold" : bold === "false" ? "normal" : undefined
      }
      fontStyle={
        italic === "true" ? "italic" : italic === "false" ? "normal" : undefined
      }
      css={{
        ...(bold === "true" || bold === "false"
          ? { "& strong": { fontWeight: "inherit" } }
          : {}),
        ...(italic === "true" || italic === "false"
          ? { "& em": { fontStyle: "inherit" } }
          : {}),
      }}
    >
      {children}
    </chakra.span>
  );
};
