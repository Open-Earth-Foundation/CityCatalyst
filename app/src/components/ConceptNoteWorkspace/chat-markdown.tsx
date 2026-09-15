"use client";

import { Box } from "@chakra-ui/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { prepareChatMarkdown } from "./chat-markdown-utils";

export function ChatMarkdown({
  children,
  components,
  isStreaming = false,
}: {
  children: string;
  components: Components;
  isStreaming?: boolean;
}) {
  return (
    <Box
      minW={0}
      overflowWrap="anywhere"
      css={{
        "& .katex-display": {
          overflowX: "auto",
          overflowY: "hidden",
          maxWidth: "100%",
          paddingBlock: "4px",
        },
        "& .katex": { fontSize: "1em" },
      }}
    >
      <ReactMarkdown
        components={components}
        remarkPlugins={[
          remarkGfm,
          [remarkMath, { singleDollarTextMath: false }],
        ]}
        rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore" }]]}
      >
        {prepareChatMarkdown(children, isStreaming)}
      </ReactMarkdown>
    </Box>
  );
}
